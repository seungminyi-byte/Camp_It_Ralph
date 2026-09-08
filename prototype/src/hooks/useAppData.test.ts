import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DataCenterSiteFile } from '../types';
import { loadDataCenters, validDataCenters } from '../lib/dataCenters';

const validFile: DataCenterSiteFile = {
  version: 1,
  asOf: '2026-09-08',
  scope: 'test',
  classification: { edgeSmall: 'test', colocation: 'test', hyperscale: 'test' },
  sites: [
    {
      id: 'dc-1',
      name: 'Test DC',
      category: 'colocation',
      categoryReason: 'test',
      lat: 37.5,
      lng: 127,
      address: '서울',
      status: 'operational',
      openedYear: 2024,
      capacityMw: 10,
      capacityKind: 'IT',
      scaleNote: 'test',
      sourceName: 'official',
      sourceUrl: 'https://example.com/dc',
      coordinateBasis: 'address',
    },
  ],
};

describe('validDataCenters', () => {
  it('accepts the curated schema and rejects unsafe coordinates or sources', () => {
    expect(validDataCenters(validFile)).toBe(true);
    expect(validDataCenters({ ...validFile, sites: [{ ...validFile.sites[0], lat: 42 }] })).toBe(false);
    expect(
      validDataCenters({ ...validFile, sites: [{ ...validFile.sites[0], sourceUrl: 'javascript:alert(1)' }] }),
    ).toBe(false);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('optional data center loading', () => {
  it.each([null, [], 42, {}, { ...validFile, sites: [null] },
    { ...validFile, sites: [validFile.sites[0], validFile.sites[0]] },
    { ...validFile, sites: [{ ...validFile.sites[0], name: {} }] },
    { ...validFile, sites: [{ ...validFile.sites[0], capacityMw: -1 }] },
    { ...validFile, sites: [{ ...validFile.sites[0], capacityKind: null }] },
    { ...validFile, asOf: '2026-02-31' },
  ])('rejects malformed data without throwing', file => {
    expect(validDataCenters(file)).toBe(false);
  });
  it.each([404, 500])('treats HTTP %s as unconfirmed data', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    expect(await loadDataCenters()).toBeNull();
  });
  it.each(['not json', JSON.stringify({ ...validFile, sites: [null] })])('isolates bad response bodies', async body => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    expect(await loadDataCenters()).toBeNull();
  });
  it('isolates network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadDataCenters()).toBeNull();
  });
  it.each([validFile, { ...validFile, sites: [] }])('preserves valid data including an empty curated list', async file => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(file))));
    expect(await loadDataCenters()).toEqual(file);
  });
});
