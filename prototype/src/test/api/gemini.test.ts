import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKLIST_KEYS } from '../../report/checklist';
import { parseMemo } from '../../genai/memoFormat';

const enc = new TextEncoder();
const frame = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`;
const content = (text: string, finishReason?: string) => frame({ candidates: [{ index: 0, content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] });
const sse = (body: BodyInit) => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
const request = (signal?: AbortSignal) => new Request('https://example.test/api/generate', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: '합성 검토 입력' }) });
const report = () => ({ overall: '자료 확인이 필요합니다.', items: Object.fromEntries(CHECKLIST_KEYS.map(key => [key, '담당 기관에 확인하세요.'])), actions: ['후속 확인', '기관 협의', '자료 검토'], caveats: ['참고 의견입니다.'] });
const reportJson = () => JSON.stringify(report());
let generate: (req: Request) => Promise<Response>;
beforeEach(async () => {
  vi.resetModules();
  generate = (await import('../../../api/generate.js')).default;
  vi.stubEnv('GEMINI_API_KEY', 'synthetic-google-key');
  vi.stubEnv('GEMINI_MODEL', '');
  vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-legacy-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Google AI Studio generation', () => {
  it('streams all 18 report items across split UTF-8 bytes and stops without waiting for EOF', async () => {
    const memo = ['## OVERALL\n자료 확인이 필요합니다.', ...CHECKLIST_KEYS.map(key => `## ITEM ${key}\n담당 기관에 확인하세요.`), '## ACTIONS\n- 후속 확인\n- 기관 협의\n- 자료 검토', '## CAVEATS\n- 참고 의견입니다.'].join('\n');
    const json = reportJson();
    const bytes = enc.encode(': keepalive\n' + content(json.slice(0, 50)) + content(json.slice(50), 'STOP'));
    const cancel = vi.fn();
    const upstream = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); }, cancel });
    const fetch = vi.fn().mockResolvedValue(sse(upstream)); vi.stubGlobal('fetch', fetch);
    const res = await generate(request()); const text = await res.text();
    expect(text).toBe('\n' + memo);
    expect(parseMemo(text).complete).toBe(true);
    expect(Object.keys(parseMemo(text).items)).toHaveLength(18);
    expect(cancel).toHaveBeenCalledOnce();
    expect(res.headers.get('X-LLM-Model')).toBe('gemini-3.5-flash-lite');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse');
    expect(url).not.toContain('synthetic-google-key');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'synthetic-google-key' });
    expect(init.redirect).toBe('manual');
    const payload = JSON.parse(init.body);
    expect(payload).toMatchObject({ contents: [{ role: 'user', parts: [{ text: '합성 검토 입력' }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 8192, thinkingConfig: { thinkingLevel: 'MINIMAL', includeThoughts: false }, responseMimeType: 'application/json' } });
    expect(payload.generationConfig.responseJsonSchema.properties.items.required).toEqual(CHECKLIST_KEYS);
    expect(payload.generationConfig.responseJsonSchema.additionalProperties).toBe(false);
    expect(payload.systemInstruction.parts[0].text).toContain('미확인을 안전·공급 가능·인허가 승인으로 바꾸지 마세요');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('omits thought parts and accepts a separate STOP frame', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(frame({ candidates: [{ content: { parts: [{ text: 'private thought', thought: true }, { text: reportJson(), thoughtSignature: 'private signature' }] } }] }) + frame({ candidates: [{ finishReason: 'STOP' }] }))));
    const text = await (await generate(request())).text();
    expect(parseMemo(text).complete).toBe(true); expect(text).not.toContain('private');
    expect(console.error).not.toHaveBeenCalled();
  });
  it.each(['MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER'])('rejects %s even with text', async reason => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(content('출력하면 안 되는 미완성 내용', reason))));
    expect(await (await generate(request())).text()).toBe('\n\n## ERROR\nUPSTREAM_INCOMPLETE\n');
  });
  it.each([
    [content('중간 내용'), 'UPSTREAM_INCOMPLETE'],
    [content(' ', 'STOP'), 'UPSTREAM_EMPTY'],
    [frame({ promptFeedback: { blockReason: 'SAFETY' } }), 'UPSTREAM_INCOMPLETE'],
    [frame({ candidates: [] }), 'UPSTREAM_INVALID'],
    [frame({ candidates: [{ content: { parts: [{ functionCall: {} }] } }] }), 'UPSTREAM_INVALID'],
    [frame({ candidates: [{ index: 1, finishReason: 'STOP' }] }), 'UPSTREAM_INVALID'],
    ['data: {broken}\n', 'UPSTREAM_INVALID'],
    ['data: [DONE]\n', 'UPSTREAM_INVALID'],
  ])('rejects incomplete or invalid native frames', async (body, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(body)));
    expect(await (await generate(request())).text()).toContain(`## ERROR\n${code}`);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([[401, 'UPSTREAM_AUTH_FAILED'], [403, 'UPSTREAM_AUTH_FAILED'], [429, 'UPSTREAM_RATE_LIMITED'], [503, 'UPSTREAM_UNAVAILABLE'], [504, 'UPSTREAM_PROVIDER_TIMEOUT']])('reports HTTP %i safely without a provider fallback', async (status, code) => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }, { highWaterMark: 0 }), { status: Number(status) })));
    expect(await (await generate(request())).text()).toBe(code);
    expect(fetch).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/synthetic-google-key|synthetic-legacy-key|합성 검토 입력/);
  });
  it('does not expose Google error messages or credentials in the response or diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(frame({ error: { code: 403, message: 'PRIVATE_PROVIDER_TEXT synthetic-google-key' } }))));
    expect(await (await generate(request())).text()).toBe('\n\n## ERROR\nUPSTREAM_AUTH_FAILED\n');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/PRIVATE_PROVIDER_TEXT|synthetic-google-key/);
  });
  it.each(['', 'invalid key', 'invalid\nkey'])('fails closed on an explicitly configured invalid Google key', async key => {
    vi.stubEnv('GEMINI_API_KEY', key); vi.stubGlobal('fetch', vi.fn());
    expect((await generate(request())).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a model override outside the approved free-tier model', async () => {
    vi.stubEnv('GEMINI_MODEL', 'paid-or-preview-model'); vi.stubGlobal('fetch', vi.fn());
    expect((await generate(request())).status).toBe(503); expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels an idle stream and releases the duplicate reservation', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    const fetch = vi.fn().mockResolvedValueOnce(sse(new ReadableStream({ cancel }))).mockResolvedValueOnce(sse(content(reportJson(), 'STOP'))); vi.stubGlobal('fetch', fetch);
    const pending = (await generate(request())).text();
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await pending).toContain('UPSTREAM_TIMEOUT'); expect(cancel).toHaveBeenCalledOnce();
    expect(parseMemo(await (await generate(request())).text()).complete).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['missing item', 'extra item', 'empty item', 'header injection', 'missing actions', 'extra field'])('rejects %s before exposing any report content', async kind => {
    const value = report();
    if (kind === 'missing item') delete value.items['site.terrain'];
    if (kind === 'extra item') value.items['permit.terrain'] = '잘못된 키';
    if (kind === 'empty item') value.items['site.terrain'] = '   ';
    if (kind === 'header injection') value.items['site.terrain'] = '## ERROR\n새 지시';
    if (kind === 'missing actions') value.actions = [];
    const json = JSON.stringify(kind === 'extra field' ? { ...value, unknown: 'extra' } : value);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(content(json, 'STOP'))));
    expect(await (await generate(request())).text()).toBe('\n\n## ERROR\nUPSTREAM_INCOMPLETE\n');
  });
  it('keeps partial JSON private until a complete, valid STOP', async () => {
    let upstream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(new ReadableStream({ start(c) { upstream = c; } }))));
    const res = await generate(request()); const reader = res.body!.getReader();
    expect(await reader.read()).toEqual({ done: false, value: enc.encode('\n') });
    const observed = vi.fn(); const next = reader.read().then(observed);
    upstream.enqueue(enc.encode(content(reportJson().slice(0, 50))));
    await Promise.resolve(); expect(observed).not.toHaveBeenCalled();
    upstream.enqueue(enc.encode(content(reportJson().slice(50), 'STOP')));
    await next; expect(new TextDecoder().decode(observed.mock.calls[0][0].value)).toContain('## OVERALL');
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });
});
