import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import geocode from '../../../api/geocode.js';
import generate from '../../../api/generate.js';

const request = (kind: 'vworld' | 'ai', suffix = '') => kind === 'vworld'
  ? new Request('https://example.test/api/geocode?q=public-address')
  : new Request('https://example.test/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: `synthetic redirect regression ${suffix}` }) });
const handler = { vworld: geocode, ai: generate };
beforeEach(() => {
  vi.stubEnv('VWORLD_API_KEY', 'test-vworld-key');
  vi.stubEnv('VWORLD_DOMAIN', 'https://example.test');
  vi.stubEnv('OPENROUTER_API_KEY', 'test-ai-key');
  vi.stubEnv('LLM_MODEL', '');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Edge-compatible redirect rejection', () => {
  it.each(['vworld', 'ai'] as const)('%s works where the runtime rejects redirect:error before any network request', async (kind) => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.redirect === 'error') throw new TypeError('Invalid redirect value; supported values are follow or manual');
      // Automatic redirect following would expose the existing upstream credentials.
      expect(init?.redirect).toBe('manual');
      if (kind === 'vworld') return Response.json({ response: { status: 'OK', result: { point: { x: '127.3007', y: '36.4967' } } } });
      return new Response('data: {"choices":[{"delta":{"content":"검수용 응답"}}]}\n\ndata: [DONE]\n', { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fetch);
    const response = await handler[kind](request(kind, 'success'));
    expect(response.status).toBe(200);
    if (kind === 'vworld') expect(await response.json()).toMatchObject({ lat: 36.4967, lng: 127.3007 });
    else expect(await response.text()).toBe('검수용 응답');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  for (const kind of ['vworld', 'ai'] as const) it.each([301, 302, 303, 307, 308])(`${kind} rejects HTTP %s without following, consuming, or reflecting the redirect body`, async (status) => {
    const cancel = vi.fn();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe('manual');
      return new Response(new ReadableStream({ cancel }), { status, headers: { Location: 'https://untrusted.example/collect?key=test-vworld-key' } });
    });
    vi.stubGlobal('fetch', fetch);
    const response = await handler[kind](request(kind, String(status)));
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('UPSTREAM_UNAVAILABLE');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
