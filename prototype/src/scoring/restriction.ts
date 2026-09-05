import type {
  Constants,
  ProtectedZone,
  ProtectedZones,
  ProtectedZonesFile,
  RestrictionHit,
  RestrictionLookup,
  ScoreResult,
} from '../types';
import { inBbox } from './geo';

type RestrictionConfig = Constants['scoring']['restriction'];

/** Deduction labels are string keys shared with report/checklist.ts and the golden tests. */
export const RESTRICTION_DEDUCTION_LABEL = {
  prohibited: '법적 입지 제한 구역',
  conditional: '규제구역 검토 필요',
} as const;

const SOURCE_LABEL: Record<RestrictionHit['source'], string> = {
  bundled: '공원경계·보호지역 도형',
  vworld: 'VWorld 조회',
};

/** Validate protected_zones.json once at load time; a malformed zone throws so the loader can drop the file. */
export function decodeProtectedZones(file: ProtectedZonesFile): ProtectedZones {
  const zones: ProtectedZone[] = file.zones.map((z, i) => {
    if (!Array.isArray(z.bbox) || z.bbox.length !== 4) throw new Error(`zone ${z.id ?? i}: bbox missing`);
    const rings = z.rings.map((ring, k) => {
      const [f0, f1] = ring[0] ?? [Number.NaN, Number.NaN];
      const [l0, l1] = ring[ring.length - 1] ?? [Number.NaN, Number.NaN];
      const closed = f0 === l0 && f1 === l1;
      const distinct = closed ? ring.length - 1 : ring.length;
      if (distinct < 3) throw new Error(`zone ${z.id}: ring ${k} has ${distinct} distinct points`);
      return closed ? ring : [...ring, ring[0]];
    });
    return { ...z, marine: z.marine ?? 0, rings };
  });
  return { source: file.source, sourceUrls: file.sourceUrls, asOf: file.asOf ?? {}, zones };
}

/** Even-odd ray cast on a closed [lat, lng] ring; mirrored by point_in_ring() in validate_out.py. */
export function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat) {
      const x = xi + ((lat - yi) * (xj - xi)) / (yj - yi);
      if (lng < x) inside = !inside;
    }
  }
  return inside;
}

/** bbox fast path, then the even-odd rule over every ring — so a hole in the zone counts as outside. */
export function pointInZone(zone: ProtectedZone, lat: number, lng: number): boolean {
  if (!inBbox(lat, lng, zone.bbox)) return false;
  let inside = false;
  for (const ring of zone.rings) if (pointInRing(lat, lng, ring)) inside = !inside;
  return inside;
}

/** Linear bbox scan: a couple of thousand zones cost well under a millisecond, so there is no spatial index. */
export function findZonesAt(zones: ProtectedZones, lat: number, lng: number): ProtectedZone[] {
  return zones.zones.filter((z) => pointInZone(z, lat, lng));
}

/**
 * Map the raw VWorld hits to canonical types through constants. A buffered hit only matters when the same layer
 * did not hit directly (a site inside a 보호구역 is already 입지 제한, not merely "within 500 m").
 */
export function classifyVworldHits(lookup: RestrictionLookup, cfg: RestrictionConfig): RestrictionHit[] {
  const direct = new Set(lookup.hits.filter((h) => !h.buffered).map((h) => h.layer));
  const out: RestrictionHit[] = [];
  for (const h of lookup.hits) {
    const layer = cfg.vworldLayers[h.layer];
    if (!layer) continue;
    let type = layer.type;
    if (h.buffered) {
      if (!layer.buffered || direct.has(h.layer)) continue;
      type = layer.buffered;
    } else if (layer.nameRules && h.name) {
      const name = h.name;
      const rule = layer.nameRules.find((r) => name.includes(r.includes));
      if (rule) type = rule.type;
    }
    const t = cfg.types[type];
    if (!t) continue;
    out.push({ type, name: h.name ?? type, level: t.level, law: t.law, source: 'vworld', layer: h.layer });
  }
  return out;
}

/**
 * Combine the bundled polygons and the VWorld lookup into one verdict. `unknown` means nothing could be checked
 * at all; `none` with a partial VWorld answer is reported through `checked` so the checklist can hedge.
 */
export function lookupRestrictions(
  zones: ProtectedZones | null,
  lookup: RestrictionLookup | null | undefined,
  lat: number,
  lng: number,
  cfg: RestrictionConfig,
): ScoreResult['restriction'] {
  const hits: RestrictionHit[] = [];
  if (zones) {
    for (const z of findZonesAt(zones, lat, lng)) {
      const t = cfg.types[z.type];
      if (!t) continue;
      hits.push({ type: z.type, name: z.name, level: t.level, law: t.law, source: 'bundled', zoneId: z.id });
    }
  }
  if (lookup) hits.push(...classifyVworldHits(lookup, cfg));

  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    const key = `${h.type}|${h.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Stable sort: prohibited first, bundled before VWorld within a level.
  unique.sort((a, b) => (a.level === b.level ? 0 : a.level === 'prohibited' ? -1 : 1));

  const vworld = !lookup ? 'none' : lookup.failed.length > 0 ? 'partial' : 'ok';
  const level = unique.some((h) => h.level === 'prohibited')
    ? 'prohibited'
    : unique.length > 0
      ? 'conditional'
      : !zones && vworld === 'none'
        ? 'unknown'
        : 'none';
  return { level, hits: unique, checked: { bundled: zones !== null, vworld } };
}

function hitLabel(h: RestrictionHit): string {
  return h.name === h.type ? h.type : `${h.name} (${h.type})`;
}

/** Deduction evidence: every hit with its statute and where it came from. */
export function describeRestrictionHits(hits: RestrictionHit[]): string {
  const body = hits
    .map((h) => `${hitLabel(h)} — ${h.law} [${SOURCE_LABEL[h.source]}]`)
    .join(' / ');
  return `${body} · 고시 도면·토지이용계획확인서 우선`;
}

/** One line for the card, the report header and the LLM prompt. */
export function summarizeRestriction(r: ScoreResult['restriction']): string {
  if (r.level === 'unknown') return '자료 없음 — 토지이용계획확인서(토지이음)에서 확인 필요';
  if (r.hits.length > 0) {
    const shown = r.hits.slice(0, 3).map(hitLabel).join(' · ');
    const more = r.hits.length > 3 ? ` 외 ${r.hits.length - 3}건` : '';
    const partial = r.checked.vworld === 'partial' ? ' · VWorld 일부 레이어 조회 실패' : '';
    return `${shown}${more}${partial}`;
  }
  if (r.checked.vworld === 'ok') {
    return r.checked.bundled
      ? '해당 없음 (공원경계·보호지역 도형 + VWorld 규제 레이어 확인)'
      : '해당 없음 (VWorld 규제 레이어만 확인)';
  }
  if (r.checked.vworld === 'partial') return '해당 없음 — VWorld 일부 레이어 조회 실패, 미확인 항목 있음';
  return '해당 없음 — VWorld 규제 레이어(개발제한구역 등) 미조회';
}
