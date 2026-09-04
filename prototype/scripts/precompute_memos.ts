// Pre-generate 실사 메모 for the demo scenarios (offline fallback for the MemoPanel).
// Usage (key never touches the repo):
//   $env:OPENROUTER_API_KEY="sk-or-..."; node node_modules/tsx/dist/cli.mjs scripts/precompute_memos.ts
// Optional: OPENROUTER_MODEL (default minimax/minimax-m3:free), GEMINI_API_KEY instead of OpenRouter.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/lib/csv';
import { scoreSite } from '../src/scoring/engine';
import { buildMemoPrompt } from '../src/genai/prompts';
import type { AppData, CaseRow, NewsSignalFile, PermitDelayFile, RegulationRow, Scenario } from '../src/types';

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
  const regsRaw = parseCsv(readFileSync(join(DATA_DIR, 'regulations.csv'), 'utf-8'));
  return {
    emdPower: readJson('emd_power.json'),
    emdCentroids: readJson('emd_centroids.json'),
    substations: readJson('substations_osm.json'),
    schools: readJson('schools.json'),
    popGrid: readJson('pop_grid.json'),
    dcStats: readJson('dc_stats.json'),
    constants: readJson('constants.json'),
    scenarios: readJson<{ scenarios: Scenario[] }>('scenarios.json').scenarios,
    cases: casesRaw.map((r) => ({
      ...r, lat: Number(r.lat), lng: Number(r.lng), delay_months: Number(r.delay_months),
    })) as unknown as CaseRow[],
    regulations: regsRaw.map((r) => ({ ...r, deduction: Number(r.deduction) })) as unknown as RegulationRow[],
    permitDelay: readJsonOrNull<PermitDelayFile>('permit_delay.json'),
    newsSignal: readJsonOrNull<NewsSignalFile>('news_signal.json'),
  };
}

async function callOpenRouter(prompt: string, key: string, model: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'X-Title': 'The Grand Site DC',
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? '';
}

async function callGemini(prompt: string, key: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

function stripThinking(t: string): string {
  return t.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

async function main() {
  const orKey = process.env.OPENROUTER_API_KEY;
  const gmKey = process.env.GEMINI_API_KEY;
  if (!orKey && !gmKey) throw new Error('set OPENROUTER_API_KEY or GEMINI_API_KEY in the environment');
  const model = orKey
    ? process.env.OPENROUTER_MODEL || 'minimax/minimax-m3:free'
    : process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  console.log(`provider=${orKey ? 'openrouter' : 'gemini'} model=${model}`);

  const data = loadData();
  const fin = data.constants.scoring.finance;
  const memos: Record<string, string> = {};
  for (const sc of data.scenarios) {
    const input = {
      lat: sc.lat, lng: sc.lng, landUse: sc.landUse,
      capexKrw: fin.defaultCapexKrw, annualRate: fin.defaultAnnualRate,
    };
    const result = scoreSite(input, data);
    const prompt = buildMemoPrompt(data, input, result, { lat: sc.lat, lng: sc.lng, label: sc.name });
    process.stdout.write(`${sc.id} (grade ${result.composite.grade}) ... `);
    const raw = orKey ? await callOpenRouter(prompt, orKey, model) : await callGemini(prompt, gmKey!, model);
    const text = stripThinking(raw);
    if (text.length < 200) throw new Error(`${sc.id}: response too short (${text.length} chars)`);
    memos[sc.id] = text;
    console.log(`${text.length} chars`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  const json = JSON.stringify(memos, null, 1);
  for (const f of OUT_FILES) writeFileSync(f, json, 'utf-8');
  console.log(`saved ${OUT_FILES.join(' , ')}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
