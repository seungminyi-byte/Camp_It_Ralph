import { matchingSeed, type EvidenceSeed } from '../lib/evidenceSeed';
import { serviceCoordinate } from '../lib/lookupContract';
import { useMemo } from 'react';
import { lookupZoning, peekZoning, zoningCacheKey } from '../lib/zoning';
import { seedZoning } from '../lib/zoning';
import { useOnlineLookup } from './useOnlineLookup';
import type { ZoningLookup } from '../types';
export type ZoningStatus = ReturnType<typeof useZoning>;
export function useZoning(site: { lat: number; lng: number } | null, selectionRevision = 0, seed?: EvidenceSeed<ZoningLookup>) {
  const lat = site?.lat, lng = site?.lng;
  const request = useMemo(() => lat === undefined || lng === undefined || !serviceCoordinate(lat, lng) ? null : ({
    queryKey: zoningCacheKey(lat, lng), selectionRevision,
    peek: () => {
      const key = zoningCacheKey(lat, lng);
      const value = matchingSeed(seed, key);
      if (value) seedZoning(key, value);
      return peekZoning(lat, lng);
    },
    fetch: (signal: AbortSignal, force: boolean) => lookupZoning(lat, lng, signal, force),
    hasObservations: (v: ZoningLookup) => v.found,
  }), [lat, lng, selectionRevision, seed]);
  return useOnlineLookup(request);
}
