import type { ScoreResult } from '../types';

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
export function areaLabel(result: ScoreResult, fallback = '행정구역 미매칭'): string {
  const e = result.emd;
  if (!e) return fallback;
  return e.sigungu === e.sido ? `${e.sido} ${e.emd}` : `${e.sigungu} ${e.emd}`;
}
