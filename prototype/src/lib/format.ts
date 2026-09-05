import type { Constants, ScoreResult } from '../types';

export const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-600',
  B: 'bg-green-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  E: 'bg-red-600',
};

export function fmtKrw(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조원`;
  if (n >= 1e8) return `${Math.round(n / 1e8).toLocaleString()}억원`;
  return `${Math.round(n / 1e4).toLocaleString()}만원`;
}

/** "고양시일산서구 덕이동" — 세종 rows repeat the 시도 as 시군구, so show it once. */
export function areaLabel(result: ScoreResult, fallback = '행정구역 미확인'): string {
  const e = result.emd;
  if (!e) return fallback;
  return e.sigungu === e.sido ? `${e.sido} ${e.emd}` : `${e.sigungu} ${e.emd}`;
}

/**
 * One wording source for the grade-cap note on the card, the report and the LLM prompt. The restriction cap is
 * reported whenever it is in force; the substation cap only when it actually lowered the grade (as before).
 */
export function gradeCapNote(
  result: ScoreResult,
  composite: Constants['scoring']['composite'],
): string | null {
  if (result.composite.capReason === 'restriction') {
    return `법정 보호·규제구역 해당으로 ${composite.restrictionGradeCap}등급으로 제한`;
  }
  if (result.composite.gradeCapped) {
    return `공급가능 변전소 미확인으로 ${composite.gateFailGradeCap}등급 이하로 제한`;
  }
  return null;
}
