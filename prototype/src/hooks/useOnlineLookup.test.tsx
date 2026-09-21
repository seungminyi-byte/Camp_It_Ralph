// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useOnlineLookup } from './useOnlineLookup';
import type { LookupRequest } from '../lib/lookupController';
import type { RestrictionLookup } from '../types';
import { prohibitedHit, restrictionFixture } from '../test/onlineFixtures';
let container: HTMLDivElement, root: Root;
function View({ request }: { request: LookupRequest<RestrictionLookup> | null }) {
  const state = useOnlineLookup(request);
  return <><output>{state.queryKey}|{state.selectionRevision}|{state.status}|{state.lookup?.hits.length ?? '-'}</output><button onClick={state.retry}>retry</button></>;
}
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe('mounted online lookup ownership', () => {
  it('keeps only current key/revision through A → B → same-key retry and unmount', async () => {
    let resolveA!: (v: RestrictionLookup) => void;
    const a = new Promise<RestrictionLookup>((resolve) => { resolveA = resolve; });
    const request = (key: string, revision: number, fetch: LookupRequest<RestrictionLookup>['fetch']): LookupRequest<RestrictionLookup> => ({ queryKey: key, selectionRevision: revision, peek: () => undefined, fetch, hasObservations: (v) => !!v.hits.length });
    await act(async () => root.render(<View request={request('A', 1, () => a)} />));
    const b = request('B', 2, vi.fn().mockResolvedValueOnce({ ...restrictionFixture(), hits: [prohibitedHit] }).mockRejectedValueOnce(new Error('offline')));
    await act(async () => root.render(<View request={b} />));
    await act(async () => resolveA(restrictionFixture()));
    expect(container.textContent).toContain('B|2|done|1');
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('B|2|error|1');
    await act(async () => root.render(<View request={null} />));
    expect(container.textContent).toContain('|-1|idle|-');
  });
});

import { useZoning } from './useZoning';
import { useDisaster } from './useDisaster';
import { useRestrictions } from './useRestrictions';
import { useNearbySites } from './useNearbySites';
function Outside() {
  const site = { lat: 40, lng: 127 };
  const zoning = useZoning(site), restrictions = useRestrictions(site, 500), disaster = useDisaster(site), nearby = useNearbySites(site);
  return <output>{[zoning, restrictions, disaster, nearby].map((state) => state.status).join(',')}</output>;
}
it('does not request or crash for a map selection outside the service coordinate envelope', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await act(async () => root.render(<Outside />));
  expect(container.textContent).toBe('idle,idle,idle,idle'); expect(fetch).not.toHaveBeenCalled();
});

it('same-coordinate nearby reselection invalidates the prior request through an explicit revision', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_url, options) => { signals.push(options.signal); return new Promise(() => {}); }));
  function NearbyRevision({ revision }: { revision: number }) {
    const state = useNearbySites({ lat: 37.5123, lng: 127.1234 }, revision);
    return <output>{state.selectionRevision}|{state.requestRevision}|{state.status}</output>;
  }
  await act(async () => root.render(<NearbyRevision revision={1} />));
  const previous = container.textContent;
  await act(async () => root.render(<NearbyRevision revision={2} />));
  expect(signals).toHaveLength(2); expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
  expect(container.textContent).toMatch(/^2\|\d+\|loading$/); expect(container.textContent).not.toBe(previous);
});
