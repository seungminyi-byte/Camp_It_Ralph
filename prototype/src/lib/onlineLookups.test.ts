import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRestrictions } from './restrictions';
import { lookupZoning } from './zoning';
import { fetchDisaster } from './disaster';
import { geocodeAddress } from './geocode';
import { lookupNearbySites } from './nearbySites';

afterEach(() => vi.unstubAllGlobals());
describe('online response boundary', () => {
  it.each([
    ['restrictions', () => fetchRestrictions(37.5567, 126.9921, 500)],
    ['zoning', () => lookupZoning(37.5568, 126.9922)],
    ['disaster', () => fetchDisaster(37.5569, 126.9923)],
    ['geocode', () => geocodeAddress('서울시청')],
    ['nearby', () => lookupNearbySites(37.557, 126.9924)],
  ])('rejects HTTP 200 {} for %s', async (_name, call) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
    await expect(call()).rejects.toThrow();
  });
});

import { parseRestrictionLookup, peekRestrictions } from './restrictions';
import { parseZoningLookup, peekZoning } from './zoning';
import { parseDisasterLookup } from './disaster';
import { parseNearbySites } from './nearbySites';
import { lat, lng, meta, zoningFixture, restrictionFixture, disasterFixture, prohibitedHit } from '../test/onlineFixtures';
import { boundedJson, ONLINE_DEADLINE_MS } from './boundedJson';
import { LOOKUP_TTL_MS } from './lookupContract';

describe('strict envelope and observations', () => {
  it.each([
    ['wrong version', { version: 'old' }], ['wrong coordinate', { coordinate: { lat: lat + 1, lng } }],
    ['non-normalized coordinate', { coordinate: { lat: lat + 0.000001, lng } }],
    ['missing layers', { queried: [] }], ['duplicate layers', { queried: ['LT_C_UD801', 'LT_C_UD801'] }],
    ['unknown failure', { failed: ['unknown'], complete: false }], ['contradictory complete', { failed: ['LT_C_UD801'], complete: true }],
    ['invalid date', { fetchedAt: 'tomorrow' }], ['impossible date', { fetchedAt: '2026-02-30T09:00:00.000Z' }],
    ['wrong radius', { bufferM: 1000 }], ['bad hit', { hits: [{ ...prohibitedHit, name: 3 }] }],
    ['unknown layer', { hits: [{ ...prohibitedHit, layer: 'unknown' }] }], ['wrong buffered layer', { hits: [{ ...prohibitedHit, buffered: true }] }],
    ['duplicate hit', { hits: [prohibitedHit, prohibitedHit] }],
  ])('rejects %s without silently deleting evidence', (_label, patch) => {
    expect(() => parseRestrictionLookup({ ...restrictionFixture(), ...patch }, lat, lng, 500)).toThrow();
  });
  it('rejects all failed with no observations and preserves all-failed saturated observations', () => {
    const raw = disasterFixture();
    expect(() => parseDisasterLookup({ ...raw, failed: raw.queried, complete: false }, lat, lng)).toThrow();
    expect(parseDisasterLookup({ ...raw, found: true, hits: [{ name: '침수지구', attributes: { uname: '침수지구' } }], failed: raw.queried, complete: false }, lat, lng)).toMatchObject({ complete: false, found: true });
  });
  it('preserves partial zoning hits and rejects forged classification', () => {
    expect(parseZoningLookup({ ...zoningFixture(), failed: ['LT_C_UQ112'], complete: false }, lat, lng)).toMatchObject({ complete: false, found: true });
    expect(() => parseZoningLookup({ ...zoningFixture(), landUse: 'commercial' }, lat, lng)).toThrow();
    expect(() => parseZoningLookup({ ...zoningFixture(), all: [{ layer: 'not-zoning', name: '공업지역' }] }, lat, lng)).toThrow();
  });
  it('accepts exact zero-buffer scope and rejects a buffered observation there', () => {
    const raw = { ...restrictionFixture(), bufferM: 0, queried: restrictionFixture().queried.slice(0, -1) };
    expect(parseRestrictionLookup(raw, lat, lng, 0).bufferM).toBe(0);
    expect(() => parseRestrictionLookup({ ...raw, hits: [{ layer: 'LT_C_UO301', name: null, buffered: true }] }, lat, lng, 0)).toThrow();
  });
  it('validates nearby geometry and scalar shape without dropping invalid candidates', () => {
    const raw = { ...meta(), basis: 'vworld-continuous-cadastral-map', minimumAreaM2: 3305.8, minimumAreaPyeong: 1000, searchRadiusKm: 15, candidates: [], truncated: false, searchedTiles: 25, note: '공개 도형 추정' };
    expect(parseNearbySites(raw, lat, lng).candidates).toEqual([]);
    expect(() => parseNearbySites({ ...raw, candidates: [{}] }, lat, lng)).toThrow();
    expect(() => parseNearbySites({ ...raw, searchedTiles: 2 }, lat, lng)).toThrow();
  });
});

