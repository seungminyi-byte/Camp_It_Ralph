import type { Constants, ScoreResult } from '../types';

export const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-600',
  B: 'bg-green-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  E: 'bg-red-600',
};

export function fmtKrw(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '계산 보류';
  if (n === 0) return '0원';
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조원`;
  if (n >= 1e8)
    return `${(n / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}억원`;
  return `${Math.round(n / 1e4).toLocaleString()}만원`;
}

/** "고양시일산서구 덕이동" — 세종 rows repeat the 시도 as 시군구, so show it once. */
export function areaLabel(
  result: ScoreResult,
  fallback = '행정구역 미확인',
): string {
  const e = result.emd;
  if (!e) return fallback;
  return e.sigungu === e.sido ? `${e.sido} ${e.emd}` : `${e.sigungu} ${e.emd}`;
}

/** The restriction cap has identical wording on every surface. */
export function gradeCapNote(
  result: ScoreResult,
  composite: Constants['scoring']['composite'],
): string | null {
  if (result.composite.capReason === 'restriction') {
    return `법정 보호·규제구역 해당으로 ${composite.restrictionGradeCap}등급으로 제한`;
  }
  return null;
}

export function fmtArea(n: number | null): string {
  return n === null || !Number.isFinite(n)
    ? '미산정'
    : `${n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}㎡`;
}
export function fmtCount(n: number | null, unit: string): string {
  return n === null ? '미확인' : `${n.toLocaleString('ko-KR')} ${unit}`;
}
