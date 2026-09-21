// Generate one review candidate; publication is a separate, manual step.
// Usage (with credentials already configured securely in the environment):
//   node node_modules/tsx/dist/cli.mjs scripts/precompute_memos.ts --output /existing/folder/new-candidate.json
import * as fs from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ApiError, boundedBytes, cancelBody, cleanString, isRecord, Operation, serviceCoordinate } from '../api/_http.js';
import { parseBundleCsv, parseBundleJson } from '../src/lib/bundleValidation';
import { defaultProject, emptyConditions } from '../src/lib/reviewInputs';
import { scoreSite } from '../src/scoring/engine';
import { decodeTerrain } from '../src/scoring/terrain';
import { decodeProtectedZones } from '../src/scoring/restriction';
import { buildChecklist } from '../src/report/checklist';
import { buildMemoPrompt, promptSizeIssue } from '../src/genai/prompts';
import { parseMemo, stripThinking } from '../src/genai/memoFormat';
import { buildMemoFacts, validateMemo } from '../src/genai/memoValidation';
import { memoContextKey } from '../src/genai/memoContext';
import type { PrecomputedFile } from '../src/genai/llmClient';
import type { AppData, CaseRow, LandUse, ProtectedZonesFile, RegulationRow, ScoreInput, TerrainGridFile } from '../src/types';

const ROOT = resolve(import.meta.dirname, '..');
export const FREE_MODELS = [
  'google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free',
  'google/gemma-4-26b-a4b-it:free', 'openrouter/free',
] as const;
const OVERALL_MS = 55_000;
const INPUT_MAX_BYTES = 96 * 1024, OUTPUT_MAX_BYTES = 128 * 1024;
const RESPONSE_MAX_BYTES = 1024 * 1024, CANDIDATE_MAX_BYTES = 2 * 1024 * 1024;
const enc = new TextEncoder();
const USAGE = '사용법: node node_modules/tsx/dist/cli.mjs scripts/precompute_memos.ts --output <새 후보 파일 경로>\n기존 부모 폴더와 안전하게 설정된 OPENROUTER_API_KEY가 필요합니다. OPENROUTER_MODEL은 선택입니다.\n생성 후보는 배포되지 않습니다. docs/PRECOMPUTED_MEMOS.md의 검수 절차를 따르세요.';
const SAFE_CODES = new Set([
  'INVALID_ARGUMENTS', 'INVALID_CONFIG', 'INVALID_FIXTURES', 'LOCAL_DATA_INVALID',
  'OUTPUT_PATH_INVALID', 'OUTPUT_EXISTS', 'OUTPUT_WRITE_FAILED', 'INPUT_TOO_LARGE',
  'UPSTREAM_INVALID', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_TIMEOUT', 'REQUEST_CANCELLED',
  'UPSTREAM_EMPTY', 'UPSTREAM_INCOMPLETE', 'OUTPUT_TOO_LARGE', 'MEMO_INVALID', 'GENERATION_FAILED',
]);
export class PrecomputeError extends Error {
  constructor(code: string) { super(SAFE_CODES.has(code) ? code : 'GENERATION_FAILED'); }
}
function failure(code: string): never { throw new PrecomputeError(code); }
function safeError(error: unknown): PrecomputeError {
  if (error instanceof PrecomputeError) return error;
  if (error instanceof ApiError && SAFE_CODES.has(error.code)) return new PrecomputeError(error.code);
  return new PrecomputeError('GENERATION_FAILED');
}
function checkCancelled(signal: AbortSignal) { if (signal.aborted) failure('REQUEST_CANCELLED'); }

export function validateConfig(env: Record<string, string | undefined>) {
  const key = env.OPENROUTER_API_KEY;
  const model = env.OPENROUTER_MODEL ?? FREE_MODELS[0];
  if (!key || !cleanString(key, 512) || /\s/.test(key) || !FREE_MODELS.some(allowed => allowed === model)) failure('INVALID_CONFIG');
  return { key, model };
}

