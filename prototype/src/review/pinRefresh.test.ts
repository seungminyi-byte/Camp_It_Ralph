import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshPinQueue, refreshPin } from './pinRefresh';
import { emptyReview } from './session';
import type { PinnedSite } from '../compare/pins';
import { prohibitedHit, restrictionFixture, zoningFixture, disasterFixture } from '../test/onlineFixtures';
import { fetchRestrictions, peekRestrictions, restrictionCacheKey } from '../lib/restrictions';
import { matchingSeed } from '../lib/evidenceSeed';
const pin = (id: string, lat = 37.5): PinnedSite => ({ id, selection: { lat, lng: 127, source: 'map' }, conditions: emptyReview().conditions, manualLandUse: null, landUse: 'unknown', zoning: null, restrictions: null, disaster: null });
afterEach(() => vi.unstubAllGlobals());
describe('P01 other-candidate queue', () => {
  it('bounds active candidates to 2, continues failures, preserves identity and suppresses late publication', async () => {
    const controller = new AbortController(); const releases: (() => void)[] = []; let active = 0, maximum = 0;
    const published: string[] = []; const jobs = ['a', 'b', 'c', 'd'].map(id => pin(id));
    const task = refreshPinQueue(jobs, controller.signal, async p => { active++; maximum = Math.max(maximum, active); await new Promise<void>(resolve => releases.push(resolve)); active--; if (p.id === 'b') throw Error('offline'); return p; }, p => published.push(p.id));
    expect(active).toBe(2); releases[0](); await Promise.resolve(); await Promise.resolve(); expect(releases).toHaveLength(3);
    releases[1](); await Promise.resolve(); await Promise.resolve(); expect(releases).toHaveLength(4); controller.abort(); releases[2](); releases[3](); await task;
    expect(maximum).toBe(2); expect(published).toEqual(['a']);
  });
  it('outside-coordinate candidates settle without transport and normal results retain independent opaque IDs', async () => {
    const calls: string[] = []; vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
      const url = new URL(raw, 'http://test'); calls.push(url.pathname); const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
      return Response.json(url.pathname.endsWith('zoning') ? zoningFixture(lat, lng) : url.pathname.endsWith('restrictions') ? restrictionFixture(lat, lng) : disasterFixture(lat, lng));
    }));
    await expect(refreshPin(pin('outside', 50), 500, 2, new AbortController().signal)).resolves.toMatchObject({ id: 'outside', zoning: null }); expect(calls).toEqual([]);
    const value = await refreshPin(pin('opaque'), 500, 3, new AbortController().signal);
    expect(calls).toEqual(['/api/zoning', '/api/restrictions', '/api/disaster']); expect(value.id).toBe('opaque'); expect(value.evidence?.zoning).toMatchObject({ selectionRevision: 3, status: 'done' }); expect(value.landUse).toBe('industrial');
  });
});
it('P02 preserves matching validated pin observations after 500-entry eviction and retry failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async (raw: string) => {
    const url = new URL(raw, 'http://test'), lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
    return Response.json({ ...restrictionFixture(lat, lng), hits: [prohibitedHit] });
  }));
  const original = pin('remembered', 34.1); const observed = await fetchRestrictions(34.1, 127, 500); original.restrictions = observed;
  original.evidence = { zoning: { queryKey: null, lookup: null }, restrictions: { queryKey: restrictionCacheKey(34.1, 127, 500), lookup: observed }, disaster: { queryKey: null, lookup: null } };
  for (let i = 0; i < 501; i++) await fetchRestrictions(35 + i / 1000, 127, 500);
  expect(peekRestrictions(34.1, 127, 500)).toBeUndefined(); expect(matchingSeed(original.evidence.restrictions, restrictionCacheKey(34.2, 127, 500))).toBeUndefined();
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const recovered = await refreshPin(original, 500, 8, new AbortController().signal);
  expect(recovered.restrictions).toMatchObject({ hits: [prohibitedHit], complete: false, stale: true }); expect(recovered.evidence?.restrictions).toMatchObject({ queryKey: original.evidence.restrictions.queryKey, selectionRevision: 8, status: 'error' });
});
