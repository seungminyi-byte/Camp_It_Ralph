import { afterEach, describe, expect, it, vi } from 'vitest';

import handler, { buildCandidates, geometryAreaM2, MINIMUM_AREA_M2 } from '../../../api/nearby-sites.js';

function square(lng: number, lat: number, sideDegrees: number) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lng, lat],
      [lng + sideDegrees, lat],
      [lng + sideDegrees, lat + sideDegrees],
      [lng, lat + sideDegrees],
      [lng, lat],
    ]],
  };
}

describe('nearby site parcel screening', () => {
  it('calculates a plausible area for a WGS84 parcel polygon', () => {
    const area = geometryAreaM2(square(127, 37.5, 0.001));
    expect(area).toBeGreaterThan(9_000);
    expect(area).toBeLessThan(11_000);
  });

  it('keeps only separate parcels at or above 1,000 pyeong', () => {
    const features = [
      { id: 'current', geometry: square(127, 37.5, 0.001), properties: { pnu: 'current' } },
      { id: 'small', geometry: square(127.002, 37.5, 0.0003), properties: { pnu: 'small' } },
      { id: 'candidate', geometry: square(127.004, 37.5, 0.0007), properties: { pnu: 'candidate', jibun: '테스트 10-1' } },
    ];
    const candidates = buildCandidates(features, 37.5005, 127.0005);
    expect(MINIMUM_AREA_M2).toBe(3_305.8);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ id: 'candidate', label: '테스트 10-1' });
    expect(candidates[0].areaPyeong).toBeGreaterThanOrEqual(1_000);
  });

  it('excludes qualifying parcels outside the 15km circular radius', () => {
    const features = [
      { id: 'near', geometry: square(127.01, 37.5, 0.0007), properties: { pnu: 'near' } },
      { id: 'far', geometry: square(127.2, 37.5, 0.0007), properties: { pnu: 'far' } },
    ];
    expect(buildCandidates(features, 37.5, 127).map((candidate) => candidate.id)).toEqual(['near']);
  });
});


afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const positionA = [127.03, 37.53], positionB = [127.032, 37.53];
const invalidGeometries = [
  ['latitude above WGS84 range from independent probe', square(127.029, 397.529, 0.002)],
  ['negative latitude outside WGS84 range', square(127.029, -322.471, 0.002)],
  ['longitude outside WGS84 range', square(487.029, 37.529, 0.002)],
  ['unclosed ring', { type: 'Polygon', coordinates: [[[127.03, 37.53], [127.032, 37.53], [127.032, 37.532], [127.03, 37.532]]] }],
  ['only two distinct vertices', { type: 'Polygon', coordinates: [[positionA, positionB, positionA, positionA]] }],
  ['three collinear vertices', { type: 'Polygon', coordinates: [[[127, 37.53], [127.01, 37.53], [127.02, 37.53], [127, 37.53]]] }],
  ['malformed hole', { type: 'Polygon', coordinates: [...square(127.029, 37.529, 0.003).coordinates, ...square(127.03, 397.53, 0.001).coordinates] }],
  ['malformed multipolygon member', { type: 'MultiPolygon', coordinates: [square(127.03, 37.53, 0.002).coordinates, square(127.05, 397.53, 0.002).coordinates] }],
  ['empty polygon', { type: 'Polygon', coordinates: [] }],
] as const;

describe('nearby malformed geometry boundary', () => {
  it.each(invalidGeometries)('rejects %s as an uncacheable upstream failure', async (_label, geometry) => {
    vi.stubEnv('VWORLD_API_KEY', 'test-only-key'); vi.stubEnv('VWORLD_DOMAIN', 'https://example.test');
    const fetch = vi.fn(async () => Response.json({ response: { status: 'OK', result: { featureCollection: { features: [{ id: 'malformed', properties: {}, geometry }] } } } })); vi.stubGlobal('fetch', fetch);
    const res = await handler(new Request('https://example.test/api/nearby-sites?lat=37.5&lng=127'));
    expect(res.status).toBe(502); expect(res.headers.get('cache-control')).toBe('no-store'); expect(await res.text()).toBe('UPSTREAM_INVALID'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects a mixed response rather than silently dropping an invalid parcel and certifying the rest', async () => {
    vi.stubEnv('VWORLD_API_KEY', 'test-only-key'); vi.stubEnv('VWORLD_DOMAIN', 'https://example.test');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ response: { status: 'OK', result: { featureCollection: { features: [
      { properties: {}, geometry: square(127.03, 37.53, 0.002) },
      { properties: {}, geometry: square(127.04, 397.53, 0.002) },
    ] } } } })));
    expect((await handler(new Request('https://example.test/api/nearby-sites?lat=37.5&lng=127'))).status).toBe(502);
  });
  it('keeps valid triangles, holes and multipolygons with unchanged area and inclusion behavior', () => {
    const triangle = { type: 'Polygon', coordinates: [[[127.03, 37.53], [127.032, 37.53], [127.03, 37.532], [127.03, 37.53]]] };
    const outer = square(127, 37.5, 0.002), hole = square(127.0005, 37.5005, 0.001);
    const holed = { type: 'Polygon', coordinates: [...outer.coordinates, ...hole.coordinates] };
    const second = square(127.01, 37.5, 0.001);
    const multi = { type: 'MultiPolygon', coordinates: [outer.coordinates, second.coordinates] };
    expect(geometryAreaM2(triangle)).toBeGreaterThan(15000);
    const withAltitude = { ...triangle, coordinates: triangle.coordinates.map((ring) => ring.map((point) => [...point, 10])) };
    expect(geometryAreaM2(withAltitude)).toBe(geometryAreaM2(triangle));
    expect(geometryAreaM2(square(-4, 51, 0.001))).toBeGreaterThan(0);
    expect(geometryAreaM2(holed)).toBeCloseTo(geometryAreaM2(outer) - geometryAreaM2(hole), 6);
    expect(geometryAreaM2(multi)).toBeCloseTo(geometryAreaM2(outer) + geometryAreaM2(second), 6);
    expect(buildCandidates([{ id: 'with-hole', geometry: holed }], 37.501, 127.001)).toHaveLength(1);
    expect(buildCandidates([{ id: 'with-hole', geometry: holed }], 37.50025, 127.00025)).toHaveLength(0);
    expect(buildCandidates([{ id: 'multi', geometry: multi }], 37.49, 127.02)).toHaveLength(1);
  });
});
