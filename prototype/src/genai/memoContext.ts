import type { ScoreInput, ScoreResult } from '../types';
import type { ChecklistRow } from '../report/checklist';
/** Stable serialization includes input notes and evidence and normalizes absent lookups. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
function normalizedInput(input: ScoreInput) {
  return {
    ...input,
    zoning: input.zoning ?? null,
    restrictions: input.restrictions ?? null,
    disaster: input.disaster ?? null,
  };
}
export function sameMemoInput(a: ScoreInput, b: ScoreInput): boolean {
  return (
    JSON.stringify(stable(normalizedInput(a))) ===
    JSON.stringify(stable(normalizedInput(b)))
  );
}
export function memoContextSnapshot(
  input: ScoreInput,
  result: ScoreResult,
  rows: ChecklistRow[],
): string {
  return JSON.stringify(
    stable({ version: 4, input: normalizedInput(input), result, rows }),
  );
}
export async function memoContextKey(
  input: ScoreInput,
  result: ScoreResult,
  rows: ChecklistRow[],
): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(memoContextSnapshot(input, result, rows)),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
