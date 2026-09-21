import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { OnlineEvidence } from '../types';
import { idleLookup, LookupController, type LookupRequest } from '../lib/lookupController';
export function useOnlineLookup<T extends OnlineEvidence>(request: LookupRequest<T> | null) {
  const [controller] = useState(() => new LookupController<T>());
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  useEffect(() => {
    if (request) controller.start(request);
    return controller.cancel;
  }, [controller, request]);
  const fallback = useMemo(() => {
    if (!request) return idleLookup<T>();
    const previous = state.queryKey === request.queryKey ? state.lookup : request.peek();
    return { ...idleLookup<T>(), status: 'loading' as const,
      queryKey: request.queryKey, selectionRevision: request.selectionRevision,
      lookup: previous && request.hasObservations(previous) ? { ...previous, complete: false, stale: true } : null };
  }, [request, state]);
  const current = request && state.queryKey === request.queryKey && state.selectionRevision === request.selectionRevision ? state : fallback;
  return { ...current, retry: controller.retry };
}
