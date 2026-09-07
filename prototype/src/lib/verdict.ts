import type { ScoreResult } from '../types';

/** UI interpretation of existing grades; not an official permitting decision. */
export function siteVerdict(r: ScoreResult, incomplete = false) {
  if (!r.site.eligible) return { label: r.site.status === 'sea' ? '부적합' : '판독불가', tone: 'risk', reason: r.site.detail };
  if (r.terrain?.unsuitable || r.permit.deductions.some(d => d.label === '조례상 입지 불가')) return { label: '부적합', tone: 'risk', reason: '중대한 입지 제약이 확인되었습니다. 상세 근거를 확인하세요.' };
  if (incomplete || r.emdUncertain) return { label: '조건부 검토', tone: 'caution', reason: '미확인 자료가 있어 추가 확인 후 판단이 필요합니다.' };
  if (['A', 'B'].includes(r.composite.grade) && r.project.requirementsMet) return { label: '검토적합', tone: 'good', reason: '현재 규모의 권장조건을 충족합니다. 상세 실사를 진행하세요.' };
  if (['D', 'E'].includes(r.composite.grade)) return { label: '부적합', tone: 'risk', reason: '현재 가정에서 적합성이 낮습니다. 주요 감점 요인을 확인하세요.' };
  return { label: '조건부 검토', tone: 'caution', reason: '전력과 인허가 조건을 추가 검토하세요.' };
}
