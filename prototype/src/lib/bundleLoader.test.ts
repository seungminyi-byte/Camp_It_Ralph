import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUNDLE_DEADLINE_MS, BUNDLE_LIMITS, BundleLoader, fetchBundleText } from './bundleLoader';
const parse = (text: string) => JSON.parse(text) as unknown;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('B01 bundle bounds', () => {
  it('loads every actual current bundle within explicit bounds, including protected and household files', async () => {
    for (const [name, limit] of Object.entries(BUNDLE_LIMITS)) {
      const bytes = readFileSync(new URL(`../../public/data/${name}`, import.meta.url)); expect(bytes.length).toBeLessThan(limit);
      vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'content-length': String(bytes.length) } })));
      expect(await fetchBundleText(`/data/${name}`, limit, new AbortController().signal)).toBe(bytes.toString('utf8'));
    }
  });
  it('rejects declared, streamed overflows and HTML fallback', async () => {
    for (const response of [new Response('x', { headers: { 'content-length': '999' } }), new Response('too many bytes'), new Response('html', { headers: { 'content-type': 'text/html' } })]) {
      vi.stubGlobal('fetch', vi.fn(async () => response)); await expect(fetchBundleText('/data/example', 10, new AbortController().signal)).rejects.toThrow();
    }
  });
});
describe('B02-B04 shared leases, complete-body deadline and retry', () => {
  it('stops stalled body at 15 seconds and retries a failed promise', async () => {
    vi.useFakeTimers(); let cancelled = false;
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(new ReadableStream({ cancel() { cancelled = true; } }))).mockResolvedValueOnce(new Response('{"ok":true}'));
    vi.stubGlobal('fetch', fetcher); const loader = new BundleLoader(); const first = loader.acquire('constants.json', parse);
    const failure = expect(first.promise).rejects.toThrow('제한시간'); await vi.advanceTimersByTimeAsync(BUNDLE_DEADLINE_MS); await failure; expect(cancelled).toBe(true);
    const second = loader.acquire('constants.json', parse); await expect(second.promise).resolves.toEqual({ ok: true }); second.release();
    await expect(loader.acquire('constants.json', parse).promise).resolves.toEqual({ ok: true }); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('shares requests and aborts only after final lease with StrictMode same-turn reclaim', async () => {
    let body!: ReadableStreamDefaultController<Uint8Array>; let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => { signal = options.signal; return new Response(new ReadableStream({ start(c) { body = c; } })); }));
    const loader = new BundleLoader(), one = loader.acquire('constants.json', parse), two = loader.acquire('constants.json', parse);
    expect(one.promise).toBe(two.promise); one.release(); await Promise.resolve(); expect(signal.aborted).toBe(false);
    two.release(); const reclaimed = loader.acquire('constants.json', parse); await Promise.resolve(); expect(signal.aborted).toBe(false);
    body.enqueue(new TextEncoder().encode('{"answer":42}')); body.close(); await expect(reclaimed.promise).resolves.toEqual({ answer: 42 }); reclaimed.release();
  });
  it('last cancellation removes pending entry and late completion cannot poison retry', async () => {
    const signals: AbortSignal[] = []; let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((_url, options) => { signals.push(options.signal); return signals.length === 1 ? new Promise<Response>(resolve => { finish = resolve; }) : Promise.resolve(new Response('{"fresh":true}')); }));
    const loader = new BundleLoader(); const abandoned = loader.acquire('constants.json', parse); const rejected = expect(abandoned.promise).rejects.toThrow();
    abandoned.release(); await Promise.resolve(); expect(signals[0].aborted).toBe(true);
    const retry = loader.acquire('constants.json', parse); finish(new Response('{"old":true}')); await rejected; await expect(retry.promise).resolves.toEqual({ fresh: true });
    await expect(loader.acquire('constants.json', parse).promise).resolves.toEqual({ fresh: true });
  });
  it('does not cache parser failures or unavailable optional files', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('invalid')).mockResolvedValueOnce(Response.json({ usable: true })));
    const loader = new BundleLoader(); await expect(loader.acquire('data_centers.json', parse).promise).rejects.toThrow(); await expect(loader.acquire('data_centers.json', parse).promise).resolves.toEqual({ usable: true });
  });
});
