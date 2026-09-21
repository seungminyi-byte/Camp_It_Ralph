import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zoning from '../../../api/zoning.js';
import restrictions from '../../../api/restrictions.js';
import disaster from '../../../api/disaster.js';
import geocode from '../../../api/geocode.js';
import nearby from '../../../api/nearby-sites.js';
import { fetchVworld } from '../../../api/_vworld.js';
import { Operation } from '../../../api/_http.js';

const request = (name: string, query = 'lat=37.56654&lng=126.97804', signal?: AbortSignal) => new Request(`https://example.test/api/${name}?${query}`, { signal });
const negative = () => Response.json({ response: { status: 'NOT_FOUND' } });
const validEmpty = () => Response.json({ response: { status: 'OK', result: { featureCollection: { features: [] } } } });
const validFeature = () => ({ properties: { uname: '준공업지역' } });
beforeEach(() => { vi.stubEnv('VWORLD_API_KEY', 'test-secret-key'); vi.stubEnv('VWORLD_DOMAIN', 'https://example.test'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('VWorld valid shapes and bounded fan-out', () => {
  it.each([negative, validEmpty])('preserves verified negatives for all feature routes', async (factory) => {
    vi.stubGlobal('fetch', vi.fn(async () => factory()));
    expect(await (await zoning(request('zoning'))).json()).toMatchObject({ found: false, complete: true, failed: [], all: [] });
    expect(await (await restrictions(request('restrictions'))).json()).toMatchObject({ complete: true, failed: [], hits: [], bufferM: 500 });
    expect(await (await disaster(request('disaster'))).json()).toMatchObject({ found: false, complete: true, coordinate: { lat: 37.56654, lng: 126.97804 } });
    const result = await (await nearby(request('nearby-sites'))).json(); expect(result).toMatchObject({ candidates: [], searchedTiles: 25 });
  });
  it('buffer zero removes only the heritage buffer query and preserves known unnamed hits', async () => {
    const fetch = vi.fn(async () => Response.json({ response: { status: 'OK', result: { featureCollection: { features: [{ properties: {} }] } } } })); vi.stubGlobal('fetch', fetch);
    const res = await restrictions(request('restrictions', 'lat=37&lng=127&buffer=0')); const body = await res.json();
    expect(fetch).toHaveBeenCalledTimes(5); expect(body.queried).toHaveLength(5); expect(body.hits).toHaveLength(5); expect(body.complete).toBe(true); expect(body.hits.every((hit: { name: unknown; buffered: unknown }) => hit.name === null && hit.buffered === false)).toBe(true);
  });
  it('keeps a full-page heritage hit while refusing to call a size-limited response complete', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.searchParams.get('data') === 'LT_C_UO301' ? Response.json({ response: { status: 'OK', result: { featureCollection: { features: Array.from({ length: 5 }, (_, index) => ({ properties: { uname: `국가유산${index}` } })) } } } }) : negative()));
    const res = await restrictions(request('restrictions')); const body = await res.json();
    expect(body.complete).toBe(false); expect(body.failed).toEqual(['LT_C_UO301', 'LT_C_UO301@500']); expect(body.hits).toHaveLength(10); expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it.each([
    { record: { total: '8', current: '1' }, page: { total: '2', current: '1', size: '5' } },
    { record: { total: 8, current: 1 } },
    { page: { total: 2, current: 1, size: 5 } },
    { record: { total: 'wrong', current: '1' } },
    { record: { total: 0, current: 1 } },
  ])('retains hits but marks inconsistent or incomplete pagination as partial: %j', async (metadata) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ response: { status: 'OK', ...metadata, result: { featureCollection: { features: [validFeature()] } } } })));
    const res = await zoning(request('zoning')); const body = await res.json();
    expect(res.status).toBe(200); expect(body.found).toBe(true); expect(body.complete).toBe(false); expect(body.failed).toHaveLength(4); expect(body.all).toHaveLength(4); expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('preserves complete positive results when pagination matches the actual features', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ response: { status: 'OK', record: { total: '1', current: '1' }, page: { total: '1', current: '1', size: '5' }, result: { featureCollection: { features: [validFeature()] } } } })));
    expect(await (await zoning(request('zoning'))).json()).toMatchObject({ found: true, complete: true, failed: [] });
  });
  it('marks a full disaster page incomplete while keeping all observed hits', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ response: { status: 'OK', result: { featureCollection: { features: Array.from({ length: 10 }, validFeature) } } } })));
    const res = await disaster(request('disaster')); const body = await res.json();
    expect(body).toMatchObject({ found: true, complete: false, failed: ['LT_C_UP201'] }); expect(body.hits).toHaveLength(10); expect(res.headers.get('cache-control')).toBe('no-store');
  });
  it('retains partial empty zoning as explicitly incomplete and uncacheable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.searchParams.get('data') === 'LT_C_UQ111' ? negative() : Response.json({})));
    const res = await zoning(request('zoning')); expect(res.status).toBe(200); expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ found: false, all: [], complete: false, failed: ['LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114'] });
  });
  it.each([null, [], { response: [] }, { response: { status: 'OK', result: { featureCollection: { features: {} } } } }, { response: { status: 'OK', result: { featureCollection: { features: [validFeature(), { properties: [] }] } } } }].map((body) => [body]))('rejects the whole malformed layer %j', async (body) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
    expect((await restrictions(request('restrictions'))).status).toBe(502);
    expect((await zoning(request('zoning'))).status).toBe(502);
  });
  it.each([404, 429, 500])('maps upstream HTTP %i to a safe 502 with no-store and cancels error body', async (status) => {
    const cancel = vi.fn(); vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status })));
    const res = await disaster(request('disaster')); expect(res.status).toBe(502); expect(await res.text()).toBe('UPSTREAM_UNAVAILABLE'); expect(res.headers.get('cache-control')).toBe('no-store'); expect(cancel).toHaveBeenCalled();
  });
  it('rejects oversized JSON and malformed UTF/JSON without reading arbitrary error detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } })));
    expect((await disaster(request('disaster'))).status).toBe(502);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{bad test-secret-key', { headers: { 'Content-Type': 'application/json' } })));
    expect(await (await disaster(request('disaster'))).text()).toBe('UPSTREAM_INVALID');
  });
  it('rejects invalid UTF-8 inside otherwise well-formed JSON strings', async () => {
    const before = new TextEncoder().encode('{"response":{"status":"OK","result":{"featureCollection":{"features":[{"properties":{"uname":"');
    const after = new TextEncoder().encode('"}}]}}}}');
    const bytes = new Uint8Array(before.length + 1 + after.length); bytes.set(before); bytes[before.length] = 255; bytes.set(after, before.length + 1);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { headers: { 'Content-Type': 'application/json' } })));
    expect(await (await disaster(request('disaster'))).text()).toBe('UPSTREAM_INVALID');
  });
  it('bounds all hung headers using one operation budget', async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', vi.fn((_url, init) => { signals.push(init.signal); return new Promise<Response>(() => {}); }));
    const pending = restrictions(request('restrictions')); await vi.advanceTimersByTimeAsync(12001);
    const res = await pending; expect(await res.text()).toBe('UPSTREAM_TIMEOUT'); expect(signals).toHaveLength(6); expect(signals.every((signal) => signal.aborted)).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it('shares 12 seconds between ROAD headers/body and PARCEL fallback', async () => {
    vi.useFakeTimers();
    let road: ReadableStreamDefaultController<Uint8Array> | undefined;
    const cancel = vi.fn();
    const fetch = vi.fn(async (url: URL) => url.searchParams.get('type') === 'ROAD' ? new Response(new ReadableStream({ start(c) { road = c; } }), { headers: { 'Content-Type': 'application/json' } }) : new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch); const pending = geocode(request('geocode', 'q=서울'));
    await vi.advanceTimersByTimeAsync(9000); road!.enqueue(new TextEncoder().encode('{"response":{"status":"NOT_FOUND"}}')); road!.close(); await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2); await vi.advanceTimersByTimeAsync(3001);
    expect(await (await pending).text()).toBe('UPSTREAM_TIMEOUT'); expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('shares the same budget across nearby staged tile queries', async () => {
    vi.useFakeTimers(); let first: ReadableStreamDefaultController<Uint8Array> | undefined;
    const cancel = vi.fn(); let calls = 0;
    const fetch = vi.fn(async () => new Response(new ReadableStream({ start(c) { if (++calls === 1) first = c; }, cancel }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch); const pending = nearby(request('nearby-sites'));
    await vi.advanceTimersByTimeAsync(9000); first!.enqueue(new TextEncoder().encode('{"response":{"status":"NOT_FOUND"}}')); first!.close(); await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(9); await vi.advanceTimersByTimeAsync(3001);
    expect(await (await pending).text()).toBe('UPSTREAM_TIMEOUT'); expect(cancel).toHaveBeenCalledTimes(8); expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels sibling nearby queries when one tile fails, rather than caching an incomplete recommendation', async () => {
    let calls = 0; const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (++calls === 1) return negative();
      if (calls === 2) return Response.json({});
      return new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'application/json' } });
    }));
    const res = await nearby(request('nearby-sites')); expect(res.status).toBe(502); expect(res.headers.get('cache-control')).toBe('no-store');
    await new Promise((resolve) => setTimeout(resolve, 0)); expect(cancel).toHaveBeenCalledTimes(7);
  });
  it('cleans the parent listener and deadline on success', async () => {
    vi.useFakeTimers(); const parent = new AbortController();
    const req = request('disaster', undefined, parent.signal); const add = vi.spyOn(req.signal, 'addEventListener'), remove = vi.spyOn(req.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn(async () => negative())); expect((await disaster(req)).status).toBe(200);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not make an upstream request after incoming cancellation', async () => {
    const parent = new AbortController(); parent.abort(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(await (await disaster(request('disaster', undefined, parent.signal))).text()).toBe('REQUEST_CANCELLED'); expect(fetch).not.toHaveBeenCalled();
  });
  it('allows only fixed VWorld upstream paths and disallows redirect following', async () => {
    const operation = new Operation(new AbortController().signal, 12000); const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => negative()); vi.stubGlobal('fetch', fetch);
    try {
      await expect(fetchVworld(new URL('https://other.test/path'), 'test', 'https://example.test', operation)).rejects.toThrow('UPSTREAM_INVALID');
      expect(fetch).not.toHaveBeenCalled();
      await fetchVworld(new URL('https://api.vworld.kr/req/data'), 'test', 'https://example.test', operation);
      expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    } finally { operation.dispose(); }
  });
  it('accepts valid geocoded labels and coordinate strings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ response: { status: 'OK', result: { point: { x: '126.9780', y: '37.5665' } }, refined: { text: '서울특별시 중구 세종대로' } } })));
    const res = await geocode(request('geocode', 'q=서울')); expect(await res.json()).toMatchObject({ lat: 37.5665, lng: 126.978, label: '서울특별시 중구 세종대로' });
  });
  it('rejects malformed server credentials without printing values or fetching', async () => {
    const fetch = vi.fn(); const logs = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')]; vi.stubGlobal('fetch', fetch); vi.stubEnv('VWORLD_API_KEY', 'test-secret-key\n');
    const res = await disaster(request('disaster')); expect(res.status).toBe(503); expect(await res.text()).toBe('SERVER_UNAVAILABLE'); expect(fetch).not.toHaveBeenCalled(); logs.forEach((log) => expect(log).not.toHaveBeenCalled());
  });
});