export interface Fixture { id: string; name: string; lat: number; lng: number; landUse: LandUse }
export function validateFixtures(value: unknown): Fixture[] {
  if (!isRecord(value) || !Array.isArray(value.scenarios) || !value.scenarios.length) failure('INVALID_FIXTURES');
  const ids = new Set<string>();
  return value.scenarios.map((row: unknown) => {
    if (!isRecord(row) || typeof row.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.id) || row.id.length > 80 ||
      !cleanString(row.name, 200) || !row.name.trim() || typeof row.lat !== 'number' || typeof row.lng !== 'number' ||
      !serviceCoordinate(row.lat, row.lng) || !['industrial', 'semiIndustrial', 'commercial', 'green', 'residential', 'unknown'].includes(row.landUse as string) ||
      ids.has(row.id)) failure('INVALID_FIXTURES');
    ids.add(row.id);
    return { id: row.id, name: row.name, lat: row.lat, lng: row.lng, landUse: row.landUse as LandUse };
  });
}

/** Missing optional data stays unknown; corrupt optional data stops candidate generation. */
export function loadData(dataDir: string): AppData {
  const read = (name: string) => fs.readFileSync(join(dataDir, name), 'utf-8');
  const json = <T,>(name: string): T => parseBundleJson<T>(name, read(name));
  const optional = <T,>(name: string): T | null => {
    try { return json<T>(name); }
    catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return null;
      throw error;
    }
  };
  try {
    const cases = parseBundleCsv('cases.csv', read('cases.csv'));
    const regulations = parseBundleCsv('regulations.csv', read('regulations.csv'));
    const terrain = optional<TerrainGridFile>('terrain_grid.json');
    const zones = optional<ProtectedZonesFile>('protected_zones.json');
    return {
      emdPower: json('emd_power.json'), emdCentroids: json('emd_centroids.json'),
      substations: json('substations_osm.json'), schools: json('schools.json'), popGrid: json('pop_grid.json'),
      households: optional('households_grid.json'), dcStats: json('dc_stats.json'),
      dataCenters: optional('data_centers.json'), constants: json('constants.json'),
      cases: cases.map(row => ({ ...row, lat: Number(row.lat), lng: Number(row.lng), delay_months: Number(row.delay_months) })) as unknown as CaseRow[],
      regulations: regulations.map(row => ({ ...row, deduction: Number(row.deduction) })) as unknown as RegulationRow[],
      permitDelay: optional('permit_delay.json'), newsSignal: optional('news_signal.json'),
      terrain: terrain ? decodeTerrain(terrain) : null, protectedZones: zones ? decodeProtectedZones(zones) : null,
    };
  } catch { return failure('LOCAL_DATA_INVALID'); }
}

export function prepareFixture(fixture: Fixture, data: AppData) {
  // Match ReviewApp before scoring, including provenance and absent online evidence.
  const input: ScoreInput = {
    lat: fixture.lat, lng: fixture.lng, landUse: fixture.landUse,
    landUseSource: fixture.landUse === 'unknown' ? 'unknown' : 'manual',
    project: defaultProject(data.constants), conditions: emptyConditions(),
    zoning: null, restrictions: null, disaster: null,
  };
  const result = scoreSite(input, data);
  const context = { landUseSource: input.landUseSource!, zoningName: null };
  const rows = buildChecklist(result, data, { input, ...context });
  const prompt = buildMemoPrompt(data, input, result, rows, {
    site: { lat: fixture.lat, lng: fixture.lng, label: fixture.name, source: 'emd' }, ...context,
  });
  return { fixture, input, result, rows, prompt, facts: buildMemoFacts(result, rows, data) };
}

function requestBody(prompt: string, model: string): string {
  if (promptSizeIssue(prompt)) failure('INPUT_TOO_LARGE');
  const body = JSON.stringify({ model, stream: false, temperature: 0.3, max_tokens: 4000,
    reasoning: { enabled: false }, messages: [{ role: 'user', content: prompt }],
  });
  if (enc.encode(body).byteLength > INPUT_MAX_BYTES) failure('INPUT_TOO_LARGE');
  return body;
}

