import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  callOpenRouter, FREE_MODELS, generateCandidate, loadData, prepareFixture, runCli,
  saveCandidate, validateConfig, validateFixtures, validateOutputPath,
} from '../../../scripts/precompute_memos';
import { CHECKLIST_KEYS, buildChecklist } from '../../report/checklist';
import { memoContextKey } from '../../genai/memoContext';
import { defaultProject, emptyConditions } from '../../lib/reviewInputs';
import { scoreSite } from '../../scoring/engine';
import { loadAppData } from '../loadData';
import type { PrecomputedFile } from '../../genai/llmClient';
import type { ScoreInput } from '../../types';

const prototype = resolve(import.meta.dirname, '../../..');
const bundleDir = join(prototype, 'public/data');
const key = 'synthetic-test-key';
const canary = 'UNTRUSTED_RAW_CANARY';
const config = { key, model: 'google/gemma-4-31b-it:free' };
const env = { OPENROUTER_API_KEY: key };
const fixtures = JSON.parse(fs.readFileSync(join(bundleDir, 'scenarios.json'), 'utf-8')).scenarios;
const memo = [
  '## OVERALL\n추가 자료를 확인하세요.',
  ...CHECKLIST_KEYS.map(name => `## ITEM ${name}\n공개자료를 확인하고 담당기관과 협의가 필요합니다.`),
  '## ACTIONS\n- 담당기관과 협의하세요.', '## CAVEATS\n- 확정 판단은 후속 검토가 필요합니다.',
].join('\n');
const payload = (content: unknown = memo, finish: unknown = 'stop') => ({ choices: [{ message: { role: 'assistant', content }, finish_reason: finish }] });
const ok = (content: unknown = memo, finish: unknown = 'stop') => Response.json(payload(content, finish));
const controller = () => new AbortController();
const fetchResponse = (response: Response) => vi.fn<typeof fetch>().mockResolvedValue(response);
const call = (fetcher: typeof fetch, signal = controller().signal, prompt = '검토 의견') => callOpenRouter(prompt, config, signal, fetcher);
let sandbox: string, root: string, output: string;
let blockedNetwork: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // No test can accidentally use the host's real fetch or environment credentials.
  blockedNetwork = vi.fn(() => { throw Error('External network forbidden in this suite'); });
  vi.stubGlobal('fetch', blockedNetwork);
  sandbox = fs.mkdtempSync(join(tmpdir(), 'precompute-memos-'));
  root = join(sandbox, 'prototype');
  fs.mkdirSync(join(root, 'public/data'), { recursive: true });
  fs.mkdirSync(join(sandbox, 'data-pack/out'), { recursive: true });
  output = join(sandbox, 'new-candidate.json');
});
afterEach(() => {
  expect(blockedNetwork).not.toHaveBeenCalled();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  fs.rmSync(sandbox, { recursive: true, force: true });
});
function installBundle(scenarios: unknown = fixtures.slice(0, 1)) {
  for (const name of fs.readdirSync(bundleDir)) {
    if (name === 'scenarios.json' || name === 'precomputed_memos.json') continue;
    fs.symlinkSync(join(bundleDir, name), join(root, 'public/data', name));
  }
  fs.writeFileSync(join(root, 'public/data/scenarios.json'), JSON.stringify({ scenarios }));
}
function generation(fetcher: typeof fetch, options: Partial<Parameters<typeof generateCandidate>[0]> = {}) {
  return generateCandidate({ output, env, signal: controller().signal, fetcher, root, ...options });
}
function cli(fetcher: typeof fetch, args = ['--output', output], fakeEnv = env) {
  const stdout = vi.fn(), stderr = vi.fn(), signals = new EventEmitter() as NodeJS.Process;
  const getEnv = vi.fn(() => fakeEnv);
  const result = runCli(args, { root, fetcher, env: getEnv, stdout, stderr, signals });
  return { result, stdout, stderr, signals, getEnv };
}
function expectProtectedPair() {
  expect(fs.readFileSync(join(root, 'public/data/precomputed_memos.json'), 'utf-8')).toBe('original-one');
  expect(fs.readFileSync(join(sandbox, 'data-pack/out/precomputed_memos.json'), 'utf-8')).toBe('original-two');
}
function installProtectedPair() {
  fs.writeFileSync(join(root, 'public/data/precomputed_memos.json'), 'original-one');
  fs.writeFileSync(join(sandbox, 'data-pack/out/precomputed_memos.json'), 'original-two');
}

