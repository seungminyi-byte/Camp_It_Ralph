import { afterEach, describe, expect, it, vi } from 'vitest';
import { disasterFixture } from '../test/onlineFixtures';
import { fetchDisaster, parseDisasterLookup, peekDisaster } from './disaster';

afterEach(() => vi.unstubAllGlobals());
const lookup = (lat: number) => disasterFixture(lat, 127);

describe('disaster client confidence and cancellation', () => {
  it.each([{}, { ...lookup(36), found: true }, { ...lookup(36), hits: null }, lookup(37)])('rejects missing, contradictory, or wrong-coordinate data', (raw) => {
    expect(() => parseDisasterLookup(raw, 36, 127)).toThrow();
  });

  it('caches valid responses and retries failed or malformed responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({})).mockResolvedValueOnce(Response.json(lookup(36.1)));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchDisaster(36.1, 127)).rejects.toThrow();
    expect(peekDisaster(36.1, 127)).toBeUndefined();
    await fetchDisaster(36.1, 127);
    await fetchDisaster(36.1, 127);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never caches a late response after the selection was aborted', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const ctrl = new AbortController();
    const pending = fetchDisaster(36.2, 127, ctrl.signal);
    ctrl.abort();
    resolve(Response.json(lookup(36.2)));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(peekDisaster(36.2, 127)).toBeUndefined();
  });
});
