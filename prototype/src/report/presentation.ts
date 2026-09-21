import type { ReviewIssue, ScoreResult, SiteSelection } from '../types';
import type { CompareEntry } from '../compare/pins';

export const SELECTION_LABELS: Record<SiteSelection['source'], string> = {
  map: '지도 선택', coords: '좌표 입력', emd: '읍면동 중심점', geocode: '주소 검색',
};

/** Presentation groups preserve the engine order and do not create new judgments. */
export function reviewGroups(result: ScoreResult): { constraints: ReviewIssue[]; unknowns: ReviewIssue[] } {
  const observed = new Set(['법적 입지 제한 구역', '규제구역 검토 필요', '조례상 입지 제한 검토', '급경사 정밀 검토', '재해위험지구 검토 필요']);
  if (result.area.status === 'shortfall') observed.add(result.area.label);
  return {
    constraints: result.review.issues.filter(issue => issue.tone === 'risk' || observed.has(issue.title)),
    unknowns: result.review.issues.filter(issue => issue.tone !== 'risk' && !observed.has(issue.title)),
  };
}

export function currentComparisonMessage(entries: CompareEntry[], currentPinId: string | null): string {
  if (!entries.length) return '현재 후보 1곳 검토 · 담은 비교 후보 없음';
  return entries.some(entry => entry.pin.id === currentPinId)
    ? '현재 후보가 아래 비교에 포함되어 있습니다.'
    : '아래 비교에 현재 후보는 포함되지 않음';
}

/** First-page excerpts always point to the unabridged detail sections. */
export function excerpt(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) + '… (전문은 상세)' : value;
}

export function reportTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '미확인' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) + ' KST';
}
