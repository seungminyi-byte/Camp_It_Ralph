import { useEffect, useState } from 'react';
import type { ZoningLookup } from '../types';
import { lookupZoning, peekZoning, zoningCacheKey } from '../lib/zoning';

export type ZoningStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; lookup: ZoningLookup }
  | { status: 'error'; message: string };

/**
 * VWorld 용도지역 for the selected point. Deps are the raw numbers, not the site object, so a
 * re-render of the parent does not refire the request. Cached and in-flight states are derived
 * during render; the effect only reports the async result.
 */
export function useZoning(site: { lat: number; lng: number } | null): ZoningStatus {
  const lat = site?.lat;
  const lng = site?.lng;
  const [settled, setSettled] = useState<{ key: string; state: ZoningStatus } | null>(null);

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    if (peekZoning(lat, lng)) return; // already answered; resolved during render
    const key = zoningCacheKey(lat, lng);
    const ctrl = new AbortController();
    const lookupWithRetry = async () => {
      try {
        return await lookupZoning(lat, lng, ctrl.signal);
      } catch (firstError) {
        if (ctrl.signal.aborted) throw firstError;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
        if (ctrl.signal.aborted) throw firstError;
        return lookupZoning(lat, lng, ctrl.signal);
      }
    };
    lookupWithRetry().then(
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
  }, [lat, lng]);

  if (lat === undefined || lng === undefined) return { status: 'idle' };
  const cached = peekZoning(lat, lng);
  if (cached) return { status: 'done', lookup: cached };
  const key = zoningCacheKey(lat, lng);
  return settled?.key === key ? settled.state : { status: 'loading' };
}
