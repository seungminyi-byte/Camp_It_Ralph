import { useEffect, useState } from 'react';
import type { DisasterLookup } from '../types';
import { disasterCacheKey, fetchDisaster, peekDisaster } from '../lib/disaster';

export type DisasterStatus =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'done'; lookup: DisasterLookup };

export function useDisaster(site: { lat: number; lng: number } | null): DisasterStatus {
  const lat = site?.lat;
  const lng = site?.lng;
  const [settled, setSettled] = useState<{ key: string; state: DisasterStatus } | null>(null);
  useEffect(() => {
    if (lat === undefined || lng === undefined || peekDisaster(lat, lng)) return;
    const key = disasterCacheKey(lat, lng);
    const ctrl = new AbortController();
    fetchDisaster(lat, lng, ctrl.signal).then(
      (lookup) => { if (!ctrl.signal.aborted) setSettled({ key, state: { status: 'done', lookup } }); },
      () => { if (!ctrl.signal.aborted) setSettled({ key, state: { status: 'error' } }); },
    );
    return () => ctrl.abort();
  }, [lat, lng]);
  if (lat === undefined || lng === undefined) return { status: 'idle' };
  const cached = peekDisaster(lat, lng);
  if (cached) return { status: 'done', lookup: cached };
  return settled?.key === disasterCacheKey(lat, lng) ? settled.state : { status: 'loading' };
}
