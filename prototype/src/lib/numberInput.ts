/**
 * Parse a user-typed amount: thousands separators, stray units (원, %) and, when allowed, a 조/억
 * suffix with the result expressed in 억. Returns null for anything that is not a number.
 */
export function parseAmount(text: string, opts: { koreanUnits?: boolean } = {}): number | null {
  const t = text.replace(/[,\s원%]/g, '');
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)(조|억)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] && !opts.koreanUnits) return null;
  return m[2] === '조' ? n * 10_000 : n;
}

/** Clamp to [min, max], then round to `decimals` places. */
export function clampRound(v: number, min: number, max: number, decimals: number): number {
  const c = Math.min(max, Math.max(min, v));
  const f = 10 ** decimals;
  return Math.round(c * f) / f;
}

export function formatNumber(v: number, decimals: number): string {
  return v.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
