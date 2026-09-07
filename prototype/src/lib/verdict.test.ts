import { describe, expect, it } from 'vitest';
import type { ScoreResult } from '../types';
import { siteVerdict } from './verdict';

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
  it('prioritizes incomplete evidence over grade interpretation', () => {
    expect(siteVerdict(result('E')).label).toBe('부적합');
    expect(siteVerdict(result('E'), true).label).toBe('조건부 검토');
  });
});
