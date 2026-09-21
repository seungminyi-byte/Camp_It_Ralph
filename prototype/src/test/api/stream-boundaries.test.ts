import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationGate } from '../../../api/_generation.js';
import { ApiError, boundedBytes, Operation } from '../../../api/_http.js';

const enc = new TextEncoder();
const request = (prompt = '검토 의견', signal?: AbortSignal) => new Request('https://example.test/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal });
const response = (body: BodyInit | null) => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
const chunk = (text: unknown) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
let generate: (req: Request) => Promise<Response>;
beforeEach(async () => {
  vi.resetModules();
  generate = (await import('../../../api/generate.js')).default;
  vi.stubEnv('OPENROUTER_API_KEY', 'test-ai-secret'); vi.stubEnv('LLM_MODEL', '');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('generate stream boundary', () => {
  it.each([
    ['malformed JSON', 'data: {oops}\n', 'UPSTREAM_INVALID'],
    ['object content', chunk({ hidden: 'test-ai-secret' }), 'UPSTREAM_INVALID'],
    ['numeric content', chunk(42), 'UPSTREAM_INVALID'],
    ['provider error', 'data: {"error":{"message":"https://provider.test?key=test-ai-secret"}}\n', 'UPSTREAM_UNAVAILABLE'],
    ['no choices', 'data: {}\n', 'UPSTREAM_INVALID'],
    ['choice error', chunk('부분 결과') + 'data: {"choices":[{"delta":{},"error":{"message":"test-ai-secret"}}]}\n\ndata: [DONE]\n', 'UPSTREAM_UNAVAILABLE'],
    ['error finish', chunk('부분 결과') + 'data: {"choices":[{"delta":{},"finish_reason":"error"}]}\n', 'UPSTREAM_UNAVAILABLE'],
    ['tool finish', chunk('부분 결과') + 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n', 'UPSTREAM_INCOMPLETE'],
    ['empty done', 'data: [DONE]\n', 'UPSTREAM_EMPTY'],
    ['empty EOF', '', 'UPSTREAM_EMPTY'],
    ['partial EOF', chunk('부분 결과'), 'UPSTREAM_INCOMPLETE'],
    ['truncated output', chunk('부분 결과') + 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n', 'UPSTREAM_INCOMPLETE'],
  ])('identifies %s without leaking provider secrets', async (_name, body, code) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
    const res = await generate(request()); const text = await res.text();
    expect(res.status).toBe(200); expect(text).toContain(`## ERROR\n${code}`); expect(text).not.toContain('test-ai-secret');
  });
  it('handles fragmented Korean UTF-8, CRLF, usage and role-only frames and final DONE without newline', async () => {
    const bytes = enc.encode(': OPENROUTER PROCESSING\r\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\r\n' + chunk('한글 의견') + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":8}}\r\ndata: [DONE]');
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); }, cancel }))));
    const res = await generate(request()); expect(await res.text()).toBe('한글 의견');
  });
  it('rejects non-SSE/error response and cancels its unread body without reflecting it', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode('test-ai-secret')); }, cancel }), { status: 429 })));
    const res = await generate(request()); expect(res.status).toBe(502); expect(await res.text()).toBe('UPSTREAM_UNAVAILABLE'); expect(cancel).toHaveBeenCalled();
  });
  it('bounds emitted bytes including the final error marker', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(chunk('가'.repeat(50000)) + 'data: [DONE]\n')));
    const res = await generate(request()); const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeLessThanOrEqual(128 * 1024); expect(new TextDecoder().decode(bytes)).toContain('OUTPUT_TOO_LARGE');
  });
  it('bounds a provider that sends endless comments or a huge non-data line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(':' + 'x'.repeat(1024 * 1024))));
    expect(await (await generate(request())).text()).toContain('OUTPUT_TOO_LARGE');
  });
  it('aborts idle body at 15 seconds, cancels reader, and clears all timers', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { upstreamSignal = init.signal; return response(new ReadableStream({ cancel })); }));
    const res = await generate(request()); const done = res.text();
    await vi.advanceTimersByTimeAsync(15001);
    expect(await done).toContain('UPSTREAM_TIMEOUT'); expect(upstreamSignal?.aborted).toBe(true); expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds stalled headers at 55 seconds even when fetch ignores AbortSignal', async () => {
    vi.useFakeTimers(); let entered: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    vi.stubGlobal('fetch', vi.fn(() => { entered!(); return new Promise<Response>(() => {}); }));
    const pending = generate(request()); await started;
    await vi.advanceTimersByTimeAsync(55001);
    const res = await pending; expect(res.status).toBe(502); expect(await res.text()).toBe('UPSTREAM_TIMEOUT'); expect(vi.getTimerCount()).toBe(0);
  });
  it('enforces the same 55 second overall budget despite body keepalives', async () => {
    vi.useFakeTimers(); let upstream: ReadableStreamDefaultController<Uint8Array> | undefined;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new ReadableStream({ start(c) { upstream = c; } }))));
    const res = await generate(request()); const done = res.text();
    for (let i = 0; i < 5; i++) { await vi.advanceTimersByTimeAsync(10000); upstream!.enqueue(enc.encode(': processing\n')); await vi.advanceTimersByTimeAsync(0); }
    await vi.advanceTimersByTimeAsync(5001);
    expect(await done).toContain('UPSTREAM_TIMEOUT'); expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates downstream cancellation and releases the duplicate slot', async () => {
    const cancel = vi.fn(); let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { upstreamSignal = init.signal; return response(new ReadableStream({ cancel })); }));
    const res = await generate(request());
    expect((await generate(request())).status).toBe(409);
    await res.body!.cancel(); expect(upstreamSignal?.aborted).toBe(true); expect(cancel).toHaveBeenCalled();
    const retry = await generate(request()); expect(retry.status).toBe(200); await retry.body!.cancel();
  });
  it('propagates original request cancellation to an ongoing stream', async () => {
    const parent = new AbortController(); const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(new ReadableStream({ cancel }))));
    const res = await generate(request('검토', parent.signal)); const text = res.text(); parent.abort();
    expect(await text).toContain('REQUEST_CANCELLED'); expect(cancel).toHaveBeenCalled();
  });
  it('permits 20,000 Korean characters under the 96KiB input budget', async () => {
    const fetch = vi.fn().mockResolvedValue(response(chunk('정상') + 'data: [DONE]\n')); vi.stubGlobal('fetch', fetch);
    const res = await generate(request('가'.repeat(20000))); expect(await res.text()).toBe('정상'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['provider/paid', 'provider/unknown:free', 'openrouter/auto', 'x\ntest-ai-secret'])('rejects unapproved server model %s', async (model) => {
    vi.stubEnv('LLM_MODEL', model); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const res = await generate(request()); expect(res.status).toBe(503); expect(await res.text()).toBe('SERVER_UNAVAILABLE'); expect(fetch).not.toHaveBeenCalled();
  });
  it('limits two different concurrent generations and rejects a third', async () => {
    const fetch = vi.fn(async () => response(new ReadableStream())); vi.stubGlobal('fetch', fetch);
    const one = await generate(request('첫째')); const two = await generate(request('둘째'));
    const three = await generate(request('셋째')); expect(three.status).toBe(429); expect(three.headers.get('Retry-After')).toBe('60'); expect(fetch).toHaveBeenCalledTimes(2);
    await one.body!.cancel(); await two.body!.cancel();
  });
});

