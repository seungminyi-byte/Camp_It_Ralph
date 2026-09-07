import type { ScoreInput, ScoreResult } from '../types';
import type { ChecklistRow } from '../report/checklist';

export function sameMemoInput(a: ScoreInput, b: ScoreInput): boolean {
  return a.lat === b.lat && a.lng === b.lng && a.landUse === b.landUse &&
    a.projectType === b.projectType && a.capexKrw === b.capexKrw && a.annualRate === b.annualRate &&
    (a.zoning ?? null) === (b.zoning ?? null) &&
    (a.restrictions ?? null) === (b.restrictions ?? null) &&
    (a.disaster ?? null) === (b.disaster ?? null);
}

/** A nearby point alone cannot validate an opinion's assumptions or evidence. */
export async function memoContextKey(input: ScoreInput, result: ScoreResult, rows: ChecklistRow[]): Promise<string> {
  const context = JSON.stringify({
    lat: input.lat, lng: input.lng, landUse: input.landUse, projectType: input.projectType,
    capexKrw: input.capexKrw, annualRate: input.annualRate,
    zoning: input.zoning ?? null, restrictions: input.restrictions ?? null, disaster: input.disaster ?? null,
    result, rows,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(context));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
