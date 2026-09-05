import { describe, expect, it } from 'vitest';
import { loadAppData } from '../test/loadData';
import { nearest } from './geo';
import { classifyCoverage } from './coverage';

const data = loadAppData();
const cfg = data.constants.scoring.coverage;

function verdict(lat: number, lng: number) {
  const m = nearest(lat, lng, data.emdCentroids, (c) => [c.lat, c.lng]);
  return classifyCoverage(
    lat,
    lng,
    m ? { label: `${m.item.sido} ${m.item.sigungu} ${m.item.emd}`, distanceKm: m.distanceKm } : null,
    cfg,
  );
}

describe('classifyCoverage', () => {
  it('leaves every bundled 읍면동 centroid inside — the MDL line must never cut South Korean data', () => {
    const outside = data.emdCentroids.filter(
      (c) => classifyCoverage(c.lat, c.lng, { label: c.emd, distanceKm: 0 }, cfg).outside,
    );
    expect(outside.map((c) => `${c.sigungu} ${c.emd}`)).toEqual([]);
  });

  it('flags North Korea, Japan and far-off water with the matching reason', () => {
    expect(verdict(37.97, 126.55).reason).toBe('north'); // 개성
    expect(verdict(37.93, 126.63).reason).toBe('north'); // 개성공단
    expect(verdict(38.04, 125.71).reason).toBe('north'); // 해주
    expect(verdict(38.65, 128.1).reason).toBe('north'); // 금강산
    expect(verdict(39.15, 127.44).reason).toBe('bbox'); // 원산
    expect(verdict(34.4, 129.3).reason).toBe('far'); // 대마도
    expect(verdict(33.59, 130.4).reason).toBe('far'); // 후쿠오카
    expect(verdict(37.24, 131.86).reason).toBe('far'); // 독도 — 울릉읍 중심점에서 89km
    expect(verdict(36.5, 125.0).reason).toBe('far'); // 서해 먼바다
    expect(verdict(37.97, 126.55).detail).toContain('이북');
  });

  it('keeps border islands, DMZ-side counties and the demo sea point inside', () => {
    const inside: [number, number][] = [
      [37.66, 125.7], // 연평도
      [37.96, 124.7], // 백령도
      [37.5, 130.87], // 울릉도
      [33.12, 126.27], // 마라도
      [38.585, 128.36], // 고성 통일전망대
      [38.29, 127.2], // 철원 근북면
      [37.4, 126.2], // README 해상·수역 demo point (16.6km from 을왕동)
    ];
    for (const [lat, lng] of inside) {
      expect(verdict(lat, lng).outside, `${lat},${lng}`).toBe(false);
    }
  });
});
