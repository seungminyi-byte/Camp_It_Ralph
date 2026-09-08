import { describe, expect, it } from 'vitest';
import type { DataCenterSiteFile } from '../types';
import { validDataCenters } from './useAppData';

const validFile: DataCenterSiteFile = {
  version: 1,
  asOf: '2026-09-08',
  scope: 'test',
  classification: { edgeSmall: 'test', colocation: 'test', hyperscale: 'test' },
  sites: [
    {
      id: 'dc-1',
      name: 'Test DC',
      operator: 'Test',
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
