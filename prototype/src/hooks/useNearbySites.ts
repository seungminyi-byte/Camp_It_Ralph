import { serviceCoordinate } from '../lib/lookupContract';
import { useMemo } from 'react';
import type { NearbySiteCandidates } from '../types';
import { lookupNearbySites, nearbyCacheKey, peekNearbySites } from '../lib/nearbySites';
import { useOnlineLookup } from './useOnlineLookup';
export type NearbySitesStatus = ReturnType<typeof useNearbySites>;
export function useNearbySites(site: { lat: number; lng: number } | null, selectionRevision = 0) {
  const lat = site?.lat, lng = site?.lng;
  const request = useMemo(() => lat === undefined || lng === undefined || !serviceCoordinate(lat, lng) ? null : ({
    queryKey: nearbyCacheKey(lat, lng), selectionRevision,
    peek: () => peekNearbySites(lat, lng),
    fetch: (signal: AbortSignal, force: boolean) => lookupNearbySites(lat, lng, signal, force),
    hasObservations: (_v: NearbySiteCandidates) => false,
  }), [lat, lng, selectionRevision]);
  const state = useOnlineLookup(request);
  return { ...state, result: state.lookup };
}
