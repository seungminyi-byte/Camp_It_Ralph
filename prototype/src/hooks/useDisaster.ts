import { matchingSeed, type EvidenceSeed } from '../lib/evidenceSeed';
import { serviceCoordinate } from '../lib/lookupContract';
import { useMemo } from 'react';
import type { DisasterLookup } from '../types';
import { disasterCacheKey, fetchDisaster, peekDisaster } from '../lib/disaster';
import { seedDisaster } from '../lib/disaster';
import { useOnlineLookup } from './useOnlineLookup';
export type DisasterStatus = ReturnType<typeof useDisaster>;
export function useDisaster(site: { lat: number; lng: number } | null, selectionRevision = 0, seed?: EvidenceSeed<DisasterLookup>) {
  const lat = site?.lat, lng = site?.lng;
  const request = useMemo(() => lat === undefined || lng === undefined || !serviceCoordinate(lat, lng) ? null : ({
    queryKey: disasterCacheKey(lat, lng), selectionRevision,
    peek: () => {
      const key = disasterCacheKey(lat, lng);
      const value = matchingSeed(seed, key);
      if (value) seedDisaster(key, value);
      return peekDisaster(lat, lng);
    },
    fetch: (signal: AbortSignal, force: boolean) => fetchDisaster(lat, lng, signal, force),
    hasObservations: (v: DisasterLookup) => v.found,
  }), [lat, lng, selectionRevision, seed]);
  return useOnlineLookup(request);
}
