import { describe, expect, it } from 'vitest';
import { loadAppData } from '../test/loadData';
import { disasterFixture, lat, lng, prohibitedHit, restrictionFixture, zoningFixture } from '../test/onlineFixtures';
import { scoreSite } from './engine';
import type { ScoreInput } from '../types';
import { fmtPopulation } from '../lib/format';
const data = loadAppData();
const base = (): ScoreInput => ({ lat, lng, landUse: 'industrial', landUseSource: 'auto', zoning: zoningFixture(), restrictions: restrictionFixture(), disaster: disasterFixture() });
describe('required online evidence completeness', () => {
  it('scores a current complete reference fixture', () => { expect(scoreSite(base(), data).permit.score).not.toBeNull(); });
  it('explains only missing required evidence and preserves the other computed field', () => {
    const result = scoreSite(base(), { ...data, emdPower: [], households: null, newsSignal: null, permitDelay: null });
    expect(result.permit.score).not.toBeNull();
    expect(result.composite.score).toBeNull();
    expect(result.composite.unavailableReasons).toEqual(['해당 읍면동의 한전 공급 변전소 공개 목록 미확인']);
    expect(scoreSite(base(), data).composite.unavailableReasons).toEqual([]);
  });
  it('keeps an invalid non-number supply count unscored', () => {
    const result = scoreSite(base(), { ...data, emdPower: data.emdPower.map(row => ({ ...row, count: Number.NaN })) });
    expect(result.power.score).toBeNull();
    expect(result.composite.score).toBeNull();
    expect(result.composite.unavailableReasons).toContain('해당 읍면동의 한전 공급 변전소 공개 목록 미확인');
  });
  it('distinguishes an explicitly published zero from a missing population cell', () => {
    const known = scoreSite(base(), { ...data, popGrid: [[lat, lng, 0]] });
    const missing = scoreSite(base(), { ...data, popGrid: [] });
    expect(known.permit.popNearby).toBe(0);
    expect(known.composite.score).not.toBeNull();
    expect(missing.permit.popNearby).toBeNull();
    expect(missing.composite.score).toBeNull();
    expect(missing.composite.unavailableReasons).toContain('반경 내 인구 격자 미확인');
    expect(fmtPopulation(0)).toContain('비밀보호 조정, 무거주 여부 미확인');
    expect(fmtPopulation(null)).toBe('미확인');
  });
  it.each(['zoning', 'disaster', 'restrictions'] as const)('withholds permit and composite scores for partial %s', (key) => {
    const input = base(); input[key] = { ...input[key]!, complete: false } as never;
    const result = scoreSite(input, data);
    expect(result.permit.score).toBeNull(); expect(result.composite.score).toBeNull();
  });
  it('preserves the disaster observation/deduction and a separate prohibited E cap while withholding scores', () => {
    const input = base();
    input.disaster = { ...disasterFixture(), found: true, hits: [{ name: '침수지구', attributes: {} }], failed: ['LT_C_UP201'], complete: false };
    input.restrictions = { ...restrictionFixture(), hits: [prohibitedHit], complete: false, stale: true };
    const result = scoreSite(input, data);
    expect(result.disaster).toMatchObject({ status: 'hit', deduction: 15, complete: false });
    expect(result.composite).toMatchObject({ score: null, grade: 'E', capReason: 'restriction' });
    expect(result.permit.score).toBeNull();
  });
  it('manual classification remains an assumption and cannot certify partial or missing online coverage', () => {
    const input = { ...base(), landUseSource: 'manual' as const, zoning: { ...zoningFixture(), complete: false } };
    expect(scoreSite(input, data).permit.score).toBeNull();
    expect(scoreSite({ ...input, zoning: null }, data).permit.score).toBeNull();
    expect(scoreSite({ ...input, zoning: zoningFixture() }, data).permit.score).not.toBeNull();
  });
  it('expired observations cannot certify completeness but retain confirmed restrictions', () => {
    const input = base(); input.restrictions = { ...restrictionFixture(), hits: [prohibitedHit], fetchedAt: new Date(Date.now() - 600_001).toISOString() };
    expect(scoreSite(input, data).composite).toMatchObject({ score: null, grade: 'E' });
  });
});
