import { serviceCoordinate } from '../lib/lookupContract';
import { useMemo } from 'react';
import type { RestrictionLookup } from '../types';
import { fetchRestrictions, peekRestrictions, restrictionCacheKey } from '../lib/restrictions';
import { useOnlineLookup } from './useOnlineLookup';
export type RestrictionStatus = ReturnType<typeof useRestrictions>;
export function useRestrictions(site: { lat: number; lng: number } | null, bufferM: number, selectionRevision = 0) {
  const lat = site?.lat, lng = site?.lng;
  const request = useMemo(() => lat === undefined || lng === undefined || !serviceCoordinate(lat, lng) ? null : ({
    queryKey: restrictionCacheKey(lat, lng, bufferM), selectionRevision,
    peek: () => peekRestrictions(lat, lng, bufferM),
    fetch: (signal: AbortSignal, force: boolean) => fetchRestrictions(lat, lng, bufferM, signal, force),
    hasObservations: (v: RestrictionLookup) => v.hits.length > 0,
  }), [lat, lng, bufferM, selectionRevision]);
  return useOnlineLookup(request);
}
