import { describe, expect, it } from 'vitest';
import { loadAppData } from '../test/loadData';
import { disasterFixture, lat, lng, prohibitedHit, restrictionFixture, zoningFixture } from '../test/onlineFixtures';
import { scoreSite } from './engine';
import type { ScoreInput } from '../types';
const data = loadAppData();
const base = (): ScoreInput => ({ lat, lng, landUse: 'industrial', landUseSource: 'auto', zoning: zoningFixture(), restrictions: restrictionFixture(), disaster: disasterFixture() });
describe('required online evidence completeness', () => {
  it('scores a current complete reference fixture', () => { expect(scoreSite(base(), data).permit.score).not.toBeNull(); });
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
