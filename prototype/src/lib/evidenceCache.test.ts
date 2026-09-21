import { describe, expect, it } from 'vitest';
import { EvidenceCache } from './evidenceCache';
import type { RestrictionLookup } from '../types';
import { restrictionFixture, prohibitedHit } from '../test/onlineFixtures';
const deferred = () => { let resolve!: (value: RestrictionLookup) => void; const promise = new Promise<RestrictionLookup>((r) => { resolve = r; }); return { promise, resolve }; };
const create = () => new EvidenceCache<RestrictionLookup>((value) => value.hits.length > 0, (previous, next) => ({ ...next, hits: [...previous.hits, ...next.hits] }));
describe('independent consumers and cache publication', () => {
  it('returns both same-key consumer results but publishes only the newest started result', async () => {
    const cache = create(), old = deferred(), latest = deferred();
    const a = cache.load('same', () => old.promise), b = cache.load('same', () => latest.promise);
    latest.resolve({ ...restrictionFixture(), hits: [prohibitedHit] }); await b;
    old.resolve(restrictionFixture()); await expect(a).resolves.toMatchObject({ hits: [] });
    expect(cache.peek('same')?.hits).toEqual([prohibitedHit]);
  });
  it('one aborted consumer cannot cancel or reject another same-key consumer', async () => {
    const cache = create(), one = deferred(), two = deferred(), abort = new AbortController();
    const a = cache.load('same', () => one.promise, abort.signal), b = cache.load('same', () => two.promise);
    abort.abort(); one.resolve(restrictionFixture()); await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    two.resolve(restrictionFixture()); await expect(b).resolves.toMatchObject({ complete: true });
  });
  it('a consumer retry updates cache while the other original consumer remains valid', async () => {
    const cache = create(), old = deferred(), peer = deferred(), retry = deferred();
    const a = cache.load('same', () => old.promise), b = cache.load('same', () => peer.promise), c = cache.load('same', () => retry.promise, undefined, true);
    retry.resolve({ ...restrictionFixture(), hits: [prohibitedHit] }); await c;
    old.resolve(restrictionFixture()); peer.resolve(restrictionFixture()); await Promise.all([a, b]);
    expect(cache.peek('same')?.hits).toEqual([prohibitedHit]);
  });
  it('distinguishes a new partial observation from preserved previous observations', async () => {
    const cache = create();
    const partial = await cache.load('same', async () => ({ ...restrictionFixture(), hits: [prohibitedHit], complete: false, failed: ['LT_C_UQ162'] }));
    expect(partial.stale).not.toBe(true); expect(partial.complete).toBe(false);
    const merged = await cache.load('same', async () => ({ ...restrictionFixture(), complete: false, failed: ['LT_C_UD801'] }), undefined, true);
    expect(merged.stale).toBe(true); expect(merged.previousFetchedAt).toBe(partial.fetchedAt); expect(merged.hits).toContainEqual(prohibitedHit);
  });
});
