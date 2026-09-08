import { describe, expect, it } from 'vitest';
import { scoreSite } from '../scoring/engine';
import { loadAppData, loadScenarios } from '../test/loadData';
import { CHECKLIST_KEYS, buildChecklist } from './checklist';
import type { ScoreInput } from '../types';
const data = loadAppData();
const sc = loadScenarios()[2];
const input: ScoreInput = { lat: sc.lat, lng: sc.lng, landUse: sc.landUse };
const rowsFor = (at = input, d = data) =>
  buildChecklist(scoreSite(at, d), d, {
    input: at,
    landUseSource: 'manual',
    zoningName: null,
  });
const row = (key: string, at = input, d = data) =>
  rowsFor(at, d).find((r) => r.key === key)!;
describe('evidence report without AI', () => {
  it('includes area, finance and consultations in a deterministic complete checklist', () => {
    expect(rowsFor().map((r) => r.key)).toEqual([...CHECKLIST_KEYS]);
    expect(rowsFor().every((r) => r.evidence.length > 0)).toBe(true);
    expect(row('cost.finance').evidence).toContain('계산 가정');
  });
  it('keeps absent news distinct from a collected zero and has no acceptance deduction', () => {
    expect(
      row('permit.news', input, { ...data, newsSignal: null }).verdict,
    ).toBe('na');
    expect(row('permit.news').points).toBeNull();
    expect(row('permit.cases').points).toBeNull();
  });
  it('does not represent household gaps as a zero or an absence of residents', () => {
    const h = row('permit.population', input, { ...data, households: null });
    expect(h.evidence).toContain('가구 미확인');
    expect(h.verdict).toBe('na');
    expect(h.evidence).toContain('격자 중심점');
    expect(row('permit.school').evidence).toContain(
      '법정 보호구역 경계거리가 아님',
    );
  });
  it('keeps failed restriction lookups unknown and a park restriction as a constraint', () => {
    expect(row('permit.restriction').verdict).toBe('na');
    const park = row('permit.restriction', {
      ...input,
      lat: 37.66,
      lng: 126.98,
      landUse: 'green',
    });
    expect(park.verdict).toBe('risk');
    expect(park.points).toBe(40);
  });
  it('never implies a missing power listing means that the site cannot proceed', () => {
    const p = row('power.gate', input, { ...data, emdPower: [] });
    expect(p.verdict).toBe('na');
    expect(p.evidence).toContain('공급 가능 용량 미확인');
    expect(p.evidence).not.toContain('권장조건');
  });
});
