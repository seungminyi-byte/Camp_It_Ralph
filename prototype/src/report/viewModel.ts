import type { ParsedMemo } from '../genai/memoFormat';
import { buildChecklist, type ChecklistRow } from './checklist';
import type { AppData, ScoreInput, ScoreResult, SiteSelection } from '../types';

export interface ReportViewModel {
  data: AppData;
  input: ScoreInput;
  result: ScoreResult;
  rows: ChecklistRow[];
  site: SiteSelection;
  overview: {
    issues: ScoreResult['review']['overview']['issues'];
    actions: string[];
  };
  zoning: ScoreResult['evidence'][number] | null;
  memo: ParsedMemo | null;
  generatedBy: string | null;
  generatedAt: Date | null;
}

export type MemoReportStatus = 'streaming' | 'done' | 'error' | 'stopped' | null;

/** Only a completed memo whose current signature still matches may enter a report. */
export function completedReportMemo(
  memo: ParsedMemo | null,
  status: MemoReportStatus,
  stale: boolean,
): ParsedMemo | null {
  return !stale && status === 'done' && memo?.complete && !memo.error
    ? memo
    : null;
}

/**
 * Reporting only selects already-calculated values. It does not recalculate
 * score, evidence, or AI eligibility, so screen and print share one boundary.
 */
export function buildReportViewModel({
  data,
  input,
  result,
  site,
  rows = buildChecklist(result, data, {
    input,
    landUseSource: input.landUseSource ?? 'unknown',
    zoningName: input.zoning?.found ? input.zoning.name : null,
  }),
  memo = null,
  generatedBy = null,
  generatedAt = null,
}: {
  data: AppData;
  input: ScoreInput;
  result: ScoreResult;
  site: SiteSelection;
  /** The memo signature and every report surface must share this one ordered row array. */
  rows?: ChecklistRow[];
  memo?: ParsedMemo | null;
  generatedBy?: string | null;
  generatedAt?: Date | null;
}): ReportViewModel {
  return {
    data,
    input,
    result,
    rows,
    site,
    overview: {
      issues: result.review.overview.issues.slice(0, 3),
      actions: result.review.overview.actions.slice(0, 3),
    },
    zoning: result.evidence.find((item) => item.key === 'zoning') ?? null,
    memo,
    generatedBy,
    generatedAt,
  };
}
