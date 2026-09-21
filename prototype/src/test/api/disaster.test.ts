import { afterEach, describe, expect, it, vi } from 'vitest';

import handler, { parseDisasterRiskHits } from '../../../api/disaster.js';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('parseDisasterRiskHits', () => {
  it('returns no hits for a valid NOT_FOUND response', () => {
    expect(parseDisasterRiskHits({ response: { status: 'NOT_FOUND' } })).toEqual([]);
  });

  it('keeps scalar public attributes and derives the zone name', () => {
    expect(
      parseDisasterRiskHits({
        response: {
          status: 'OK',
          result: {
            featureCollection: {
              features: [
                {
                  properties: {
                    dstrct_nm: '침수위험지구',
                    grade: 2,
                    active: true,
                    nested: { ignored: true },
                  },
                },
              ],
            },
          },
        },
      }),
    ).toEqual([
      {
        name: '침수위험지구',
        attributes: { dstrct_nm: '침수위험지구', grade: 2, active: true },
      },
    ]);
  });

  it('rejects an unexpected VWorld response status', () => {
    expect(() => parseDisasterRiskHits({ response: { status: 'ERROR' } })).toThrow(
      'UPSTREAM_UNAVAILABLE',
    );
  });

  it.each([{}, { response: { status: 'OK' } }, { response: { status: 'OK', result: { featureCollection: { features: [null] } } } }])('rejects malformed success rather than returning no hits', (body) => {
    expect(() => parseDisasterRiskHits(body)).toThrow();
  });
});

describe('disaster route', () => {
  const request = () => new Request('https://example.test/api/disaster?lat=36.49&lng=127.3');
  const setup = () => { vi.stubEnv('VWORLD_API_KEY', 'test-key'); vi.stubEnv('VWORLD_DOMAIN', 'https://example.test'); };

  it('returns a cacheable verified negative and sends the registered domain', async () => {
    setup();
    const fetch = vi.fn().mockResolvedValue(Response.json({ response: { status: 'NOT_FOUND' } }));
    vi.stubGlobal('fetch', fetch);
    const response = await handler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ found: false, layer: 'LT_C_UP201', hits: [], coordinate: { lat: 36.49, lng: 127.3 } });
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, s-maxage=300');
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.searchParams.get('geomFilter')).toBe('POINT(127.3 36.49)');
    expect(url.searchParams.get('domain')).toBe('https://example.test');
  });

  it('returns positive hits without scoring in the route', async () => {
    setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ response: { status: 'OK', result: { featureCollection: { features: [{ properties: { uname: '시험지구' } }] } } } })));
    const response = await handler(request());
    expect(await response.json()).toMatchObject({ found: true, hits: [{ name: '시험지구' }] });
  });

  it('does not cache or reflect upstream errors', async () => {
    setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('key=test-key', { headers: { 'Content-Type': 'text/html' } })));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('test-key');
  });

  it('surfaces network timeouts as uncacheable failure', async () => {
    setup();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'AbortError')));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects unsupported methods, missing keys, and invalid coordinates', async () => {
    setup();
    expect((await handler(new Request(request(), { method: 'POST' }))).status).toBe(405);
    expect((await handler(new Request('https://example.test/api/disaster?lat=NaN&lng=127'))).status).toBe(400);
    expect((await handler(new Request('https://example.test/api/disaster'))).status).toBe(400);
    vi.stubEnv('VWORLD_API_KEY', '');
    expect((await handler(request())).status).toBe(503);
  });
});
