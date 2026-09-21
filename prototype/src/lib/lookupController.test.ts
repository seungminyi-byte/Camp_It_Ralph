import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookupController, type LookupRequest } from './lookupController';
import type { RestrictionLookup } from '../types';
import { restrictionFixture, prohibitedHit } from '../test/onlineFixtures';
const defer = <T>() => { let resolve!: (v: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const controllers: LookupController<RestrictionLookup>[] = [];
afterEach(() => { controllers.forEach((c) => c.cancel()); controllers.length = 0; vi.useRealTimers(); });
const controller = () => { const c = new LookupController<RestrictionLookup>(); controllers.push(c); return c; };
const request = (key: string, revision: number, fetch: LookupRequest<RestrictionLookup>['fetch']): LookupRequest<RestrictionLookup> => ({ queryKey: key, selectionRevision: revision, fetch, peek: () => undefined, hasObservations: (v) => v.hits.length > 0 });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('lookup request identity', () => {
  it.each(['partial', 'expired', 'error'])('recovers an initial %s response with exactly one forced fetch', async (mode) => {
    vi.useFakeTimers();
    const c = controller();
    const fetch = vi.fn();
    if (mode === 'error') fetch.mockRejectedValueOnce(new Error('temporary'));
    else fetch.mockResolvedValueOnce({ ...restrictionFixture(), ...(mode === 'partial' ? { complete: false } : { fetchedAt: new Date(Date.now() - 600_001).toISOString() }) });
    fetch.mockResolvedValueOnce(restrictionFixture());
    c.start(request('A', 1, fetch)); await flush();
    expect(c.snapshot().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.snapshot().status).toBe('done');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(call => call[1])).toEqual([false, true]);
  });
  it('stops after one recovery failure while keeping a confirmed restriction', async () => {
    vi.useFakeTimers();
    const c = controller();
    const fetch = vi.fn().mockResolvedValueOnce({ ...restrictionFixture(), complete: false, hits: [prohibitedHit] }).mockRejectedValue(new Error('offline'));
    c.start(request('A', 1, fetch)); await flush();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(c.snapshot()).toMatchObject({ status: 'error', lookup: { hits: [prohibitedHit], complete: false, stale: true } });
  });
  it('cancels a scheduled recovery when selecting a different candidate or unmounting', async () => {
    vi.useFakeTimers();
    const c = controller(), fetch = vi.fn().mockRejectedValue(new Error('offline'));
    c.start(request('A', 1, fetch)); await flush();
    c.start(request('B', 2, async () => restrictionFixture())); await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    c.start(request('A', 3, fetch)); await flush(); c.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('ignores late A after immediate B even when transport ignores abort', async () => {
    const c = controller(), a = defer<RestrictionLookup>();
    c.start(request('A', 1, () => a.promise));
    c.start(request('B', 2, async () => ({ ...restrictionFixture(), hits: [prohibitedHit] })));
    await flush();
    a.resolve(restrictionFixture()); await flush();
    expect(c.snapshot()).toMatchObject({ queryKey: 'B', selectionRevision: 2, status: 'done', lookup: { hits: [prohibitedHit] } });
  });
  it('same-key retry owns a new revision and old rejection cannot replace it', async () => {
    const c = controller(), old = defer<RestrictionLookup>(), next = defer<RestrictionLookup>();
    const fetch = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    c.start(request('A', 1, fetch)); const revision = c.snapshot().requestRevision;
    c.retry(); expect(c.snapshot().requestRevision).toBeGreaterThan(revision);
    next.resolve(restrictionFixture()); await flush(); old.reject(new Error('late')); await flush();
    expect(c.snapshot().status).toBe('done');
  });
  it('preserves known hits with complete=false while retrying and after failure', async () => {
    const c = controller(), pending = defer<RestrictionLookup>();
    const fetch = vi.fn().mockResolvedValueOnce({ ...restrictionFixture(), hits: [prohibitedHit] }).mockReturnValueOnce(pending.promise);
    c.start(request('A', 1, fetch)); await flush(); c.retry();
    expect(c.snapshot()).toMatchObject({ status: 'loading', lookup: { hits: [prohibitedHit], complete: false, stale: true } });
    pending.reject(new Error('offline')); await flush();
    expect(c.snapshot()).toMatchObject({ status: 'error', lookup: { hits: [prohibitedHit], complete: false, stale: true } });
  });
  it('never preserves old empty as absence during retry failure or mixes another candidate', async () => {
    const c = controller();
    const fetch = vi.fn().mockResolvedValueOnce(restrictionFixture()).mockRejectedValueOnce(new Error('offline'));
    c.start(request('A', 1, fetch)); await flush(); c.retry(); await flush();
    expect(c.snapshot()).toMatchObject({ status: 'error', lookup: null });
    c.start(request('B', 2, async () => ({ ...restrictionFixture(), hits: [prohibitedHit] }))); await flush();
    c.start(request('A', 3, () => new Promise(() => {})));
    expect(c.snapshot().lookup).toBeNull();
  });
  it('unmount cancellation invalidates late success and same-key selection changes', async () => {
    const c = controller(), pending = defer<RestrictionLookup>();
    c.start(request('A', 1, () => pending.promise)); c.cancel(); pending.resolve(restrictionFixture()); await flush();
    expect(c.snapshot().status).toBe('loading');
    const late = defer<RestrictionLookup>();
    c.start(request('A', 2, () => late.promise)); c.start(request('A', 3, async () => restrictionFixture())); await flush();
    late.resolve({ ...restrictionFixture(), hits: [prohibitedHit] }); await flush();
    expect(c.snapshot()).toMatchObject({ selectionRevision: 3, lookup: { hits: [] } });
  });
});