export async function callOpenRouter(prompt: string, config: { key: string; model: string }, signal: AbortSignal, fetcher: typeof fetch): Promise<string> {
  validateConfig({ OPENROUTER_API_KEY: config.key, OPENROUTER_MODEL: config.model });
  const body = requestBody(prompt, config.model);
  const operation = new Operation(signal, OVERALL_MS);
  let observed: Response | undefined;
  try {
    operation.check();
    const pending = fetcher('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: operation.signal, redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}`, 'X-Title': 'The Grand Site DC' }, body,
    });
    void pending.then(response => {
      observed = response;
      if (operation.signal.aborted) cancelBody(response.body);
    }, () => {});
    const response = await operation.wait(pending);
    operation.check();
    if (!response.ok) failure('UPSTREAM_UNAVAILABLE');
    if (!response.body || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') failure('UPSTREAM_INVALID');
    const bytes = await boundedBytes(response, operation, RESPONSE_MAX_BYTES, new ApiError('OUTPUT_TOO_LARGE'));
    operation.check();
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return failure('UPSTREAM_INVALID'); }
    if (!isRecord(value)) failure('UPSTREAM_INVALID');
    if (value.error !== undefined) failure('UPSTREAM_UNAVAILABLE');
    if (!Array.isArray(value.choices) || value.choices.length !== 1 || !isRecord(value.choices[0])) failure('UPSTREAM_INVALID');
    const choice = value.choices[0];
    if (choice.error !== undefined && choice.error !== null || choice.finish_reason === 'error') failure('UPSTREAM_UNAVAILABLE');
    if (choice.finish_reason !== 'stop') failure('UPSTREAM_INCOMPLETE');
    if (!isRecord(choice.message) || typeof choice.message.content !== 'string') failure('UPSTREAM_INVALID');
    const text = choice.message.content;
    if (enc.encode(text).byteLength > OUTPUT_MAX_BYTES) failure('OUTPUT_TOO_LARGE');
    if (!text.trim()) failure('UPSTREAM_EMPTY');
    return text;
  } catch (error) {
    if (operation.signal.aborted) throw safeError(operation.signal.reason);
    if (error instanceof PrecomputeError || error instanceof ApiError) throw safeError(error);
    return failure('UPSTREAM_UNAVAILABLE');
  } finally {
    operation.abort();
    operation.dispose();
    if (observed) cancelBody(observed.body);
  }
}

/** Resolve existing parents, reject symlink aliases of deployment paths, never create directories. */
export function validateOutputPath(output: string, root = ROOT): string {
  try {
    if (!cleanString(output, 4096) || !output.trim()) failure('OUTPUT_PATH_INVALID');
    const target = resolve(output);
    const canonical = join(fs.realpathSync(dirname(target)), basename(target));
    const protectedPaths = [join(root, 'public/data/precomputed_memos.json'), join(root, '../data-pack/out/precomputed_memos.json')];
    for (const protectedPath of protectedPaths) {
      const normalized = resolve(protectedPath);
      let protectedCanonical = normalized;
      try { protectedCanonical = join(fs.realpathSync(dirname(normalized)), basename(normalized)); } catch { /* A missing protected parent is still protected lexically. */ }
      // Case-insensitive aliases also resolve to the protected names on common macOS volumes.
      if (target.toLowerCase() === normalized.toLowerCase() || canonical.toLowerCase() === protectedCanonical.toLowerCase()) failure('OUTPUT_PATH_INVALID');
    }
    try { fs.lstatSync(canonical); failure('OUTPUT_EXISTS'); }
    catch (error) { if (!isRecord(error) || error.code !== 'ENOENT') throw error; }
    fs.accessSync(dirname(canonical), fs.constants.W_OK);
    return canonical;
  } catch (error) { if (error instanceof PrecomputeError) throw error; return failure('OUTPUT_PATH_INVALID'); }
}

