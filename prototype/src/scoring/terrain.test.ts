import { describe, expect, it } from 'vitest';
import type { Constants, ReclaimedOverride, TerrainGridFile, TerrainSample } from '../types';
import { classifySite, decodeTerrain, findReclaimedOverride, lookupTerrain, slopeDeduction } from './terrain';

type TerrainConfig = Constants['scoring']['terrain'];

const CFG: TerrainConfig = {
  seaMaxLandPct: 20,
  coastalMaxLandPct: 60,
  slopeDeduction: [
    { maxP50Deg: 5, deduction: 0, label: '평탄' },
    { maxP50Deg: 10, deduction: 5, label: '완경사' },
    { maxP50Deg: 15, deduction: 10, label: '경사지' },
    { maxP50Deg: 25, deduction: 20, label: '급경사' },
    { maxP50Deg: 999, deduction: 30, label: '산지' },
  ],
  unsuitable: { minP50Deg: 25, minSteepPct: 70, minDeduction: 20 },
  reclaimedOverrides: [{ name: '새만금', bbox: [35.68, 126.42, 35.98, 126.78] }],
};

/** 2 rows x 3 cols starting at (33.00, 125.50), 0.01 degree cells. */
function buildFile(planes: Record<string, number[]>): TerrainGridFile {
  const enc = (a: number[]) => btoa(String.fromCharCode(...a));
  return {
    source: 'test',
    attribution: 'test',
    fetchedAt: '2026-09-04T00:00:00Z',
    method: { sampleArcsec: 3, slope: 'central difference', samplesPerCell: 144, steepThresholdDeg: 15 },
    grid: { lat0: 33, lng0: 125.5, step: 0.01, rows: 2, cols: 3, origin: 'sw' },
    encoding: { type: 'base64-uint8', nodata: 255 },
    planes: {
      landPct: enc(planes.landPct),
      slopeP50Deg: enc(planes.slopeP50Deg),
      steepPct: enc(planes.steepPct),
      elevMean10m: enc(planes.elevMean10m),
    },
  };
}

const FILE = buildFile({
  landPct: [100, 0, 255, 40, 100, 100],
  slopeP50Deg: [3, 0, 255, 8, 28, 12],
  steepPct: [0, 0, 255, 5, 91, 20],
  elevMean10m: [2, 0, 255, 1, 90, 7],
});

const sample = (over: Partial<TerrainSample> = {}): TerrainSample => ({
  landPct: 100, slopeP50Deg: 3, steepPct: 0, elevM: 20, row: 0, col: 0, ...over,
});

describe('decodeTerrain / lookupTerrain', () => {
  const grid = decodeTerrain(FILE);

  it('round-trips the base64 planes', () => {
    expect(grid.rows).toBe(2);
    expect(grid.cols).toBe(3);
    expect(Array.from(grid.landPct)).toEqual([100, 0, 255, 40, 100, 100]);
    expect(grid.steepThresholdDeg).toBe(15);
  });

  it('rejects a plane whose length does not match the grid', () => {
    const bad = buildFile({ landPct: [1, 2], slopeP50Deg: [0, 0, 0, 0, 0, 0], steepPct: [0, 0, 0, 0, 0, 0], elevMean10m: [0, 0, 0, 0, 0, 0] });
    expect(() => decodeTerrain(bad)).toThrow(/landPct/);
  });

  it('maps a point to its cell and scales elevation back to metres', () => {
    expect(lookupTerrain(grid, 33.005, 125.505)).toMatchObject({ landPct: 100, slopeP50Deg: 3, elevM: 20, row: 0, col: 0 });
    expect(lookupTerrain(grid, 33.015, 125.515)).toMatchObject({ landPct: 100, slopeP50Deg: 28, elevM: 900, row: 1, col: 1 });
  });

  it('treats cell edges as inclusive lower bounds', () => {
    expect(lookupTerrain(grid, 33.0, 125.5)?.col).toBe(0);
    expect(lookupTerrain(grid, 33.01, 125.52)).toMatchObject({ row: 1, col: 2 });
  });

  it('returns null outside the grid and on nodata cells', () => {
    expect(lookupTerrain(grid, 32.999, 125.505)).toBeNull();
    expect(lookupTerrain(grid, 33.005, 125.499)).toBeNull();
    expect(lookupTerrain(grid, 33.02, 125.505)).toBeNull();
    expect(lookupTerrain(grid, 33.005, 125.53)).toBeNull();
    expect(lookupTerrain(grid, 33.005, 125.525)).toBeNull(); // nodata = 255
  });
});

