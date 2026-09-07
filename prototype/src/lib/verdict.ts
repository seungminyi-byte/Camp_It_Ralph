import type { ScoreResult } from '../types';
import { summarizeRestriction } from '../scoring/restriction';

/** All summary surfaces use the same evidence completeness rule. */
export function hasUnconfirmedEvidence(r: ScoreResult): boolean {
  return r.disaster.status === 'unknown' || !r.restriction.checked.bundled || r.restriction.checked.vworld !== 'ok';
}

/** UI interpretation of existing grades; not an official permitting decision. */
export function siteVerdict(r: ScoreResult, incomplete = false) {
  if (!r.site.eligible) return { label: r.site.status === 'sea' ? '부적합' : '판독불가', tone: 'risk', reason: r.site.detail };
  if (r.terrain?.unsuitable || r.permit.deductions.some(d => d.label === '조례상 입지 불가')) return { label: '부적합', tone: 'risk', reason: '중대한 입지 제약이 확인되었습니다. 상세 근거를 확인하세요.' };
  // Missing auxiliary data may prevent a positive verdict, but it must never soften a D/E result.
  if (['D', 'E'].includes(r.composite.grade)) return { label: '부적합', tone: 'risk', reason: '현재 가정에서 적합성이 낮습니다. 주요 감점 요인을 확인하세요.' };
  if (incomplete || r.emdUncertain || hasUnconfirmedEvidence(r)) return { label: '조건부 검토', tone: 'caution', reason: '미확인 자료가 있어 추가 확인 후 판단이 필요합니다.' };
  if (['A', 'B'].includes(r.composite.grade) && r.project.requirementsMet) return { label: '검토적합', tone: 'good', reason: '현재 규모의 권장조건을 충족합니다. 상세 실사를 진행하세요.' };
  return { label: '조건부 검토', tone: 'caution', reason: '전력과 인허가 조건을 추가 검토하세요.' };
}

export interface VerdictReason {
  title: string;
  detail: string;
  tone: 'risk' | 'caution';
}

/** Short, decision-oriented explanations for the overview accordion. */
export function verdictReasons(r: ScoreResult, missingEvidence: string[] = []): VerdictReason[] {
  const reasons: VerdictReason[] = [];
  const zoningMissing = missingEvidence.some((item) => item.includes('용도지역'));
  const add = (title: string, detail: string, tone: VerdictReason['tone']) => {
    if (!reasons.some((item) => item.title === title)) reasons.push({ title, detail, tone });
  };

  if (!r.site.eligible) {
    add(r.site.status === 'outside' ? '판독 불가 — 자료 범위 밖' : r.site.label, r.site.detail, 'risk');
    return reasons;
  }
  if (r.terrain?.unsuitable) add('급경사 부지', `${r.terrain.band} 구간으로 사면 안정성과 조성 가능성 확인이 필요합니다.`, 'risk');
  if (r.restriction.level === 'prohibited' || r.restriction.level === 'conditional') {
    add(r.restriction.level === 'prohibited' ? '법적 입지 제한 구역' : '규제구역 검토 필요', summarizeRestriction(r.restriction), r.restriction.level === 'prohibited' ? 'risk' : 'caution');
  }
  if (r.disaster.status === 'hit') add('재해위험지구 해당', '위험 유형과 관할기관의 행위 제한·정비계획 확인이 필요합니다.', 'risk');

  if (!r.project.substationRequirementMet) {
    add(
      '규모 대비 변전소 부족',
      `${r.project.profile.targetMw}MW급은 공급가능 변전소 ${r.project.profile.minSubstations}곳 이상을 권장하지만 현재 ${r.gate.substationCount}곳입니다.`,
      r.gate.substationCount === 0 ? 'risk' : 'caution',
    );
  }
  if (!r.project.distanceRequirementMet) {
    add(
      '변전소 거리 조건 미달',
      `권장 거리는 ${r.project.profile.maxSubstationKm}km 이내이며 현재 ${r.power.nearestSubstation ? `${r.power.nearestSubstation.distanceKm.toFixed(1)}km` : '확인 가능한 변전소가 없습니다'}.`,
      'caution',
    );
  }

  [...r.permit.deductions]
    .sort((a, b) => b.points - a.points)
    .filter((deduction) => !(zoningMissing && deduction.label.startsWith('용도지역:')))
    .slice(0, 2)
    .forEach((deduction) => add(deduction.label, `${deduction.evidence} · 인허가 ${deduction.points}점 감점`, deduction.points >= 15 ? 'risk' : 'caution'));

  if (zoningMissing) {
    add('용도지역 확인 필요', '국토교통부 공간정보 API 조회가 완료되면 용도지역과 관련 감점을 자동으로 갱신합니다.', 'caution');
  }
  const otherMissing = missingEvidence.filter((item) => !item.includes('용도지역'));
  if (otherMissing.length) {
    add('추가 자료 확인 필요', `${otherMissing.join(' · ')} 후 판단을 갱신해야 합니다.`, 'caution');
  }
  if (!reasons.length && ['C', 'D', 'E'].includes(r.composite.grade)) {
    add('종합 점수 기준 미충족', `전력 ${r.power.score}점, 인허가 ${r.permit.score}점으로 종합 ${r.composite.score}점입니다.`, r.composite.grade === 'C' ? 'caution' : 'risk');
  }

  return reasons.slice(0, 4);
}
