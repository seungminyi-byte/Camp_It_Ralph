import { useEffect, useState } from 'react';
import type { RestrictionLookup } from '../types';
import { fetchRestrictions, peekRestrictions, restrictionCacheKey } from '../lib/restrictions';

export type RestrictionStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; lookup: RestrictionLookup }
  | { status: 'error'; message: string };

/**
 * VWorld 규제구역 lookup for the selected point — the same shape as useZoning, and deliberately a separate
 * request so a failure here never takes the 용도지역 answer down with it. `bufferM` comes from
 * constants.scoring.restriction.heritageBufferM (the API cannot read constants.json).
 */
export function useRestrictions(
  site: { lat: number; lng: number } | null,
  bufferM: number,
): RestrictionStatus {
  const lat = site?.lat;
  const lng = site?.lng;
  const [settled, setSettled] = useState<{ key: string; state: RestrictionStatus } | null>(null);

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    if (peekRestrictions(lat, lng, bufferM)) return; // already answered; resolved during render
    const key = restrictionCacheKey(lat, lng, bufferM);
    const ctrl = new AbortController();
    fetchRestrictions(lat, lng, bufferM, ctrl.signal).then(
      (lookup) => {
        if (!ctrl.signal.aborted) setSettled({ key, state: { status: 'done', lookup } });
      },
      (e: unknown) => {
        // StrictMode runs effects twice in dev; the aborted first pass must not paint an error.
        if (ctrl.signal.aborted) return;
        setSettled({
          key,
          state: { status: 'error', message: e instanceof Error ? e.message : String(e) },
        });
      },
    );
    return () => ctrl.abort();
  }, [lat, lng, bufferM]);

  if (lat === undefined || lng === undefined) return { status: 'idle' };
  const cached = peekRestrictions(lat, lng, bufferM);
  if (cached) return { status: 'done', lookup: cached };
  const key = restrictionCacheKey(lat, lng, bufferM);
  return settled?.key === key ? settled.state : { status: 'loading' };
}
