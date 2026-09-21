import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zoning from '../../../api/zoning.js';
import restrictions from '../../../api/restrictions.js';
import disaster from '../../../api/disaster.js';
import geocode from '../../../api/geocode.js';
import nearby from '../../../api/nearby-sites.js';
import wms from '../../../api/wms.js';
import generate from '../../../api/generate.js';

const point = '?lat=37.56654&lng=126.97804';
const route = (name: string, query = point, init?: RequestInit) => new Request(`https://example.test/api/${name}${query}`, init);
const aiRequest = (body: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }) => route('generate', '', { method: 'POST', headers, body });
const negative = () => Response.json({ response: { status: 'NOT_FOUND' } });
const ok = (features: unknown[]) => Response.json({ response: { status: 'OK', result: { featureCollection: { features } } } });
const mockFetch = (fn: (...args: unknown[]) => unknown = negative) => { const mock = vi.fn(async (...args: unknown[]) => fn(...args)); vi.stubGlobal('fetch', mock); return mock; };
const handlers = { zoning, restrictions, disaster, geocode, 'nearby-sites': nearby, wms };

beforeEach(() => { vi.stubEnv('VWORLD_API_KEY', 'test-secret-key'); vi.stubEnv('OPENROUTER_API_KEY', 'test-ai-key'); vi.stubEnv('VWORLD_DOMAIN', 'https://example.test'); vi.stubEnv('LLM_MODEL', ''); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('verified baseline failures', () => {
  it.each([{}, { response: { status: 'OK' } }, { response: { status: 'OK', result: { featureCollection: { features: null } } } }])('never promotes malformed VWorld JSON to no constraint', async (body) => {
    mockFetch(() => Response.json(body));
    for (const handler of [zoning, restrictions, disaster]) {
      const res = await handler(route('lookup'));
      expect(res.status).toBe(502);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });
  it.each(['{', 'null', '[]', '{"prompt":{}}', '{"prompt":4}', '{"prompt":"   "}'])('rejects malformed generate input without calling upstream: %s', async (body) => {
    const fetch = mockFetch();
    const res = await generate(aiRequest(body));
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps a restriction hit when a different layer fails and marks partial without cache', async () => {
    mockFetch((url) => (url as URL).searchParams.get('data') === 'LT_C_UD801' ? ok([{ properties: { uname: '개발제한구역' } }]) : Response.json({ response: { status: 'OK' } }));
    const res = await restrictions(route('restrictions'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ complete: false, hits: [{ layer: 'LT_C_UD801', name: '개발제한구역', buffered: false }], failed: expect.any(Array), coordinate: { lat: 37.5665, lng: 126.978 }, fetchedAt: expect.any(String), version: expect.any(String) });
  });
  it('exposes partial zoning queries and does not cache a positive partial result', async () => {
    mockFetch((url) => (url as URL).searchParams.get('data') === 'LT_C_UQ111' ? ok([{ properties: { uname: '준공업지역' } }]) : new Response('private-key', { status: 429 }));
    const res = await zoning(route('zoning'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ found: true, landUse: 'semiIndustrial', queried: ['LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114'], failed: ['LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114'], complete: false, coordinate: { lat: 37.5665, lng: 126.978 } });
  });
});

describe('public input and safe failures', () => {
  it.each(Object.entries(handlers))('%s requires GET, returns Allow and no-store', async (name, handler) => {
    const res = await handler(route(name, '', { method: 'POST' }));
    expect(res.status).toBe(405); expect(res.headers.get('Allow')).toBe('GET'); expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
  it('generate requires POST and advertises Allow', async () => {
    const res = await generate(route('generate', '')); expect(res.status).toBe(405); expect(res.headers.get('allow')).toBe('POST');
  });
  it.each(['?lat=37&lng=127&lat=38', '?lat=&lng=127', '?lat=Infinity&lng=127', '?lat=37', '?lat=40&lng=127'])('rejects invalid or duplicate coordinates %s', async (query) => {
    const fetch = mockFetch();
    for (const handler of [zoning, restrictions, disaster, nearby]) expect((await handler(route('lookup', query))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['&buffer=', '&buffer=1.5', '&buffer=1001', '&buffer=0&buffer=500'])('rejects invalid or duplicate buffers %s', async (suffix) => {
    const fetch = mockFetch(); expect((await restrictions(route('restrictions', point + suffix))).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
  it('does input validation before missing-key configuration errors', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', ''); vi.stubEnv('VWORLD_API_KEY', '');
    expect((await generate(aiRequest('null'))).status).toBe(400);
    expect((await zoning(route('zoning', '?lat=bad'))).status).toBe(400);
  });
  it('enforces JSON media type and both declared and actual byte caps', async () => {
    const fetch = mockFetch();
    expect((await generate(aiRequest('{"prompt":"test"}', { 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await generate(aiRequest('{"prompt":"test"}', { 'Content-Type': 'application/json', 'Content-Length': '100000' }))).status).toBe(413);
    expect((await generate(aiRequest(JSON.stringify({ prompt: 'test', ignored: 'x'.repeat(100000) })))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([null, [], {}, { uname: 42 }, { uname: 'x'.repeat(2001) }].map((value) => [value]))('does not silently remove invalid restriction features/properties %j', async (properties) => {
    mockFetch(() => ok([properties === null ? null : { properties }]));
    const res = await restrictions(route('restrictions'));
    // An empty property object is valid: the feature still establishes a hit with an unknown name.
    if (properties && !Array.isArray(properties) && Object.keys(properties).length === 0) expect(await res.json()).toMatchObject({ complete: true, hits: expect.arrayContaining([{ layer: 'LT_C_UD801', name: null, buffered: false }]) });
    else expect(res.status).toBe(502);
  });
  it.each([zoning, restrictions, disaster, nearby, geocode])('does not reflect provider HTML, URLs, errors, or secrets', async (handler) => {
    mockFetch(() => new Response('<error>https://api.vworld.kr?key=test-secret-key</error>', { status: 502 }));
    const res = await handler(route('lookup', point + '&q=서울'));
    expect(res.status).toBe(502); expect(await res.text()).not.toMatch(/test-secret-key|api.vworld|<error>/);
  });
});

describe('geocode status boundaries', () => {
  it('auth errors are 502, not address not found', async () => {
    const fetch = mockFetch(() => Response.json({ response: { status: 'ERROR', error: { text: 'test-secret-key' } } }));
    const res = await geocode(route('geocode', '?q=서울')); expect(res.status).toBe(502); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('only explicit NOT_FOUND triggers PARCEL fallback then 404', async () => {
    const fetch = mockFetch(); const res = await geocode(route('geocode', '?q=서울')); expect(res.status).toBe(404); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([{ point: { x: 127, y: 90 } }, { point: { x: null, y: 37 } }, { point: { x: 127, y: 37 }, label: {} }])('rejects malformed coordinate or label %j', async ({ point: p, label }) => {
    mockFetch(() => Response.json({ response: { status: 'OK', result: { point: p }, ...(label ? { refined: { text: label } } : {}) } }));
    expect((await geocode(route('geocode', '?q=서울'))).status).toBe(502);
  });
  it('rejects duplicate query', async () => { const fetch = mockFetch(); expect((await geocode(route('geocode', '?q=서울&q=부산'))).status).toBe(400); expect(fetch).not.toHaveBeenCalled(); });
});

describe('header and body deadlines', () => {
  it('stops a stalled JSON body within the 12 second operation deadline', async () => {
    vi.useFakeTimers(); const cancel = vi.fn(); let signal: AbortSignal | undefined;
    mockFetch((_url, init) => { signal = (init as RequestInit).signal as AbortSignal; return new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/json' } }); });
    const pending = disaster(route('disaster'));
    await vi.advanceTimersByTimeAsync(12001);
    expect(signal?.aborted).toBe(true); expect(cancel).toHaveBeenCalled();
    const res = await pending; expect(res.status).toBe(502); expect(await res.text()).toContain('UPSTREAM_TIMEOUT'); expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates request cancellation into a stalled upstream body', async () => {
    const abort = new AbortController(); const cancel = vi.fn(); let signal: AbortSignal | undefined;
    mockFetch((_url, init) => { signal = (init as RequestInit).signal as AbortSignal; return new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/json' } }); });
    const pending = disaster(route('disaster', point, { signal: abort.signal }));
    await new Promise((resolve) => setTimeout(resolve, 0)); abort.abort();
    expect(signal?.aborted).toBe(true);
    const res = await pending; expect(res.status).toBe(502); expect(cancel).toHaveBeenCalled();
  });
});
