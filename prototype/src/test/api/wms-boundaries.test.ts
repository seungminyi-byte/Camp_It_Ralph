import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import wms from '../../../api/wms.js';

const params = 'request=GetMap&layers=lt_c_uq111&crs=EPSG:4326&version=1.1.1&bbox=126,36,127,37&width=1&height=1';
const request = (query = params) => new Request(`https://example.test/api/wms?${query}`);
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
beforeEach(() => { vi.stubEnv('VWORLD_API_KEY', 'test-secret-key'); vi.stubEnv('VWORLD_DOMAIN', 'https://example.test'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('WMS input and PNG boundary', () => {
  it('returns the original bounded, structurally valid PNG bytes and fixed upstream', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(png, { headers: { 'Content-Type': 'image/png' } })); vi.stubGlobal('fetch', fetch);
    const res = await wms(request()); expect(res.status).toBe(200); expect(res.headers.get('Content-Type')).toBe('image/png'); expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
    const url = fetch.mock.calls[0][0] as URL; expect(url.origin + url.pathname).toBe('https://api.vworld.kr/req/wms'); expect(url.searchParams.get('format')).toBe('image/png');
  });
  it.each([
    params + '&BBOX=126,36,127,37', params.replace('126,36,127,37', '127,36,126,37'),
    params.replace('126,36,127,37', ',36,127,37'), params.replace('126,36,127,37', '126,36,181,37'),
    params.replace('width=1', 'width=513'), params.replace('EPSG:4326', 'EPSG:9999'),
    params.replace('lt_c_uq111', 'arbitrary'), params + '&format=image/svg+xml', params + '&srs=EPSG:4326',
    params.replace('layers=lt_c_uq111', 'layers=lt_c_uq111,lt_c_uq111'),
    params.replace('version=1.1.1', 'version=1.3.0'),
  ])('rejects invalid or duplicate WMS parameters before upstream: %s', async (query) => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); expect((await wms(request(query))).status).toBe(400); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['text/html', 'text/xml', 'image/svg+xml', 'image/jpeg', 'image/png'])('does not reflect a non-PNG payload advertised as %s', async (type) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<svg>test-secret-key</svg>', { headers: { 'Content-Type': type } })));
    const res = await wms(request()); expect(res.status).toBe(502); expect(res.headers.get('cache-control')).toBe('no-store'); expect(await res.text()).not.toContain('test-secret-key');
  });
  it('rejects PNG dimensions that differ from the requested tile and corrupt CRC', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(png, { headers: { 'Content-Type': 'image/png' } })));
    expect((await wms(request(params.replace('width=1', 'width=2')))).status).toBe(502);
    const corrupt = png.slice(); corrupt[30] ^= 1;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(corrupt, { headers: { 'Content-Type': 'image/png' } })));
    expect((await wms(request())).status).toBe(502);
  });
  it('caps PNG bytes at 2MiB', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } })));
    expect((await wms(request())).status).toBe(502);
  });
  it('times out after headers if PNG bytes never finish', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(png); }, cancel }), { headers: { 'Content-Type': 'image/png' } })));
    const pending = wms(request()); await vi.advanceTimersByTimeAsync(12001);
    expect(await (await pending).text()).toBe('UPSTREAM_TIMEOUT'); expect(cancel).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