describe('classifySite', () => {
  const opts = { zoningFound: null };

  it('calls a missing sample nodata', () => {
    expect(classifySite(null, null, CFG, opts).status).toBe('nodata');
  });

  it('calls a mostly-dry cell land and a mixed cell coastal', () => {
    expect(classifySite(sample({ landPct: 60 }), null, CFG, opts)).toMatchObject({ status: 'ok', eligible: true });
    expect(classifySite(sample({ landPct: 40 }), null, CFG, opts)).toMatchObject({ status: 'coastal', eligible: false });
    expect(classifySite(sample({ landPct: 21 }), null, CFG, { zoningFound: true })).toMatchObject({ status: 'coastal', eligible: true });
    expect(classifySite(sample({ landPct: 40 }), null, CFG, { zoningFound: false })).toMatchObject({ status: 'sea', eligible: false });
  });

  it('calls open water sea only when nothing rescues it', () => {
    const wet = sample({ landPct: 0 });
    expect(classifySite(wet, null, CFG, opts).status).toBe('sea');

    const over = classifySite(wet, CFG.reclaimedOverrides[0], CFG, opts);
    expect(over.status).toBe('reclaimed');
    expect(over.override).toBe('새만금');
    expect(classifySite(sample({ landPct: 40 }), CFG.reclaimedOverrides[0], CFG, opts)).toMatchObject({
      status: 'reclaimed',
      eligible: true,
    });

    expect(classifySite(wet, null, CFG, { zoningFound: true })).toMatchObject({ status: 'reclaimed', eligible: true });
    expect(classifySite(wet, null, CFG, { zoningFound: false })).toMatchObject({ status: 'sea', eligible: false });
  });
});

describe('findReclaimedOverride', () => {
  const list: ReclaimedOverride[] = CFG.reclaimedOverrides;
  it('matches inside the box and its edges only', () => {
    expect(findReclaimedOverride(list, 35.8, 126.6)?.name).toBe('새만금');
    expect(findReclaimedOverride(list, 35.68, 126.42)?.name).toBe('새만금');
    expect(findReclaimedOverride(list, 35.67, 126.6)).toBeNull();
    expect(findReclaimedOverride(list, 37.5, 127.0)).toBeNull();
  });
});

describe('slopeDeduction', () => {
  it('picks the band by median slope, upper bound inclusive', () => {
    expect(slopeDeduction(sample({ slopeP50Deg: 5 }), CFG).points).toBe(0);
    expect(slopeDeduction(sample({ slopeP50Deg: 6 }), CFG).points).toBe(5);
    expect(slopeDeduction(sample({ slopeP50Deg: 15 }), CFG).points).toBe(10);
    expect(slopeDeduction(sample({ slopeP50Deg: 25 }), CFG).points).toBe(20);
    expect(slopeDeduction(sample({ slopeP50Deg: 26 }), CFG).points).toBe(30);
  });

  it('flags unsuitable ground by median slope or by steep share', () => {
    expect(slopeDeduction(sample({ slopeP50Deg: 25, steepPct: 10 }), CFG).unsuitable).toBe(true);
    expect(slopeDeduction(sample({ slopeP50Deg: 8, steepPct: 70 }), CFG)).toMatchObject({ unsuitable: true, points: 20 });
    expect(slopeDeduction(sample({ slopeP50Deg: 8, steepPct: 40 }), CFG).unsuitable).toBe(false);
  });
});