/** Exclusive creation prevents a preflight/write race from replacing an existing file. */
export function saveCandidate(target: string, text: string, write = (fd: number, value: string) => fs.writeFileSync(fd, value, 'utf-8')) {
  let fd: number | undefined;
  let identity: fs.Stats | undefined;
  try {
    fd = fs.openSync(target, 'wx', 0o600);
    identity = fs.fstatSync(fd);
    write(fd, text);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
  } catch {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Keep the fixed failure below. */ } }
    if (identity) {
      try {
        const current = fs.lstatSync(target);
        if (current.dev === identity.dev && current.ino === identity.ino) fs.unlinkSync(target);
      } catch { /* Cleanup can fail; a partial new candidate must never be published. */ }
    }
    failure('OUTPUT_WRITE_FAILED');
  }
}

export interface GenerateOptions {
  output: string;
  env: Record<string, string | undefined>;
  signal: AbortSignal;
  fetcher: typeof fetch;
  root?: string;
}
export async function generateCandidate(options: GenerateOptions): Promise<void> {
  const root = options.root ?? ROOT;
  checkCancelled(options.signal);
  const target = validateOutputPath(options.output, root);
  const config = validateConfig(options.env);
  const dataDir = join(root, 'public/data');
  let fixtures: Fixture[];
  try { fixtures = validateFixtures(JSON.parse(fs.readFileSync(join(dataDir, 'scenarios.json'), 'utf-8'))); }
  catch (error) { if (error instanceof PrecomputeError) throw error; return failure('LOCAL_DATA_INVALID'); }
  const data = loadData(dataDir);
  const prepared = fixtures.map(fixture => prepareFixture(fixture, data));
  // Validate every prompt before spending even one request on this batch.
  for (const job of prepared) requestBody(job.prompt, config.model);
  const memos: PrecomputedFile['memos'] = {};
  for (const job of prepared) {
    checkCancelled(options.signal);
    const text = stripThinking(await callOpenRouter(job.prompt, config, options.signal, options.fetcher));
    const parsed = parseMemo(text);
    if (!parsed.complete || parsed.error || validateMemo(parsed, job.facts).length !== 0) failure('MEMO_INVALID');
    const contextKey = await memoContextKey(job.input, job.result, job.rows);
    checkCancelled(options.signal);
    memos[job.fixture.id] = { lat: job.input.lat, lng: job.input.lng, landUse: job.input.landUse, contextKey, text };
  }
  const file: PrecomputedFile = { version: 4, model: config.model, generatedAt: new Date().toISOString(), memos };
  const json = JSON.stringify(file, null, 1);
  if (enc.encode(json).byteLength > CANDIDATE_MAX_BYTES) failure('OUTPUT_TOO_LARGE');
  checkCancelled(options.signal);
  // Recheck protected paths and existence after the network wait, then exclusively create.
  if (validateOutputPath(options.output, root) !== target) failure('OUTPUT_PATH_INVALID');
  saveCandidate(target, json);
}

interface CliDependencies {
  env?: () => Record<string, string | undefined>;
  fetcher?: typeof fetch;
  root?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  signals?: Pick<NodeJS.Process, 'on' | 'off'>;
}
export async function runCli(args: string[], deps: CliDependencies = {}): Promise<number> {
  const stdout = deps.stdout ?? console.log, stderr = deps.stderr ?? console.error;
  if (args.length === 1 && args[0] === '--help') { stdout(USAGE); return 0; }
  if (args.length !== 2 || args[0] !== '--output' || !args[1] || args[1].startsWith('--')) { stderr(USAGE); return 2; }
  const controller = new AbortController();
  const signals = deps.signals ?? process;
  const abort = () => controller.abort();
  signals.on('SIGINT', abort); signals.on('SIGTERM', abort);
  try {
    await generateCandidate({ output: args[1], env: (deps.env ?? (() => process.env))(), signal: controller.signal,
      fetcher: deps.fetcher ?? fetch, root: deps.root });
    stdout('CANDIDATE_SAVED: 후보 생성 완료. 게시 전 내용과 현재 평가 서명을 검수하세요.');
    return 0;
  } catch (error) {
    stderr(`PRECOMPUTE_FAILED: ${safeError(error).message}`);
    return 1;
  } finally { signals.off('SIGINT', abort); signals.off('SIGTERM', abort); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
}
