import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { AppData } from '../types';
import type { ReviewSessionStore } from './session';
import { refreshPin, refreshPinQueue } from './pinRefresh';
export function usePinRefresh(store: ReviewSessionStore, data: AppData | null, currentSettled: boolean) {
  const { inputs } = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const revision = inputs.selectionRevision;
  const refreshed = useRef(new Set<string>());
  const identity = JSON.stringify(inputs.pins.map(p => p.id));
  useEffect(() => {
    if (!data || !currentSettled) return;
    const controller = new AbortController();
    const current = store.snapshot().inputs;
    const jobs = current.pins.filter(p => p.id !== current.openedPinId && !refreshed.current.has(`${revision}|${p.id}`));
    void refreshPinQueue(jobs, controller.signal, p => refreshPin(p, data.constants.scoring.restriction.heritageBufferM, revision, controller.signal), result => {
      if (store.snapshot().inputs.selectionRevision !== revision) return;
      refreshed.current.add(`${revision}|${result.id}`);
      store.update(s => ({ ...s, pins: s.pins.map(p => p.id === result.id && p.selection === result.selection && p.manualLandUse === result.manualLandUse ? { ...p, landUse: result.landUse, zoning: result.zoning, restrictions: result.restrictions, disaster: result.disaster, evidence: result.evidence } : p) }));
    });
    return () => controller.abort();
  }, [store, data, currentSettled, revision, identity]);
}
