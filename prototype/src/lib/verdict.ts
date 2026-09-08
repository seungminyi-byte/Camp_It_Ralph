import type { ScoreResult, ReviewIssue } from '../types';
export function hasUnconfirmedEvidence(r: ScoreResult): boolean {
  return r.evidence.some((e) => e.status !== 'available');
}
/** The engine owns every review judgment. */
export function siteVerdict(r: ScoreResult, _incomplete = false) {
  return r.review;
}
export type VerdictReason = ReviewIssue;
export function verdictReasons(
  r: ScoreResult,
  _missingEvidence: string[] = [],
): VerdictReason[] {
  return r.review.issues;
}
