import { describe, expect, it } from 'vitest';
import type { Constants, ProtectedZone, ProtectedZonesFile, RestrictionLookup } from '../types';
import { loadAppData, loadScenarios } from '../test/loadData';
import {
  classifyVworldHits,
  decodeProtectedZones,
  findZonesAt,
  lookupRestrictions,
  pointInRing,
  pointInZone,
} from './restriction';

type Cfg = Constants['scoring']['restriction'];

// Synthetic config: type names are deliberately not the production ones.
const CFG: Cfg = {
  prohibitedDeduction: 40,
  conditionalDeduction: 15,
  heritageBufferM: 500,
  types: {
    park: { level: 'prohibited', law: 'law-park' },
    band: { level: 'conditional', law: 'law-band' },
    gb: { level: 'prohibited', law: 'law-gb' },
    heritage: { level: 'prohibited', law: 'law-heritage' },
    heritageBuffer: { level: 'conditional', law: 'law-heritage-buffer' },
    agri: { level: 'prohibited', law: 'law-agri' },
    agriProtect: { level: 'conditional', law: 'law-agri-protect' },
  },
  vworldLayers: {
    LT_C_UD801: { type: 'gb' },
    LT_C_UO301: { type: 'heritage', buffered: 'heritageBuffer' },
    LT_C_AGRIXUE101: { type: 'agri', nameRules: [{ includes: '보호', type: 'agriProtect' }] },
  },
};

const square = (lat0: number, lng0: number, lat1: number, lng1: number): [number, number][] => [
  [lat0, lng0],
  [lat0, lng1],
  [lat1, lng1],
  [lat1, lng0],
  [lat0, lng0],
];

function zone(id: string, type: string, rings: [number, number][][]): ProtectedZone {
  const lats = rings.flat().map((p) => p[0]);
  const lngs = rings.flat().map((p) => p[1]);
  return {
    id,
    type,
    name: `${id}-name`,
    marine: 0,
    bbox: [Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)],
    rings,
  };
}

function file(zones: ProtectedZone[]): ProtectedZonesFile {
  return { source: 's', sourceUrls: ['u'], builtAt: 't', asOf: {}, method: {}, types: {}, zones };
}

const lookup = (hits: RestrictionLookup['hits'], failed: string[] = []): RestrictionLookup => ({
  hits,
  queried: ['LT_C_UD801', 'LT_C_UO301', 'LT_C_UO301@500', 'LT_C_AGRIXUE101'],
  failed,
  complete: failed.length === 0,
});

describe('point in polygon', () => {
  it('square with a hole: inside the ring is in, inside the hole is out', () => {
    const z = zone('a', 'park', [square(37.0, 127.0, 37.1, 127.1), square(37.04, 127.04, 37.06, 127.06)]);
    expect(pointInZone(z, 37.02, 127.02)).toBe(true);
    expect(pointInZone(z, 37.05, 127.05)).toBe(false);
    expect(pointInZone(z, 37.2, 127.2)).toBe(false);
  });

  it('concave L-shape: inside the bbox but outside the shape is out', () => {
    // (lat, lng) L: 2 wide at the bottom, 1 wide at the top
    const ring: [number, number][] = [[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0], [0, 0]];
    expect(pointInRing(0.5, 1.5, ring)).toBe(true);
    expect(pointInRing(1.5, 1.5, ring)).toBe(false);
    expect(pointInRing(1.5, 0.5, ring)).toBe(true);
    const z = zone('l', 'park', [ring]);
    expect(pointInZone(z, 1.5, 1.5)).toBe(false); // bbox fast path must not short-circuit to true
  });

  it('multipart zone: either part counts', () => {
    const z = zone('m', 'park', [square(35.0, 128.0, 35.1, 128.1), square(35.5, 128.5, 35.6, 128.6)]);
    expect(pointInZone(z, 35.55, 128.55)).toBe(true);
    expect(pointInZone(z, 35.3, 128.3)).toBe(false);
  });

  it('findZonesAt returns every containing zone', () => {
    const zones = decodeProtectedZones(
      file([zone('a', 'park', [square(37.0, 127.0, 37.1, 127.1)]), zone('b', 'band', [square(37.05, 127.05, 37.2, 127.2)])]),
    );
    expect(findZonesAt(zones, 37.07, 127.07).map((z) => z.id)).toEqual(['a', 'b']);
    expect(findZonesAt(zones, 37.15, 127.15).map((z) => z.id)).toEqual(['b']);
    expect(findZonesAt(zones, 36.0, 126.0)).toEqual([]);
  });
});

describe('decodeProtectedZones', () => {
  it('closes an unclosed ring and keeps closed ones as they are', () => {
    const open: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const z = decodeProtectedZones(file([zone('o', 'park', [open])]));
    expect(z.zones[0].rings[0]).toHaveLength(5);
    expect(z.zones[0].rings[0][4]).toEqual([0, 0]);
    const closed = decodeProtectedZones(file([zone('c', 'park', [square(0, 0, 1, 1)])]));
    expect(closed.zones[0].rings[0]).toHaveLength(5);
  });

  it('rejects a ring with fewer than three distinct points or a zone without bbox', () => {
    expect(() => decodeProtectedZones(file([zone('t', 'park', [[[0, 0], [1, 1], [0, 0]]])]))).toThrow();
    const noBbox = { ...zone('n', 'park', [square(0, 0, 1, 1)]), bbox: undefined } as unknown as ProtectedZone;
    expect(() => decodeProtectedZones(file([noBbox]))).toThrow();
  });
});

