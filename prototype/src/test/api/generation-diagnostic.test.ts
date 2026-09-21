import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OFFICIAL_TYPES = [
  'context_length_exceeded', 'max_tokens_exceeded', 'token_limit_exceeded', 'string_too_long',
  'authentication', 'permission_denied', 'payment_required', 'rate_limit_exceeded',
  'provider_overloaded', 'provider_unavailable', 'invalid_request', 'invalid_prompt',
  'not_found', 'precondition_failed', 'payload_too_large', 'unprocessable',
  'content_policy_violation', 'refusal', 'invalid_image', 'image_too_large', 'image_too_small',
  'unsupported_image_format', 'image_not_found', 'image_download_failed', 'server', 'timeout', 'unmapped',
];
const DEFAULT_MODELS = ['google/gemma-4-31b-it:free', 'nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-26b-a4b-it:free'];
const FIELDS = ['event', 'requestAtUtc', 'elapsedMs', 'phase', 'localCode', 'upstreamHttpStatus', 'upstreamCode', 'upstreamErrorType', 'errorLocation', 'errorShape', 'requestedModels', 'textEmitted'].sort();
const PRIVATE = 'SYNTHETIC_PRIVATE_SENTINEL';
const enc = new TextEncoder();
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const content = (value: unknown) => frame({ choices: [{ delta: { content: value } }] });
const sse = (body: BodyInit | null) => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
const request = (prompt = '검토', signal?: AbortSignal) => new Request('https://example.test/api/generate', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal,
});
let generate: (req: Request) => Promise<Response>;
let logger: ReturnType<typeof vi.spyOn>;
let otherLogs: ReturnType<typeof vi.spyOn>[];

