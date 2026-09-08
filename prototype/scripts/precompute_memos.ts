import { memoContextKey } from '../src/genai/memoContext';
import type { PrecomputedFile } from '../src/genai/llmClient';
// Pre-generate the 실사 체크리스트 opinions for the fixture points (offline fallback for MemoPanel).
// Usage (the key never touches the repo):
//   OPENROUTER_API_KEY="sk-or-..." node node_modules/tsx/dist/cli.mjs scripts/precompute_memos.ts
// Optional: OPENROUTER_MODEL (default google/gemma-4-31b-it:free) — match the deployed LLM_MODEL.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/lib/csv';
import { defaultProject, emptyConditions } from '../src/lib/reviewInputs';
import { scoreSite } from '../src/scoring/engine';
import { decodeTerrain } from '../src/scoring/terrain';
import { decodeProtectedZones } from '../src/scoring/restriction';
import { CHECKLIST_KEYS, buildChecklist } from '../src/report/checklist';
import { buildMemoPrompt } from '../src/genai/prompts';
import { parseMemo, stripThinking } from '../src/genai/memoFormat';
import type {
  AppData,
  CaseRow,
  NewsSignalFile,
  PermitDelayFile,
  ProtectedZonesFile,
  RegulationRow,
  Scenario,
  TerrainGridFile,
} from '../src/types';

const ROOT = join(import.meta.dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const OUT_FILES = [
  join(DATA_DIR, 'precomputed_memos.json'),
  join(ROOT, '..', 'data-pack', 'out', 'precomputed_memos.json'),
];

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')) as T;
}

function readJsonOrNull<T>(name: string): T | null {
  return existsSync(join(DATA_DIR, name)) ? readJson<T>(name) : null;
}

function loadData(): AppData {
  const casesRaw = parseCsv(readFileSync(join(DATA_DIR, 'cases.csv'), 'utf-8'));
  const regsRaw = parseCsv(
    readFileSync(join(DATA_DIR, 'regulations.csv'), 'utf-8'),
  );
  const terrainFile = readJsonOrNull<TerrainGridFile>('terrain_grid.json');
  const zonesFile = readJsonOrNull<ProtectedZonesFile>('protected_zones.json');
  return {
    emdPower: readJson('emd_power.json'),
    emdCentroids: readJson('emd_centroids.json'),
    substations: readJson('substations_osm.json'),
    schools: readJson('schools.json'),
    popGrid: readJson('pop_grid.json'),
    households: readJsonOrNull('households_grid.json'),
    dcStats: readJson('dc_stats.json'),
    constants: readJson('constants.json'),
    cases: casesRaw.map((r) => ({
      ...r,
      lat: Number(r.lat),
      lng: Number(r.lng),
      delay_months: Number(r.delay_months),
    })) as unknown as CaseRow[],
    regulations: regsRaw.map((r) => ({
      ...r,
      deduction: Number(r.deduction),
    })) as unknown as RegulationRow[],
    permitDelay: readJsonOrNull<PermitDelayFile>('permit_delay.json'),
    newsSignal: readJsonOrNull<NewsSignalFile>('news_signal.json'),
    terrain: terrainFile ? decodeTerrain(terrainFile) : null,
    protectedZones: zonesFile ? decodeProtectedZones(zonesFile) : null,
  };
}

async function callOpenRouter(
  prompt: string,
  key: string,
  model: string,
): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Title': 'The Grand Site DC',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 4000,
      reasoning: { enabled: false },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok)
    throw new Error(
      `openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  const j = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return j.choices?.[0]?.message?.content ?? '';
}

async function main() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('set OPENROUTER_API_KEY in the environment');
  const model = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
  console.log(`provider=openrouter model=${model}`);

  const data = loadData();
  // scenarios.json is a fixture: the app no longer loads it, but the demo points still define
  // which coordinates get an offline memo.
  const scenarios = readJson<{ scenarios: Scenario[] }>(
    'scenarios.json',
  ).scenarios;

  const memos: PrecomputedFile['memos'] = {};

  for (const sc of scenarios) {
    const input = {
      lat: sc.lat,
      lng: sc.lng,
      landUse: sc.landUse,
      project: defaultProject(data.constants),
      conditions: emptyConditions(),
    };
    const result = scoreSite(input, data);
    const landUseSource =
      sc.landUse === 'unknown' ? ('unknown' as const) : ('manual' as const);
    const rows = buildChecklist(result, data, {
      input,
      landUseSource,
      zoningName: null,
    });
    const prompt = buildMemoPrompt(data, input, result, rows, {
      site: { lat: sc.lat, lng: sc.lng, label: sc.name, source: 'emd' },
      landUseSource,
      zoningName: null,
    });

    process.stdout.write(`${sc.id} (grade ${result.composite.grade}) ... `);
    let text = '';
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      text = stripThinking(await callOpenRouter(prompt, key, model));
      if (parseMemo(text).complete) break;
      if (attempt === 1) {
        process.stdout.write('incomplete, retrying ... ');
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
    const parsed = parseMemo(text);
    if (!parsed.complete) {
      throw new Error(
        `${sc.id}: response missing item sections (${Object.keys(parsed.items).length}/${CHECKLIST_KEYS.length})`,
      );
    }
    memos[sc.id] = {
      lat: sc.lat,
      lng: sc.lng,
      landUse: sc.landUse,
      contextKey: await memoContextKey(input, result, rows),
      text,
    };
    console.log(`${text.length} chars`);
    await new Promise((r) => setTimeout(r, 4000));
  }

  const json = JSON.stringify(
    { version: 4, model, generatedAt: new Date().toISOString(), memos },
    null,
    1,
  );
  for (const f of OUT_FILES) writeFileSync(f, json, 'utf-8');
  console.log(`saved ${OUT_FILES.join(' , ')}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