describe('bounded request reads and instance gate', () => {
  it('checks actual streamed bytes even with a smaller declared Content-Length', async () => {
    const cancel = vi.fn(); const operation = new Operation(new AbortController().signal, 1000);
    const body = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(100)); }, cancel }), { headers: { 'Content-Length': '1' } });
    try { await expect(boundedBytes(body, operation, 10, new ApiError('PAYLOAD_TOO_LARGE', 413))).rejects.toMatchObject({ status: 413 }); expect(cancel).toHaveBeenCalled(); }
    finally { operation.dispose(); }
  });
  it('bounds a slowly uploaded JSON request', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    const req = new Request('https://example.test/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: new ReadableStream({ cancel }), duplex: 'half' } as RequestInit);
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); const pending = generate(req);
    await vi.advanceTimersByTimeAsync(55001);
    const res = await pending; expect(res.status).toBe(502); expect(cancel).toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('limits 12 admitted starts per rolling minute, then expires the rate window', () => {
    const gate = new GenerationGate();
    for (let i = 0; i < 12; i++) gate.reserve(String(i), i)();
    expect(() => gate.reserve('overflow', 12)).toThrow('RATE_LIMITED');
    expect(() => gate.reserve('expired', 60012)).not.toThrow();
  });
  it('expires abandoned duplicate entries without requiring a cleanup timer', () => {
    const gate = new GenerationGate(); gate.reserve('a', 0);
    expect(() => gate.reserve('a', 1)).toThrow('DUPLICATE_REQUEST');
    expect(() => gate.reserve('a', 55001)).not.toThrow();
  });
});