describe('precompute explicit invocation and preflight', () => {
  it('actual CLI entry prints usage without configured credentials or file changes', () => {
    for (const [args, code] of [[['--help'], 0], [[], 2]] as [string[], number][]) {
      const child = spawnSync(process.execPath, [join(prototype, 'node_modules/tsx/dist/cli.mjs'), join(prototype, 'scripts/precompute_memos.ts'), ...args], {
        cwd: sandbox, env: {}, encoding: 'utf-8', timeout: 10_000,
      });
      expect(child.status).toBe(code); expect(child.stdout + child.stderr).toContain('사용법:');
      expect(child.stdout + child.stderr).not.toContain('PRECOMPUTE_FAILED');
      expect(fs.existsSync(output)).toBe(false);
    }
  });
  it.each([[[], 2], [['--help'], 0], [['--output'], 2], [['--bogus', canary], 2], [['--output', 'candidate.json', '--help'], 2]] as [string[], number][])('usage only for %j', async (args, code) => {
    const fetcher = vi.fn<typeof fetch>();
    const c = cli(fetcher, args);
    expect(await c.result).toBe(code);
    expect(c.getEnv).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    expect(c.signals.listenerCount('SIGINT') + c.signals.listenerCount('SIGTERM')).toBe(0);
    expect(JSON.stringify([c.stdout.mock.calls, c.stderr.mock.calls])).not.toContain(canary);
    expect(fs.existsSync(output)).toBe(false);
  });
  it.each([undefined, '', ' ', 'bad\nkey', 'bad key', 'x'.repeat(513)])('rejects invalid key before request: %j', async invalid => {
    installBundle(); const fetcher = vi.fn<typeof fetch>();
    await expect(generation(fetcher, { env: { OPENROUTER_API_KEY: invalid } })).rejects.toThrow('INVALID_CONFIG');
    expect(fetcher).not.toHaveBeenCalled(); expect(fs.existsSync(output)).toBe(false);
  });
  it.each(['', 'paid/model', 'other/free:free', `model\n${canary}`, ' openrouter/free'])('rejects model outside exact allowlist', async model => {
    installBundle(); const fetcher = vi.fn<typeof fetch>();
    const c = cli(fetcher, undefined, { ...env, OPENROUTER_MODEL: model } as typeof env);
    expect(await c.result).toBe(1); expect(fetcher).not.toHaveBeenCalled();
    expect(c.stderr).toHaveBeenCalledExactlyOnceWith('PRECOMPUTE_FAILED: INVALID_CONFIG');
  });
  it('allows exactly the four runtime free identifiers without importing its handler', () => {
    const expected = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-26b-a4b-it:free', 'openrouter/free'];
    expect([...FREE_MODELS]).toEqual(expected);
    for (const model of expected) expect(validateConfig({ ...env, OPENROUTER_MODEL: model })).toEqual({ key, model });
    const source = fs.readFileSync(join(prototype, 'api/generate.ts'), 'utf-8');
    const defaultModel = /const DEFAULT_MODEL = '([^']+)'/.exec(source)![1];
    const list = /const FREE_MODELS = new Set\(\[([^\]]+)\]/.exec(source)![1];
    expect([defaultModel, ...Array.from(list.matchAll(/'([^']+)'/g), match => match[1])]).toEqual(expected);
    expect(fs.readFileSync(join(prototype, 'scripts/precompute_memos.ts'), 'utf-8')).not.toMatch(/from ['"][^'"]*api\/generate/);
  });
  it.each([
    [], [fixtures[0], fixtures[0]], [{ ...fixtures[0], id: '__proto__' }], [{ ...fixtures[0], id: `bad\n${canary}` }],
    [{ ...fixtures[0], name: '' }], [{ ...fixtures[0], name: 'x\n' }], [{ ...fixtures[0], lat: '37' }],
    [{ ...fixtures[0], lat: null }], [{ ...fixtures[0], lat: 40 }], [{ ...fixtures[0], lng: 133 }],
    [{ ...fixtures[0], landUse: 'invalid' }], [null], null,
  ].map(scenarios => [scenarios]))('rejects invalid fixtures before requests %j', async scenarios => {
    installBundle(scenarios); const fetcher = vi.fn<typeof fetch>();
    await expect(generation(fetcher)).rejects.toThrow('INVALID_FIXTURES'); expect(fetcher).not.toHaveBeenCalled(); expect(fs.existsSync(output)).toBe(false);
  });
  it.each([NaN, Infinity, -Infinity])('rejects non-finite coordinate without serializing it away', lat => {
    expect(() => validateFixtures({ scenarios: [{ ...fixtures[0], lat }] })).toThrow('INVALID_FIXTURES');
  });
  it('rejects an existing candidate before any request and preserves it', async () => {
    installBundle(); fs.writeFileSync(output, 'existing'); const fetcher = vi.fn<typeof fetch>();
    await expect(generation(fetcher)).rejects.toThrow('OUTPUT_EXISTS'); expect(fetcher).not.toHaveBeenCalled();
    expect(fs.readFileSync(output, 'utf-8')).toBe('existing');
  });
  it('rejects both deployment paths, including a symlink parent alias, before requests', async () => {
    installBundle(); const fetcher = vi.fn<typeof fetch>();
    const paths = [join(root, 'public/data/precomputed_memos.json'), join(sandbox, 'data-pack/out/precomputed_memos.json')];
    fs.symlinkSync(join(root, 'public/data'), join(sandbox, 'alias'));
    paths.push(join(sandbox, 'alias/precomputed_memos.json'), join(sandbox, 'alias/PRECOMPUTED_MEMOS.JSON'));
    for (const path of paths) await expect(generation(fetcher, { output: path })).rejects.toThrow('OUTPUT_PATH_INVALID');
    expect(fetcher).not.toHaveBeenCalled(); expect(paths.every(path => !fs.existsSync(path))).toBe(true);
  });
  it('rejects missing parents, directories, dangling symlinks and control characters', async () => {
    const fetcher = vi.fn<typeof fetch>();
    fs.symlinkSync(join(sandbox, 'absent'), output);
    for (const path of [join(sandbox, 'absent/new.json'), root, output, `bad\n${canary}`]) {
      await expect(generation(fetcher, { output: path })).rejects.toThrow(/OUTPUT_(PATH_INVALID|EXISTS)/);
    }
    expect(fetcher).not.toHaveBeenCalled(); expect(fs.existsSync(join(sandbox, 'absent'))).toBe(false);
  });
});

describe('precompute provider boundary and lifecycle', () => {
  it('sends one explicitly selected free model with the existing request limits', async () => {
    const fetcher = fetchResponse(ok());
    expect(await call(fetcher)).toBe(memo); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', signal: expect.any(AbortSignal) });
    expect(JSON.parse(init!.body as string)).toEqual({ model: config.model, stream: false, temperature: 0.3, max_tokens: 4000, reasoning: { enabled: false }, messages: [{ role: 'user', content: '검토 의견' }] });
  });
  it.each([302, 307, 401, 429, 500])('rejects HTTP %i without reading/logging its body', async status => {
    const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = fetchResponse(new Response(stream, { status, headers: { Location: 'https://example.invalid' } }));
    await expect(call(fetcher)).rejects.toThrow('UPSTREAM_UNAVAILABLE'); expect(cancel).toHaveBeenCalled(); expect(stream.locked).toBe(false);
  });
  it('redacts a network exception and always removes CLI signal handlers', async () => {
    installBundle(); const c = cli(vi.fn<typeof fetch>().mockRejectedValue(Error(canary)));
    expect(await c.result).toBe(1); expect(c.stderr).toHaveBeenCalledExactlyOnceWith('PRECOMPUTE_FAILED: UPSTREAM_UNAVAILABLE');
    expect(c.stdout).not.toHaveBeenCalled(); expect(c.signals.listenerCount('SIGINT') + c.signals.listenerCount('SIGTERM')).toBe(0);
  });
  it.each(['http', 'explicit', 'content', 'json'])('CLI emits only fixed codes for raw %s failures', async kind => {
    installBundle();
    const responses = {
      http: new Response(canary, { status: 401 }),
      explicit: Response.json({ ...payload(), error: { message: canary } }),
      content: ok({ data: canary }),
      json: new Response('{' + canary, { headers: { 'Content-Type': 'application/json' } }),
    };
    const c = cli(fetchResponse(responses[kind as keyof typeof responses]));
    expect(await c.result).toBe(1);
    expect(c.stderr).toHaveBeenCalledExactlyOnceWith(`PRECOMPUTE_FAILED: ${kind === 'http' || kind === 'explicit' ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_INVALID'}`);
    expect(c.stdout).not.toHaveBeenCalled(); expect(fs.existsSync(output)).toBe(false);
  });
  it.each([
    [{ error: { message: canary } }, 'UPSTREAM_UNAVAILABLE'],
    [{ ...payload(), error: { message: canary } }, 'UPSTREAM_UNAVAILABLE'],
    [{ ...payload(), error: null }, 'UPSTREAM_UNAVAILABLE'],
    [{ choices: [{ ...payload().choices[0], error: { message: canary } }] }, 'UPSTREAM_UNAVAILABLE'],
    [null, 'UPSTREAM_INVALID'], [[], 'UPSTREAM_INVALID'], [{}, 'UPSTREAM_INVALID'],
    [{ choices: [] }, 'UPSTREAM_INVALID'], [{ choices: [payload().choices[0], payload().choices[0]] }, 'UPSTREAM_INVALID'],
    [{ choices: [null] }, 'UPSTREAM_INVALID'], [{ choices: [{ message: null, finish_reason: 'stop' }] }, 'UPSTREAM_INVALID'],
  ] as [unknown, string][])('rejects malformed response or explicit error', async (body, code) => {
    const fetcher = fetchResponse(Response.json(body));
    await expect(call(fetcher)).rejects.toThrow(code); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([42, {}, [], null].map(content => [content]))('requires string content', async content => {
    await expect(call(fetchResponse(ok(content)))).rejects.toThrow('UPSTREAM_INVALID');
  });
  it.each(['length', 'content_filter', 'tool_calls', null, undefined, 'unknown', 'error'])('requires stop finish even if memo is complete', async finish => {
    const body = payload(); body.choices[0].finish_reason = finish;
    await expect(call(fetchResponse(Response.json(body)))).rejects.toThrow(finish === 'error' ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_INCOMPLETE');
  });
  it.each(['', ' \n\t'])('rejects empty content in one request', async text => {
    const fetcher = fetchResponse(ok(text)); await expect(call(fetcher)).rejects.toThrow('UPSTREAM_EMPTY'); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['text/html', 'text/plain', 'text/event-stream', ''])('requires JSON media type %s', async type => {
    const cancel = vi.fn();
    await expect(call(fetchResponse(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': type } })))).rejects.toThrow('UPSTREAM_INVALID');
    expect(cancel).toHaveBeenCalled();
  });
  it.each(['{INVALID_' + canary, new Uint8Array([0xff])])('rejects malformed JSON and invalid UTF-8 without raw diagnostics', async body => {
    await expect(call(fetchResponse(new Response(body, { headers: { 'Content-Type': 'application/json' } })))).rejects.toThrow('UPSTREAM_INVALID');
  });
  it('enforces prompt chars and serialized request bytes before fetch', async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const prompt of ['x'.repeat(20001), '\u0000'.repeat(20000), '']) await expect(call(fetcher, controller().signal, prompt)).rejects.toThrow('INPUT_TOO_LARGE');
    expect(fetcher).not.toHaveBeenCalled();
    expect(await call(fetchResponse(ok()), controller().signal, 'x'.repeat(20000))).toBe(memo);
  });
  it('enforces raw content 128KiB before thinking removal, with an inclusive boundary', async () => {
    expect((await call(fetchResponse(ok('x'.repeat(128 * 1024))))).length).toBe(128 * 1024);
    for (const text of ['x'.repeat(128 * 1024 + 1), '가'.repeat(43691), '<think>' + 'x'.repeat(128 * 1024) + '</think>' + memo]) {
      await expect(call(fetchResponse(ok(text)))).rejects.toThrow('OUTPUT_TOO_LARGE');
    }
  });
  it('bounds declared and streamed JSON envelope bytes and releases its reader', async () => {
    const limit = 1024 * 1024;
    const base = JSON.stringify({ ...payload('ok'), padding: '' });
    const exact = base.replace('"padding":""', `"padding":"${'x'.repeat(limit - new TextEncoder().encode(base).length)}"`);
    expect(await call(fetchResponse(new Response(exact, { headers: { 'Content-Type': 'application/json' } })))).toBe('ok');
    for (const length of ['1048577', '-1', 'invalid']) {
      const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ cancel });
      await expect(call(fetchResponse(new Response(body, { headers: { 'Content-Type': 'application/json', 'Content-Length': length } })))).rejects.toThrow('OUTPUT_TOO_LARGE');
      expect(cancel).toHaveBeenCalled(); expect(body.locked).toBe(false);
    }
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(limit)); c.enqueue(new Uint8Array(1)); }, cancel });
    await expect(call(fetchResponse(new Response(body, { headers: { 'Content-Type': 'application/json' } })))).rejects.toThrow('OUTPUT_TOO_LARGE');
    expect(cancel).toHaveBeenCalled(); expect(body.locked).toBe(false);
  });
  it('times out stalled headers, cancels a late body and removes every timer/listener', async () => {
    vi.useFakeTimers(); const parent = controller();
    const add = vi.spyOn(parent.signal, 'addEventListener'), remove = vi.spyOn(parent.signal, 'removeEventListener');
    let complete!: (response: Response) => void; let requestSignal!: AbortSignal;
    const fetcher = vi.fn<typeof fetch>((_url, init) => { requestSignal = init!.signal as AbortSignal; return new Promise(resolve => { complete = resolve; }); });
    const result = call(fetcher, parent.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(55001);
    expect((await result).message).toBe('UPSTREAM_TIMEOUT'); expect(requestSignal.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
    const cancel = vi.fn(); complete(new Response(new ReadableStream({ cancel }))); await Promise.resolve();
    expect(cancel).toHaveBeenCalled(); expect(add.mock.calls.length).toBe(remove.mock.calls.length);
  });
  it('uses the same finite budget for stalled body and cancels/releases it', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); const parent = controller();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const result = call(fetchResponse(new Response(stream, { headers: { 'Content-Type': 'application/json' } })), parent.signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(55001);
    expect((await result).message).toBe('UPSTREAM_TIMEOUT'); expect(cancel).toHaveBeenCalled(); expect(stream.locked).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['headers', 'body'] as const)('parent cancellation aborts %s and removes timers', async phase => {
    vi.useFakeTimers(); const parent = controller(); const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = phase === 'headers' ? vi.fn<typeof fetch>(() => new Promise(() => {})) : fetchResponse(new Response(stream, { headers: { 'Content-Type': 'application/json' } }));
    const result = call(fetcher, parent.signal).catch(error => error); await vi.advanceTimersByTimeAsync(0); parent.abort(Error(canary));
    expect((await result).message).toBe('REQUEST_CANCELLED'); expect(vi.getTimerCount()).toBe(0);
    if (phase === 'body') { expect(cancel).toHaveBeenCalled(); expect(stream.locked).toBe(false); }
  });
  it('does not call upstream when already cancelled and cleans timers on success', async () => {
    vi.useFakeTimers(); const parent = controller(); parent.abort(); const fetcher = vi.fn<typeof fetch>();
    await expect(call(fetcher, parent.signal)).rejects.toThrow('REQUEST_CANCELLED'); expect(fetcher).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    expect(await call(fetchResponse(ok()))).toBe(memo); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('precompute exact context, content and exclusive output', () => {
  let data: ReturnType<typeof loadData>;
  beforeAll(() => { data = loadData(bundleDir); });
  it('loads current bundle and the corrected data-center path', () => {
    expect(data).toEqual(loadAppData());
    expect(data.dataCenters).toEqual(JSON.parse(fs.readFileSync(join(bundleDir, 'data_centers.json'), 'utf-8')));
  });
  it('matches independently assembled ReviewApp offline inputs and v4 signatures for all fixtures', async () => {
    for (const fixture of fixtures) {
      const job = prepareFixture(fixture, data);
      const input: ScoreInput = {
        lat: fixture.lat, lng: fixture.lng, landUse: fixture.landUse,
        landUseSource: fixture.landUse === 'unknown' ? 'unknown' : 'manual',
        project: defaultProject(data.constants), conditions: emptyConditions(), zoning: null, restrictions: null, disaster: null,
      };
      const result = scoreSite(input, data);
      const rows = buildChecklist(result, data, { input, landUseSource: input.landUseSource!, zoningName: null });
      expect(job.input).toEqual(input); expect(job.result).toEqual(result); expect(job.rows).toEqual(rows);
      expect(await memoContextKey(job.input, job.result, job.rows)).toBe(await memoContextKey(input, result, rows));
    }
  });
  it('saves only one full v4 candidate and preserves both deployment files', async () => {
    installBundle(fixtures); installProtectedPair(); const fetcher = vi.fn<typeof fetch>(async () => ok());
    const c = cli(fetcher); expect(await c.result).toBe(0); expect(fetcher).toHaveBeenCalledTimes(3);
    const file = JSON.parse(fs.readFileSync(output, 'utf-8')) as PrecomputedFile;
    expect(file.version).toBe(4); expect(file.model).toBe(config.model); expect(Object.keys(file.memos)).toEqual(fixtures.map((fixture: { id: string }) => fixture.id));
    for (const fixture of fixtures) {
      const job = prepareFixture(fixture, data);
      expect(file.memos[fixture.id]).toEqual({ lat: fixture.lat, lng: fixture.lng, landUse: fixture.landUse, contextKey: await memoContextKey(job.input, job.result, job.rows), text: memo });
      expect(file.memos[fixture.id].contextKey).toMatch(/^[a-f0-9]{64}$/);
    }
    expectProtectedPair();
    expect(c.stderr).not.toHaveBeenCalled(); expect(c.signals.listenerCount('SIGINT') + c.signals.listenerCount('SIGTERM')).toBe(0);
    expect(fs.statSync(output).mode & 0o777).toBe(0o600);
  });
  it.each([
    memo + '\n## ERROR\n' + canary,
    memo.replace('## ITEM site.area\n', '## ITEM site.area\n최소 대지면적 999999㎡입니다. '),
    memo.replace('## OVERALL\n', '## OVERALL\n전력 공급이 확정되었습니다. '),
    memo.replace('## ITEM power.gate', '## ITEM unknown.key'),
    memo + '\n## ITEM power.gate\n중복 의견',
    memo.replace(/## ACTIONS[\s\S]*/, ''),
  ])('never saves an error, incomplete structure or unsupported content', async text => {
    installBundle(); installProtectedPair(); const fetcher = vi.fn<typeof fetch>(async () => ok(text));
    await expect(generation(fetcher)).rejects.toThrow('MEMO_INVALID'); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(output)).toBe(false); expectProtectedPair();
  });
  it('leaves all outputs unchanged if a later fixture fails', async () => {
    installBundle(fixtures); installProtectedPair();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(ok()).mockResolvedValueOnce(new Response(canary, { status: 429 }));
    await expect(generation(fetcher)).rejects.toThrow('UPSTREAM_UNAVAILABLE'); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(output)).toBe(false); expectProtectedPair();
  });
  it('rejects a fully generated candidate over the client 2MiB cap before saving', async () => {
    installBundle(Array.from({ length: 17 }, (_, index) => ({ ...fixtures[0], id: `large-${index}` })));
    installProtectedPair();
    const large = memo.replace('추가 자료를 확인하세요.', '추가 자료를 확인하세요.' + 'x'.repeat(128 * 1024 - new TextEncoder().encode(memo).length));
    const fetcher = vi.fn<typeof fetch>(async () => ok(large));
    await expect(generation(fetcher)).rejects.toThrow('OUTPUT_TOO_LARGE');
    expect(fetcher).toHaveBeenCalledTimes(17); expect(fs.existsSync(output)).toBe(false); expectProtectedPair();
  });
  it('keeps missing optional data null and rejects corrupt optional data without raw logs', async () => {
    installBundle(); const optional = join(root, 'public/data/data_centers.json'); fs.unlinkSync(optional);
    expect(loadData(join(root, 'public/data')).dataCenters).toBeNull();
    fs.writeFileSync(optional, '{' + canary); const fetcher = vi.fn<typeof fetch>(); const c = cli(fetcher);
    expect(await c.result).toBe(1); expect(c.stderr).toHaveBeenCalledExactlyOnceWith('PRECOMPUTE_FAILED: LOCAL_DATA_INVALID'); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['scenarios.json', 'constants.json'])('redacts malformed local %s and makes no calls', async name => {
    installBundle(); fs.unlinkSync(join(root, 'public/data', name)); fs.writeFileSync(join(root, 'public/data', name), '{' + canary);
    const fetcher = vi.fn<typeof fetch>(); const c = cli(fetcher);
    expect(await c.result).toBe(1); expect(c.stderr).toHaveBeenCalledExactlyOnceWith('PRECOMPUTE_FAILED: LOCAL_DATA_INVALID'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('checks generated prompts before the first request for a valid but oversized local description', async () => {
    installBundle(); const path = join(root, 'public/data/constants.json');
    const constants = JSON.parse(fs.readFileSync(path, 'utf-8')); fs.unlinkSync(path);
    constants.disclaimer.review = 'x'.repeat(20001); fs.writeFileSync(path, JSON.stringify(constants));
    const fetcher = vi.fn<typeof fetch>();
    await expect(generation(fetcher)).rejects.toThrow('INPUT_TOO_LARGE'); expect(fetcher).not.toHaveBeenCalled(); expect(fs.existsSync(output)).toBe(false);
  });
  it.each(['SIGINT', 'SIGTERM'] as const)('handles %s during a request with no output and no leaked listeners', async signal => {
    installBundle(); vi.useFakeTimers(); const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const c = cli(fetcher); await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(1); c.signals.emit(signal);
    expect(await c.result).toBe(1); expect(c.stderr).toHaveBeenCalledExactlyOnceWith('PRECOMPUTE_FAILED: REQUEST_CANCELLED');
    expect(c.signals.listenerCount('SIGINT') + c.signals.listenerCount('SIGTERM')).toBe(0); expect(vi.getTimerCount()).toBe(0); expect(fs.existsSync(output)).toBe(false);
  });
  it('does not overwrite a file appearing after preflight or through exclusive-write race', async () => {
    installBundle(); const fetcher = vi.fn<typeof fetch>(async () => { fs.writeFileSync(output, 'racing-owner'); return ok(); });
    await expect(generation(fetcher)).rejects.toThrow('OUTPUT_EXISTS'); expect(fs.readFileSync(output, 'utf-8')).toBe('racing-owner');
    expect(() => saveCandidate(output, 'replacement')).toThrow('OUTPUT_WRITE_FAILED'); expect(fs.readFileSync(output, 'utf-8')).toBe('racing-owner');
  });
  it('removes only its newly created incomplete candidate on write failure', () => {
    installProtectedPair(); const target = validateOutputPath(output, root);
    expect(() => saveCandidate(target, memo, (fd) => { fs.writeSync(fd, 'partial'); throw Error(canary); })).toThrow('OUTPUT_WRITE_FAILED');
    expect(fs.existsSync(output)).toBe(false); expectProtectedPair();
  });
  it('does not delete a replacement path during failed-write cleanup', () => {
    expect(() => saveCandidate(output, memo, () => { fs.unlinkSync(output); fs.writeFileSync(output, 'other-owner'); throw Error(canary); })).toThrow('OUTPUT_WRITE_FAILED');
    expect(fs.readFileSync(output, 'utf-8')).toBe('other-owner');
  });
});