beforeEach(async () => {
  vi.resetModules();
  generate = (await import('../../../api/generate.js')).default;
  vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-test-key');
  vi.stubEnv('LLM_MODEL', '');
  logger = vi.spyOn(console, 'error').mockImplementation(() => {});
  otherLogs = ['log', 'warn', 'info', 'debug'].map((name) => vi.spyOn(console, name as 'log').mockImplementation(() => {}));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function diagnostic(expected: Record<string, unknown>) {
  expect(logger).toHaveBeenCalledTimes(1);
  expect(logger.mock.calls[0]).toHaveLength(1);
  const serialized = logger.mock.calls[0][0];
  expect(typeof serialized).toBe('string');
  expect(serialized).not.toContain(PRIVATE);
  expect(serialized).not.toContain('synthetic-test-key');
  expect(serialized.length).toBeLessThan(1000);
  const value = JSON.parse(serialized);
  expect(Object.keys(value).sort()).toEqual(FIELDS);
  expect(value.event).toBe('ai_generation_failure');
  expect(new Date(value.requestAtUtc).toISOString()).toBe(value.requestAtUtc);
  expect(Number.isInteger(value.elapsedMs)).toBe(true);
  expect(value.elapsedMs).toBeGreaterThanOrEqual(0);
  expect(value.elapsedMs).toBeLessThanOrEqual(86_400_000);
  expect(typeof value.textEmitted).toBe('boolean');
  expect(value).toMatchObject(expected);
  for (const log of otherLogs) expect(log).not.toHaveBeenCalled();
  return value;
}

async function invoke(body: BodyInit | null, expected = '\n## ERROR\nUPSTREAM_UNAVAILABLE\n') {
  const fetch = vi.fn().mockResolvedValue(sse(body)); vi.stubGlobal('fetch', fetch);
  const response = await generate(request(PRIVATE));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(expected);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('X-LLM-Model')).toBe('OpenRouter');
  expect(Array.from(response.headers)).toEqual([
    ['cache-control', 'no-store'], ['content-type', 'text/plain; charset=utf-8'],
    ['x-content-type-options', 'nosniff'], ['x-llm-model', 'OpenRouter'],
  ]);
  expect(fetch).toHaveBeenCalledTimes(1);
  return fetch;
}

describe('generation failure diagnostics', () => {
  it('D01 records only typed fields from a top-level error', async () => {
    await invoke(frame({ error: { code: 504, message: PRIVATE, stack: PRIVATE, metadata: { error_type: 'timeout', provider_code: PRIVATE, raw: PRIVATE } }, model: PRIVATE, provider: PRIVATE }));
    diagnostic({ phase: 'upstream_sse', localCode: 'UPSTREAM_UNAVAILABLE', upstreamHttpStatus: 200, upstreamCode: 504, upstreamErrorType: 'timeout', errorLocation: 'top_level', errorShape: 'object', textEmitted: false, requestedModels: DEFAULT_MODELS });
  });
  it('D02 records a choice error after text without storing that text', async () => {
    await invoke(content('부분 의견') + frame({ choices: [{ delta: {}, error: { code: 429, message: PRIVATE, metadata: { error_type: 'rate_limit_exceeded' } } }] }), '부분 의견\n## ERROR\nUPSTREAM_UNAVAILABLE\n');
    const log = diagnostic({ errorLocation: 'choice', errorShape: 'object', upstreamCode: 429, upstreamErrorType: 'rate_limit_exceeded', textEmitted: true });
    expect(JSON.stringify(log)).not.toContain('부분 의견');
  });
  it('D03 keeps an error finish without an error object unknown', async () => {
    await invoke(frame({ choices: [{ delta: {}, finish_reason: 'error' }] }));
    diagnostic({ errorLocation: 'finish_reason', errorShape: 'missing', upstreamCode: null, upstreamErrorType: 'unknown' });
  });
  it('D04 preserves top-level null failure even with valid content', async () => {
    await invoke(frame({ error: null, choices: [{ delta: { content: PRIVATE } }] }));
    diagnostic({ errorLocation: 'top_level', errorShape: 'null', upstreamCode: null, upstreamErrorType: 'unknown', textEmitted: false });
  });
  it.each([['array', [PRIVATE]], ['string', PRIVATE], ['boolean', false], ['number', 0]])('observes %s error shape without exposing its value', async (_label, error) => {
    await invoke(frame({ error })); diagnostic({ errorLocation: 'top_level', errorShape: 'other', upstreamCode: null, upstreamErrorType: 'unknown' });
  });
  it('preserves nullable choice error on a successful frame', async () => {
    await invoke(frame({ choices: [{ delta: { content: '정상' }, error: null, finish_reason: 'stop' }] }) + 'data: [DONE]\n', '정상');
    expect(logger).not.toHaveBeenCalled();
  });
  it('observes nullable error on an error finish without upgrading success', async () => {
    await invoke(frame({ choices: [{ delta: {}, error: null, finish_reason: 'error' }] }));
    diagnostic({ errorLocation: 'finish_reason', errorShape: 'null', upstreamCode: null, upstreamErrorType: 'unknown' });
  });
  it('does not count whitespace as meaningful text', async () => {
    await invoke(content(' \n') + frame({ error: {} }), ' \n\n## ERROR\nUPSTREAM_UNAVAILABLE\n');
    diagnostic({ textEmitted: false });
  });
  it.each([
    ['unknown', `${PRIVATE}\n"`], ['space', 'timeout '], ['newline', 'timeout\n'], ['suffix', 'timeout_extra'],
    ['object', { raw: PRIVATE }], ['array', ['timeout', PRIVATE]], ['number', 504], ['null', null], ['missing', undefined],
  ])('D05-D07 maps %s type to unknown', async (_label, errorType) => {
    await invoke(frame({ error: { code: PRIVATE, message: PRIVATE, metadata: { error_type: errorType, provider_code: 'timeout' } } }));
    diagnostic({ upstreamErrorType: 'unknown', upstreamCode: null });
  });
  it.each(OFFICIAL_TYPES)('D08 retains exact documented type %s', async (errorType) => {
    await invoke(frame({ error: { metadata: { error_type: errorType, raw: PRIVATE }, message: PRIVATE } }));
    diagnostic({ upstreamErrorType: errorType, upstreamCode: null });
  });
  it.each([100, 599])('D09 retains numeric code %i without inferring a type', async (code) => {
    await invoke(frame({ error: { code } })); diagnostic({ upstreamCode: code, upstreamErrorType: 'unknown' });
  });
  it.each([
    ['low', 99], ['high', 600], ['fraction', 429.5], ['string', '429'], ['arbitrary', PRIVATE], ['object', { raw: PRIVATE }], ['missing', undefined],
  ])('D10 discards %s code', async (_label, code) => {
    await invoke(frame({ error: { code } })); diagnostic({ upstreamCode: null, upstreamErrorType: 'unknown' });
  });
  it.each([301, 302, 307, 308, 401, 402, 403, 404, 429, 502, 503, 504])('D11-D12 cancels unread HTTP %i body', async (status) => {
    const pull = vi.fn(); const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const fetch = vi.fn().mockResolvedValue(new Response(stream, { status, headers: { Location: `https://example.test/${PRIVATE}` } })); vi.stubGlobal('fetch', fetch);
    const response = await generate(request(PRIVATE));
    expect(response.status).toBe(502); expect(await response.text()).toBe('UPSTREAM_UNAVAILABLE');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][1].redirect).toBe('manual');
    expect(pull).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledTimes(1);
    diagnostic({ phase: 'upstream_http', upstreamHttpStatus: status, upstreamCode: null, upstreamErrorType: 'unknown', errorLocation: 'none', errorShape: 'missing' });
  });
  it.each(['missing body', 'wrong MIME'])('D13 rejects %s without logging it', async (variant) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(variant === 'missing body' ? sse(null) : new Response(PRIVATE, { headers: { 'Content-Type': `text/${PRIVATE}` } })));
    const response = await generate(request()); expect(response.status).toBe(502); expect(await response.text()).toBe('UPSTREAM_INVALID');
    diagnostic({ phase: 'upstream_http', localCode: 'UPSTREAM_INVALID', upstreamHttpStatus: 200 });
  });
  it('D14 ignores a fetch rejection message and stack', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error(PRIVATE)));
    const response = await generate(request()); expect(response.status).toBe(502); expect(await response.text()).toBe('UPSTREAM_UNAVAILABLE');
    diagnostic({ phase: 'upstream_fetch', upstreamHttpStatus: null, upstreamCode: null, upstreamErrorType: 'unknown' });
  });
  it('ignores a failed body read message and stack', async () => {
    await invoke(new ReadableStream({ start(controller) { controller.error(new Error(PRIVATE)); } }), '\n## ERROR\nUPSTREAM_INVALID\n');
    diagnostic({ phase: 'upstream_sse', localCode: 'UPSTREAM_INVALID' });
  });
  it.each<[string, BodyInit, string, boolean]>([
    ['malformed JSON', 'data: {oops}\n', 'UPSTREAM_INVALID', false],
    ['invalid UTF8', new Uint8Array([0xff]), 'UPSTREAM_INVALID', false],
    ['bad content', content({ raw: PRIVATE }), 'UPSTREAM_INVALID', false],
    ['empty DONE', 'data: [DONE]\n', 'UPSTREAM_EMPTY', false],
    ['empty EOF', '', 'UPSTREAM_EMPTY', false],
    ['partial EOF', content('부분'), 'UPSTREAM_INCOMPLETE', true],
    ...['length', 'content_filter', 'tool_calls'].map((reason): [string, BodyInit, string, boolean] => [reason, content('부분') + frame({ choices: [{ delta: {}, finish_reason: reason }] }), 'UPSTREAM_INCOMPLETE', true]),
  ])('D15-D16 diagnoses %s with existing public code', async (_label, body, code, emitted) => {
    await invoke(body as BodyInit, `${emitted ? '부분' : ''}\n## ERROR\n${code}\n`);
    diagnostic({ phase: 'upstream_sse', localCode: code, errorLocation: 'none', errorShape: 'missing', textEmitted: emitted });
  });
  it('D17 keeps top-level precedence and records once', async () => {
    await invoke(frame({ error: { code: 504, metadata: { error_type: 'timeout' } }, choices: [{ delta: {}, error: { code: 429, metadata: { error_type: 'rate_limit_exceeded' } }, finish_reason: 'error' }] }));
    diagnostic({ errorLocation: 'top_level', upstreamCode: 504, upstreamErrorType: 'timeout' });
  });
  it('D17 keeps choice precedence over error finish', async () => {
    await invoke(frame({ choices: [{ delta: {}, error: { code: 429, metadata: { error_type: 'rate_limit_exceeded' } }, finish_reason: 'error' }] }));
    diagnostic({ errorLocation: 'choice', upstreamCode: 429, upstreamErrorType: 'rate_limit_exceeded' });
  });
  it('D18 records idle timeout once and leaves no timer or held gate', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); let signal: AbortSignal | undefined;
    const { generationGate } = await import('../../../api/_generation.js');
    const reserve = generationGate.reserve.bind(generationGate); const release = vi.fn();
    vi.spyOn(generationGate, 'reserve').mockImplementation((digest) => { const done = reserve(digest); return () => { release(); done(); }; });
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { signal = init.signal; return sse(new ReadableStream({ cancel })); }));
    const response = await generate(request()); const done = response.text(); await vi.advanceTimersByTimeAsync(15_001);
    expect(await done).toBe('\n## ERROR\nUPSTREAM_TIMEOUT\n'); expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    diagnostic({ phase: 'upstream_sse', localCode: 'UPSTREAM_TIMEOUT', textEmitted: false });
  });
  it('D18 keeps the overall deadline with keepalives', async () => {
    vi.useFakeTimers(); let upstream: ReadableStreamDefaultController<Uint8Array> | undefined;
    const cancel = vi.fn(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(new ReadableStream({ start(c) { upstream = c; }, cancel }))));
    const response = await generate(request()); const done = response.text();
    for (let i = 0; i < 5; i++) { await vi.advanceTimersByTimeAsync(10_000); upstream!.enqueue(enc.encode(': processing\n')); await vi.advanceTimersByTimeAsync(0); }
    await vi.advanceTimersByTimeAsync(5001);
    expect(await done).toBe('\n## ERROR\nUPSTREAM_TIMEOUT\n'); expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    diagnostic({ phase: 'upstream_sse', localCode: 'UPSTREAM_TIMEOUT' });
  });
  it.each(['resolve', 'reject'])('D19 contains late fetch %s after the same header timeout', async (ending) => {
    vi.useFakeTimers(); let resolveFetch: (response: Response) => void = () => {}; let rejectFetch: (error: Error) => void = () => {};
    let entered: () => void = () => {}; const started = new Promise<void>((resolve) => { entered = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => { entered(); return new Promise<Response>((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; }); }));
    const pending = generate(request()); await started; await vi.advanceTimersByTimeAsync(55_001);
    const response = await pending; expect(response.status).toBe(502); expect(await response.text()).toBe('UPSTREAM_TIMEOUT');
    const cancel = vi.fn();
    if (ending === 'resolve') resolveFetch(sse(new ReadableStream({ cancel })));
    else rejectFetch(new Error(PRIVATE));
    await vi.advanceTimersByTimeAsync(0);
    if (ending === 'resolve') expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); diagnostic({ phase: 'upstream_fetch', localCode: 'UPSTREAM_TIMEOUT', upstreamHttpStatus: null });
  });
  it.each(['parent', 'downstream'])('D19 records %s cancellation once despite async catch', async (ending) => {
    vi.useFakeTimers(); const parent = new AbortController(); const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(new ReadableStream({ cancel }))));
    const response = await generate(request('의견', parent.signal));
    if (ending === 'parent') { const done = response.text(); parent.abort(); expect(await done).toBe('\n## ERROR\nREQUEST_CANCELLED\n'); }
    else await response.body!.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    diagnostic({ phase: 'upstream_sse', localCode: 'REQUEST_CANCELLED' });
  });
  it('D21 logs duplicate failure without logging the digest', async () => {
    const fetch = vi.fn(async () => sse(new ReadableStream())); vi.stubGlobal('fetch', fetch);
    const one = await generate(request()); const duplicate = await generate(request());
    expect(duplicate.status).toBe(409); expect(await duplicate.text()).toBe('DUPLICATE_REQUEST'); expect(fetch).toHaveBeenCalledTimes(1);
    diagnostic({ phase: 'gate', localCode: 'DUPLICATE_REQUEST', requestedModels: DEFAULT_MODELS });
    await one.body!.cancel();
  });
  it('D21 preserves the third-concurrent request rejection', async () => {
    const fetch = vi.fn(async () => sse(new ReadableStream())); vi.stubGlobal('fetch', fetch);
    const one = await generate(request('첫째')); const two = await generate(request('둘째')); const three = await generate(request('셋째'));
    expect(three.status).toBe(429); expect(await three.text()).toBe('RATE_LIMITED'); expect(three.headers.get('Retry-After')).toBe('60'); expect(fetch).toHaveBeenCalledTimes(2);
    diagnostic({ phase: 'gate', localCode: 'RATE_LIMITED' }); await one.body!.cancel(); await two.body!.cancel();
  });
  it('D21 preserves the thirteenth admitted start rejection', async () => {
    const fetch = vi.fn(async () => sse(content('정상') + 'data: [DONE]\n')); vi.stubGlobal('fetch', fetch);
    for (let i = 0; i < 12; i++) expect(await (await generate(request(String(i)))).text()).toBe('정상');
    const response = await generate(request('13')); expect(response.status).toBe(429); expect(await response.text()).toBe('RATE_LIMITED'); expect(fetch).toHaveBeenCalledTimes(12);
    diagnostic({ phase: 'gate', localCode: 'RATE_LIMITED' });
  });
  it('D20 rejects invalid config without recording environment values', async () => {
    vi.stubEnv('LLM_MODEL', PRIVATE); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await generate(request()); expect(response.status).toBe(503); expect(await response.text()).toBe('SERVER_UNAVAILABLE'); expect(fetch).not.toHaveBeenCalled();
    diagnostic({ phase: 'config', localCode: 'SERVER_UNAVAILABLE', requestedModels: [] });
  });
  it('D20 keeps missing key config failure safe', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', ''); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await generate(request()); expect(response.status).toBe(503); expect(await response.text()).toBe('SERVER_UNAVAILABLE'); expect(fetch).not.toHaveBeenCalled();
    diagnostic({ phase: 'config', requestedModels: [] });
  });
  it.each([...DEFAULT_MODELS, 'openrouter/free'])('D22 records only actual allowed route %s', async (model) => {
    vi.stubEnv('LLM_MODEL', model); const fetch = vi.fn().mockResolvedValue(sse(frame({ error: {} }))); vi.stubGlobal('fetch', fetch);
    const response = await generate(request()); await response.text();
    const models = model === DEFAULT_MODELS[0] ? DEFAULT_MODELS : [model];
    expect(JSON.parse(fetch.mock.calls[0][1].body).models).toEqual(models);
    expect(response.headers.get('X-LLM-Model')).toBe(models.length > 1 ? 'OpenRouter' : model);
    diagnostic({ requestedModels: models });
  });
  it('D23 emits fragmented Korean success with no failure record', async () => {
    const bytes = enc.encode(': processing\r\n' + frame({ choices: [{ delta: { role: 'assistant' } }] }) + content('한글 의견') + frame({ choices: [], usage: { total_tokens: 3 } }) + frame({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]');
    await invoke(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }), '한글 의견');
    expect(logger).not.toHaveBeenCalled();
  });
  it('D24 contains logging sink errors and releases the gate', async () => {
    logger.mockImplementation(() => { throw new Error(PRIVATE); });
    const cancel = vi.fn(); const fetch = vi.fn(() => Promise.resolve(sse(new ReadableStream({ start(c) { c.enqueue(enc.encode(frame({ error: {} }))); }, cancel })))); vi.stubGlobal('fetch', fetch);
    for (let i = 0; i < 3; i++) { const response = await generate(request()); expect(response.status).toBe(200); expect(await response.text()).toBe('\n## ERROR\nUPSTREAM_UNAVAILABLE\n'); }
    expect(logger).toHaveBeenCalledTimes(3); expect(fetch).toHaveBeenCalledTimes(3); expect(cancel).toHaveBeenCalledTimes(3);
  });
  it('D24 keeps abort and timer cleanup when a timeout logger throws', async () => {
    vi.useFakeTimers(); logger.mockImplementation(() => { throw new Error(PRIVATE); }); const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => sse(new ReadableStream({ cancel }))));
    const response = await generate(request()); const done = response.text(); await vi.advanceTimersByTimeAsync(15_001);
    expect(await done).toBe('\n## ERROR\nUPSTREAM_TIMEOUT\n'); expect(cancel).toHaveBeenCalledTimes(1); expect(logger).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    ['output', content('가'.repeat(50_000))], ['SSE', ':' + 'x'.repeat(1024 * 1024)],
  ])('D25 bounds %s failure diagnostics independently of source bytes', async (_label, body) => {
    await invoke(body, '\n## ERROR\nOUTPUT_TOO_LARGE\n'); diagnostic({ localCode: 'OUTPUT_TOO_LARGE' });
  });
  it('D25 preserves the actual input byte limit', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await generate(request('가'.repeat(40_000))); expect(response.status).toBe(413); expect(await response.text()).toBe('PAYLOAD_TOO_LARGE'); expect(fetch).not.toHaveBeenCalled();
    diagnostic({ phase: 'request', localCode: 'PAYLOAD_TOO_LARGE' });
  });
  it('keeps method and invalid request failures in the request phase', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await generate(new Request('https://example.test/api/generate'));
    expect(response.status).toBe(405); expect(response.headers.get('Allow')).toBe('POST'); expect(await response.text()).toBe('METHOD_NOT_ALLOWED');
    diagnostic({ phase: 'request', localCode: 'METHOD_NOT_ALLOWED', requestedModels: [] }); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a private invalid prompt without recording it', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await generate(request(PRIVATE.repeat(2000))); expect(response.status).toBe(400); expect(await response.text()).toBe('BAD_REQUEST');
    diagnostic({ phase: 'request', localCode: 'BAD_REQUEST', requestedModels: [] }); expect(fetch).not.toHaveBeenCalled();
  });
});