describe('deadline, bytes, cache and retry', () => {
  afterEach(() => vi.useRealTimers());
  it('ends a non-cooperative body stall at the single 15s deadline and cleans timers', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => { signal = init.signal; return new Response(new ReadableStream({ cancel }), { headers: { 'content-type': 'application/json' } }); }));
    const pending = boundedJson('/api/test');
    const rejected = expect(pending).rejects.toThrow('제한시간');
    await vi.advanceTimersByTimeAsync(ONLINE_DEADLINE_MS);
    await rejected;
    expect(signal?.aborted).toBe(true); expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts an ignored fetch immediately and cancels its late body', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const parent = new AbortController();
    const pending = boundedJson('/api/test', { signal: parent.signal });
    parent.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const cancel = vi.fn(); resolve(new Response(new ReadableStream({ cancel })));
    await Promise.resolve(); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each([
    new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    new Response(new Uint8Array([0xff]), { headers: { 'content-type': 'application/json' } }),
    new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '2097153' } }),
    new Response('x'.repeat(2097153), { headers: { 'content-type': 'application/json' } }),
  ])('rejects malformed, wrong-media or oversized body', async (response) => {
    vi.stubGlobal('fetch', vi.fn(async () => response)); await expect(boundedJson('/api/test')).rejects.toThrow();
  });
  it('expires successes after ten minutes, keeps known hits stale, and bypasses the CDN on retry', async () => {
    vi.useFakeTimers();
    const latitude = 36.41;
    const raw = { ...restrictionFixture(latitude), hits: [prohibitedHit] };
    const mock = vi.fn().mockResolvedValueOnce(Response.json(raw)).mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async () => Response.json({ ...restrictionFixture(latitude), hits: [prohibitedHit] }));
    vi.stubGlobal('fetch', mock);
    await fetchRestrictions(latitude, lng, 500);
    await fetchRestrictions(latitude, lng, 500);
    expect(mock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LOOKUP_TTL_MS + 1);
    expect(peekRestrictions(latitude, lng, 500)).toMatchObject({ stale: true, complete: false, hits: [prohibitedHit] });
    await expect(fetchRestrictions(latitude, lng, 500, undefined, true)).rejects.toThrow();
    expect(peekRestrictions(latitude, lng, 500)?.complete).toBe(false);
    const recovered = await fetchRestrictions(latitude, lng, 500, undefined, true);
    expect(recovered.complete).toBe(true);
    expect(mock.mock.calls[1][0]).toContain('&refresh='); expect(mock.mock.calls[2][0]).not.toBe(mock.mock.calls[1][0]);
  });
  it('does not reuse an expired empty answer as evidence of absence', async () => {
    vi.useFakeTimers();
    const latitude = 36.42;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(restrictionFixture(latitude))));
    await fetchRestrictions(latitude, lng, 500);
    await vi.advanceTimersByTimeAsync(LOOKUP_TTL_MS + 1);
    expect(peekRestrictions(latitude, lng, 500)).toBeUndefined();
  });
  it('turns a CDN-old success into incomplete evidence and recovers using a fresh forced response', async () => {
    const latitude = 36.43;
    const raw = { ...zoningFixture(latitude), fetchedAt: new Date(Date.now() - LOOKUP_TTL_MS - 1).toISOString() };
    const mock = vi.fn().mockResolvedValueOnce(Response.json(raw)).mockResolvedValueOnce(Response.json(zoningFixture(latitude)));
    vi.stubGlobal('fetch', mock);
    expect(await lookupZoning(latitude, lng)).toMatchObject({ complete: false, stale: true });
    expect(peekZoning(latitude, lng)?.complete).toBe(false);
    expect(await lookupZoning(latitude, lng, undefined, true)).toMatchObject({ complete: true });
    expect(mock.mock.calls[1][0]).toContain('&refresh=');
  });
  it('preserves a prior prohibited observation on a later partial empty response', async () => {
    const latitude = 36.44;
    const raw = restrictionFixture(latitude);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ ...raw, hits: [prohibitedHit] })).mockResolvedValueOnce(Response.json({ ...raw, complete: false, failed: ['LT_C_UD801'] })));
    await fetchRestrictions(latitude, lng, 500);
    expect(await fetchRestrictions(latitude, lng, 500, undefined, true)).toMatchObject({ complete: false, hits: [prohibitedHit] });
  });
});

describe('address absence is a validated API error, not an arbitrary HTTP 404', () => {
  it.each([
    ['official absence', 'NOT_FOUND', 'text/plain', true],
    ['undeployed HTML route', '<html>not found</html>', 'text/html', false],
    ['unexpected JSON', '{"code":"NOT_FOUND"}', 'application/json', false],
    ['other plain error', 'UPSTREAM_UNAVAILABLE', 'text/plain', false],
    ['whitespace variant', ' NOT_FOUND ', 'text/plain', false],
  ])('%s', async (_name, body, type, absent) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 404, headers: { 'content-type': type } })));
    const error = await geocodeAddress('서울시청').catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message === 'NOT_FOUND').toBe(absent);
  });
  it('bounds both declared and actual 404 error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('N'.repeat(1025), { status: 404, headers: { 'content-type': 'text/plain' } })));
    await expect(geocodeAddress('서울시청')).rejects.not.toThrow('NOT_FOUND');
  });
});

it('keeps a stalled 404 error body under the same total deadline', async () => {
  vi.useFakeTimers();
  try {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel }), { status: 404, headers: { 'content-type': 'text/plain' } })));
    const pending = geocodeAddress('서울시청');
    const rejected = expect(pending).rejects.toThrow('제한시간');
    await vi.advanceTimersByTimeAsync(ONLINE_DEADLINE_MS);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