describe('classifyVworldHits', () => {
  it('maps layers through constants, applies name rules and ignores unknown layers', () => {
    const hits = classifyVworldHits(
      lookup([
        { layer: 'LT_C_UD801', name: '개발제한구역', buffered: false },
        { layer: 'LT_C_AGRIXUE101', name: '농업보호구역', buffered: false },
        { layer: 'LT_C_XXX', name: 'x', buffered: false },
      ]),
      CFG,
    );
    expect(hits.map((h) => [h.type, h.level, h.source])).toEqual([
      ['gb', 'prohibited', 'vworld'],
      ['agriProtect', 'conditional', 'vworld'],
    ]);
  });

  it('a buffered hit only counts when the same layer did not hit directly', () => {
    const bufferedOnly = classifyVworldHits(lookup([{ layer: 'LT_C_UO301', name: null, buffered: true }]), CFG);
    expect(bufferedOnly.map((h) => h.type)).toEqual(['heritageBuffer']);
    expect(bufferedOnly[0].name).toBe('heritageBuffer');
    const both = classifyVworldHits(
      lookup([
        { layer: 'LT_C_UO301', name: '사적', buffered: false },
        { layer: 'LT_C_UO301', name: '사적', buffered: true },
      ]),
      CFG,
    );
    expect(both.map((h) => h.type)).toEqual(['heritage']);
  });
});

describe('lookupRestrictions', () => {
  const zones = decodeProtectedZones(
    file([zone('p', 'park', [square(37.0, 127.0, 37.1, 127.1)]), zone('b', 'band', [square(37.0, 127.0, 37.3, 127.3)])]),
  );

  it('is unknown only when neither layer could be checked', () => {
    expect(lookupRestrictions(null, null, 37.05, 127.05, CFG).level).toBe('unknown');
    const r = lookupRestrictions(zones, null, 38.0, 128.0, CFG);
    expect(r.level).toBe('none');
    expect(r.checked).toEqual({ bundled: true, vworld: 'none' });
    expect(lookupRestrictions(null, lookup([]), 38.0, 128.0, CFG).level).toBe('none');
  });

  it('prohibited beats conditional and comes first in the hit list', () => {
    const r = lookupRestrictions(zones, null, 37.05, 127.05, CFG);
    expect(r.level).toBe('prohibited');
    expect(r.hits.map((h) => h.type)).toEqual(['park', 'band']);
    const onlyBand = lookupRestrictions(zones, null, 37.2, 127.2, CFG);
    expect(onlyBand.level).toBe('conditional');
    expect(onlyBand.hits[0].zoneId).toBe('b');
  });

  it('merges VWorld hits, dedupes by type and name, and reports partial answers', () => {
    const r = lookupRestrictions(zones, lookup([{ layer: 'LT_C_UD801', name: 'gb', buffered: false }]), 37.2, 127.2, CFG);
    expect(r.level).toBe('prohibited');
    expect(r.hits.map((h) => [h.type, h.source])).toEqual([
      ['gb', 'vworld'],
      ['band', 'bundled'],
    ]);
    const partial = lookupRestrictions(zones, lookup([], ['LT_C_UD801']), 38.0, 128.0, CFG);
    expect(partial.level).toBe('none');
    expect(partial.checked.vworld).toBe('partial');
    const dup = lookupRestrictions(
      zones,
      lookup([
        { layer: 'LT_C_UD801', name: 'gb', buffered: false },
        { layer: 'LT_C_UD801', name: 'gb', buffered: false },
      ]),
      38.0,
      128.0,
      CFG,
    );
    expect(dup.hits).toHaveLength(1);
  });
});

describe('bundled protected_zones.json', () => {
  const data = loadAppData();
  const cfg = data.constants.scoring.restriction;

  it('every ring is closed, has at least four points and stays inside its bbox', () => {
    if (!data.protectedZones) return;
    for (const z of data.protectedZones.zones) {
      expect(cfg.types[z.type], z.type).toBeDefined();
      for (const ring of z.rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const [lat, lng] of ring) {
          expect(lat >= z.bbox[0] && lat <= z.bbox[2] && lng >= z.bbox[1] && lng <= z.bbox[3], z.id).toBe(true);
        }
      }
    }
  });

  it('북한산·지리산·설악산 are inside their 국립공원 polygons', () => {
    if (!data.protectedZones) return;
    for (const [name, lat, lng] of [
      ['북한산', 37.66, 126.98],
      ['지리산', 35.34, 127.73],
      ['설악산', 38.12, 128.47],
    ] as const) {
      const parks = findZonesAt(data.protectedZones, lat, lng).filter((z) => z.type === '국립공원');
      expect(parks.map((z) => z.name), name).toContain(name);
    }
  });

  it('the demo scenarios sit outside every 법적 입지 제한 zone', () => {
    if (!data.protectedZones) return;
    for (const sc of loadScenarios()) {
      const r = lookupRestrictions(data.protectedZones, null, sc.lat, sc.lng, cfg);
      expect(r.level, sc.id).not.toBe('prohibited');
    }
  });
});
