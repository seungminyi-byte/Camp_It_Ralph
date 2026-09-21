import type { ScoreResult } from '../types';

export function summarizeDisaster(disaster: ScoreResult['disaster']): string {
  if (disaster.status === 'unknown') return '미확인 — 재해위험지구 조회 전 또는 조회 실패';
  if (disaster.status === 'none') return '조회한 지정구역에 해당 없음 — 재해 안전을 보장하지 않음';
  return `${[...new Set(disaster.hits.map((h) => h.name ?? '재해위험지구'))].join(' · ')} — 관할기관 검토 필요${disaster.complete === false ? ' · 일부 조회 미완료 또는 이전 관찰 · 재확인 필요' : ''}`;
}