describe('diagnostic sink boundaries', () => {
  it.each([
    ['backward', -10, 0], ['fraction', 1.99, 1], ['nonfinite', Infinity, 0], ['NaN', NaN, 0], ['oversized', 1e20, 86_400_000],
  ])('keeps %s elapsed time finite and bounded', async (_label, elapsed, expected) => {
    const { GenerationDiagnostic } = await import('../../../api/_generationDiagnostic.js');
    vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(elapsed);
    new GenerationDiagnostic(new Set(DEFAULT_MODELS)).fail('UPSTREAM_TIMEOUT');
    diagnostic({ elapsedMs: expected });
  });
  it('does not retry logging after serialization fails', async () => {
    const { GenerationDiagnostic } = await import('../../../api/_generationDiagnostic.js');
    const recorder = new GenerationDiagnostic(new Set(DEFAULT_MODELS));
    const stringify = vi.spyOn(JSON, 'stringify').mockImplementation(() => { throw new Error(PRIVATE); });
    expect(() => recorder.fail('UPSTREAM_INVALID')).not.toThrow(); stringify.mockRestore();
    recorder.fail('UPSTREAM_INVALID'); expect(logger).not.toHaveBeenCalled();
  });
  it('rechecks requested models and local codes before serialization', async () => {
    const { GenerationDiagnostic } = await import('../../../api/_generationDiagnostic.js');
    const recorder = new GenerationDiagnostic(new Set(DEFAULT_MODELS));
    recorder.selectModels([PRIVATE, DEFAULT_MODELS[0]]); recorder.fail(PRIVATE as never);
    diagnostic({ localCode: 'UPSTREAM_UNAVAILABLE', requestedModels: [DEFAULT_MODELS[0]] });
  });
});
