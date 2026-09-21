import { serviceCoordinate } from '../lib/lookupContract';
import { useMemo } from 'react';
import type { DisasterLookup } from '../types';
import { disasterCacheKey, fetchDisaster, peekDisaster } from '../lib/disaster';
import { useOnlineLookup } from './useOnlineLookup';
export type DisasterStatus = ReturnType<typeof useDisaster>;
export function useDisaster(site: { lat: number; lng: number } | null, selectionRevision = 0) {
  const lat = site?.lat, lng = site?.lng;
  const request = useMemo(() => lat === undefined || lng === undefined || !serviceCoordinate(lat, lng) ? null : ({
    queryKey: disasterCacheKey(lat, lng), selectionRevision,
    peek: () => peekDisaster(lat, lng),
    fetch: (signal: AbortSignal, force: boolean) => fetchDisaster(lat, lng, signal, force),
    hasObservations: (v: DisasterLookup) => v.found,
  }), [lat, lng, selectionRevision]);
  return useOnlineLookup(request);
}
