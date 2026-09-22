import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const enc = new TextEncoder();
const frame = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n`;
const request = () => new Request('https://example.test/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'synthetic' }) });
let generate: (req: Request) => Promise<Response>;
beforeEach(async () => {
  vi.resetModules(); generate = (await import('../../../api/generate.js')).default;
  vi.stubEnv('OPENROUTER_API_KEY', 'synthetic-key'); vi.stubEnv('LLM_MODEL', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const sse = (body: BodyInit) => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
const safe = [[401, 'UPSTREAM_AUTH_FAILED'], [429, 'UPSTREAM_RATE_LIMITED'], [504, 'UPSTREAM_PROVIDER_TIMEOUT']] as const;

describe('bounded generation recovery', () => {
  it.each(safe)('classifies HTTP %i without reading private body or retrying', async (status, code) => {
    const pull = vi.fn(), cancel = vi.fn();
    const fetch = vi.fn().mockResolvedValue(new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), { status })); vi.stubGlobal('fetch', fetch);
    const res = await generate(request()); expect(res.status).toBe(502); expect(await res.text()).toBe(code);
    expect(pull).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(safe)('classifies SSE %i without copying provider details', async (status, code) => {
    const fetch = vi.fn().mockResolvedValue(sse(`data: ${JSON.stringify({ error: { code: status, message: 'PRIVATE_PROVIDER_MESSAGE' } })}\n`)); vi.stubGlobal('fetch', fetch);
    const res = await generate(request()); expect(await res.text()).toBe(`\n\n## ERROR\n${code}\n`); expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps a duplicate reserved for the full 180-second generation window', async () => {
    const { GenerationGate } = await import('../../../api/_generation.js'); const gate = new GenerationGate();
    const release = gate.reserve('same', 0);
    expect(() => gate.reserve('same', 55_001)).toThrow('DUPLICATE_REQUEST');
    expect(() => gate.reserve('same', 179_999)).toThrow('DUPLICATE_REQUEST');
    expect(() => gate.reserve('same', 180_000)).not.toThrow(); release();
    expect(() => gate.reserve('same', 180_001)).toThrow('DUPLICATE_REQUEST');
  });
  it('sends one initial byte immediately without counting it as generated text', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(new ReadableStream({ cancel }))));
    const res = await generate(request()); const reader = res.body!.getReader(); const observed = vi.fn(); const first = reader.read().then(observed);
    await vi.advanceTimersByTimeAsync(0); expect(observed).toHaveBeenCalledWith({ done: false, value: enc.encode('\n') }); await first;
    const rest = reader.read(); await vi.advanceTimersByTimeAsync(15_001); expect(new TextDecoder().decode((await rest).value)).toBe('\n## ERROR\nUPSTREAM_TIMEOUT\n');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"textEmitted":false')); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('accepts healthy content after 55 seconds and releases all resources', async () => {
    vi.useFakeTimers(); let upstream!: ReadableStreamDefaultController<Uint8Array>; const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(new ReadableStream({ start(c) { upstream = c; }, cancel }))));
    const res = await generate(request()); const done = res.text();
    for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(10_000); upstream.enqueue(enc.encode(': working\n')); await vi.advanceTimersByTimeAsync(0); }
    upstream.enqueue(enc.encode(frame('긴 정상 의견') + 'data: [DONE]\n'));
    expect(await done).toBe('\n긴 정상 의견'); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); expect(fetch).toHaveBeenCalledOnce();
  });
  it('shares the 20-second startup limit with a stalled incoming body', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); vi.stubGlobal('fetch', vi.fn());
    const req = new Request('https://example.test/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: new ReadableStream({ cancel }), duplex: 'half' } as RequestInit);
    const pending = generate(req); await vi.advanceTimersByTimeAsync(20_001);
    expect(await (await pending).text()).toBe('UPSTREAM_TIMEOUT'); expect(fetch).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('never treats only the initial byte plus DONE as a completed opinion', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse('data: [DONE]\n')));
    expect(await (await generate(request())).text()).toBe('\n\n## ERROR\nUPSTREAM_EMPTY\n');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"textEmitted":false'));
  });
  it('flushes the initial byte after late headers before waiting another idle period', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 19_000));
      return sse(new ReadableStream({ cancel }));
    }));
    // Make the pre-fetch hashing deterministic under the virtual clock.
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32));
    const pending = generate(request()); await vi.advanceTimersByTimeAsync(19_000);
    const response = await pending; const reader = response.body!.getReader();
    expect(await reader.read()).toEqual({ done: false, value: enc.encode('\n') });
    const body = reader.read(); await vi.advanceTimersByTimeAsync(15_001);
    expect(new TextDecoder().decode((await body).value)).toContain('UPSTREAM_TIMEOUT');
    expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not restart the startup budget after slow hashing', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 10_000)); return new ArrayBuffer(32);
    });
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signal = init.signal; return new Promise<Response>(() => {}); }));
    const pending = generate(request()); await vi.advanceTimersByTimeAsync(20_001);
    expect(await (await pending).text()).toBe('UPSTREAM_TIMEOUT'); expect(signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0, 1])('counts the transport byte at the output boundary, extra byte %i', async extra => {
    const payload = 'x'.repeat(128 * 1024 - 129 + extra);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse(frame(payload) + 'data: [DONE]\n')));
    const output = await (await generate(request())).text();
    if (extra) expect(output).toBe('\n\n## ERROR\nOUTPUT_TOO_LARGE\n');
    else expect(output).toBe('\n' + payload);
    expect(enc.encode(output).byteLength).toBeLessThanOrEqual(128 * 1024);
  });

});
