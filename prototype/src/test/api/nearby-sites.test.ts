import { describe, expect, it } from 'vitest';

import { buildCandidates, geometryAreaM2, MINIMUM_AREA_M2 } from '../../../api/nearby-sites.js';

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
