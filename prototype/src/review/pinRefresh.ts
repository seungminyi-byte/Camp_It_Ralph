import type { PinnedSite } from '../compare/pins';
import { serviceCoordinate } from '../lib/lookupContract';
import { matchingSeed } from '../lib/evidenceSeed';
import { lookupZoning, zoningCacheKey, seedZoning } from '../lib/zoning';
import { fetchRestrictions, restrictionCacheKey, seedRestrictions } from '../lib/restrictions';
import { fetchDisaster, disasterCacheKey, seedDisaster } from '../lib/disaster';
import { LookupController, type LookupState, type LookupRequest } from '../lib/lookupController';
import type { OnlineEvidence } from '../types';
async function settle<T extends OnlineEvidence>(request: LookupRequest<T>, signal: AbortSignal): Promise<LookupState<T>> {
  if (signal.aborted) throw signal.reason;
  const controller = new LookupController<T>();
  return new Promise((resolve, reject) => {
    const stop = () => { unsubscribe(); signal.removeEventListener('abort', abort); controller.cancel(); };
    const abort = () => { stop(); reject(signal.reason); };
    const unsubscribe = controller.subscribe(() => {
      const state = controller.snapshot();
      if (state.status !== 'loading' && state.status !== 'idle') { stop(); resolve(state); }
    });
    signal.addEventListener('abort', abort, { once: true });
    controller.start(request);
  });
}
export async function refreshPin(pin: PinnedSite, buffer: number, revision: number, signal: AbortSignal): Promise<PinnedSite> {
  const { lat, lng } = pin.selection;
  if (!serviceCoordinate(lat, lng)) return pin;
  const zKey = zoningCacheKey(lat, lng), rKey = restrictionCacheKey(lat, lng, buffer), dKey = disasterCacheKey(lat, lng);
  const z = matchingSeed(pin.evidence?.zoning, zKey), r = matchingSeed(pin.evidence?.restrictions, rKey), d = matchingSeed(pin.evidence?.disaster, dKey);
  if (z) seedZoning(zKey, z); if (r) seedRestrictions(rKey, r); if (d) seedDisaster(dKey, d);
  // Each worker has one transport at a time; two workers bound other-candidate requests to two.
  const zoningState = await settle({ queryKey: zKey, selectionRevision: revision, peek: () => z, fetch: (s, f) => lookupZoning(lat, lng, s, f), hasObservations: v => v.found }, signal);
  const restrictionsState = await settle({ queryKey: rKey, selectionRevision: revision, peek: () => r, fetch: (s, f) => fetchRestrictions(lat, lng, buffer, s, f), hasObservations: v => v.hits.length > 0 }, signal);
  const disasterState = await settle({ queryKey: dKey, selectionRevision: revision, peek: () => d, fetch: (s, f) => fetchDisaster(lat, lng, s, f), hasObservations: v => v.found }, signal);
  const zoning = zoningState.lookup, restrictions = restrictionsState.lookup, disaster = disasterState.lookup;
  return { ...pin, landUse: pin.manualLandUse ?? (zoning?.found ? zoning.landUse : 'unknown'), zoning, restrictions, disaster, evidence: { zoning: zoningState, restrictions: restrictionsState, disaster: disasterState } };
}
export async function refreshPinQueue(pins: PinnedSite[], signal: AbortSignal, refresh: (pin: PinnedSite) => Promise<PinnedSite>, publish: (pin: PinnedSite) => void) {
  let index = 0;
  const worker = async () => {
    while (!signal.aborted && index < pins.length) {
      const pin = pins[index++];
      try { const result = await refresh(pin); if (!signal.aborted) publish(result); }
      catch { if (signal.aborted) return; }
    }
  };
  await Promise.all([worker(), worker()]);
}
