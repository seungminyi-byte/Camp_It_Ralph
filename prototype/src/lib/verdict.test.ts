import { describe, expect, it } from 'vitest';
import type { ScoreResult } from '../types';
import { siteVerdict, verdictReasons } from './verdict';

function result(grade = 'B') {
  return { site: { eligible: true, status: 'ok', detail: '육지' }, terrain: null,
    permit: { deductions: [] }, emdUncertain: false, composite: { grade },
    project: { requirementsMet: true } } as unknown as ScoreResult;
}
describe('screening verdict safeguards', () => {
  it('does not call incomplete evidence suitable', () => {
    expect(siteVerdict(result(), true).label).toBe('조건부 검토');
    expect(siteVerdict(result()).label).toBe('검토적합');
  });
  it('keeps hard blockers unsuitable with missing data', () => {
    const r = result(); r.terrain = { unsuitable: true } as ScoreResult['terrain'];
    expect(siteVerdict(r, true).label).toBe('부적합');
  });
  it('does not grade locations outside coverage', () => {
    const r = result(); r.site.eligible = false; r.site.status = 'outside';
    expect(siteVerdict(r).label).toBe('판독불가');
  });
  it('does not soften a D/E result when auxiliary evidence is incomplete', () => {
    expect(siteVerdict(result('E')).label).toBe('부적합');
    expect(siteVerdict(result('E'), true).label).toBe('부적합');
    expect(siteVerdict(result('D'), true).label).toBe('부적합');
  });
  it('explains unmet project requirements and the largest permit deduction', () => {
    const r = result('C');
    r.project = {
      requirementsMet: false,
      substationRequirementMet: false,
      distanceRequirementMet: true,
      profile: { targetMw: 100, minSubstations: 2, maxSubstationKm: 5 },
    } as ScoreResult['project'];
    r.gate = { substationCount: 1 } as ScoreResult['gate'];
    r.power = { score: 51, nearestSubstation: { name: '테스트', distanceKm: 2.1 } } as ScoreResult['power'];
    r.permit = {
      score: 37,
      deductions: [{ label: '주거 인접', points: 25, evidence: '반경 1km 인구 밀집' }],
    } as ScoreResult['permit'];
    r.disaster = { status: 'none', hits: [], deduction: 0 };

    const reasons = verdictReasons(r);
    expect(reasons.map((item) => item.title)).toEqual(['규모 대비 변전소 부족', '주거 인접']);
    expect(reasons[0].detail).toContain('권장하지만 현재 1곳');
    expect(reasons[1].detail).toContain('25점 감점');
  });
  it('merges an unknown zoning deduction and missing zoning evidence into one reason', () => {
    const r = result('C');
    r.project = {
      requirementsMet: true,
      substationRequirementMet: true,
      distanceRequirementMet: true,
      profile: { targetMw: 40, minSubstations: 1, maxSubstationKm: 10 },
    } as ScoreResult['project'];
    r.gate = { substationCount: 1 } as ScoreResult['gate'];
    r.power = { score: 60, nearestSubstation: { name: '테스트', distanceKm: 2 } } as ScoreResult['power'];
    r.permit = {
      score: 50,
      deductions: [{ label: '용도지역: 미확인', points: 10, evidence: '용도지역 미확인' }],
    } as ScoreResult['permit'];
    r.disaster = { status: 'none', hits: [], deduction: 0 };

    const reasons = verdictReasons(r, ['공식 용도지역', '용도지역 조회 오류 재확인']);
    expect(reasons.filter((item) => item.title.includes('용도지역'))).toHaveLength(1);
    expect(reasons[0].title).toBe('용도지역 확인 필요');
  });
});
