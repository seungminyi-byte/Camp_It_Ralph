import { isEvidenceFresh } from '../lib/lookupContract';
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

/** Normalize typography only, never infer a legal type from an arbitrary substring. */
function normalizeName(name: string): string {
  return name.normalize('NFC').replace(/\s/g, '').replace(/[ㆍ・]/g, '·');
}

/** Keep direct and nearby observations: the transport has no reliable feature identity. */
export function classifyVworldHits(lookup: RestrictionLookup, cfg: RestrictionConfig): RestrictionHit[] {
  const out: RestrictionHit[] = [];
  const queriedBuffer = lookup.queried.find(q => /^LT_C_UO301@\d+$/.test(q))?.split('@')[1];
  const bufferM = lookup.bufferM ?? (queriedBuffer ? Number(queriedBuffer) : cfg.heritageBufferM);
  for (const h of lookup.hits) {
    const layer = cfg.vworldLayers[h.layer];
    if (!layer) continue;
    let type = layer.type;
    if (layer.nameRules && h.name) {
      const name = h.name;
      const rule = layer.nameRules.find((r) =>
        r.equals?.some(alias => normalizeName(alias) === normalizeName(name)) ||
        (h.layer !== 'LT_C_UO301' && r.includes !== undefined && name.includes(r.includes)),
      );
      if (rule) type = rule.type;
    }
    if (h.buffered && (!layer.buffered || bufferM <= 0)) continue;
    // Heritage keeps its named category; its spatial relation determines review versus reference.
    if (h.buffered && (h.layer !== 'LT_C_UO301' || type === layer.type)) type = layer.buffered!;
    const t = cfg.types[type];
    if (!t) continue;
    out.push({
      type, name: h.name?.trim() ? h.name : type, rawName: h.name,
      level: h.buffered && h.layer === 'LT_C_UO301' ? 'reference' : t.level,
      relation: h.buffered ? 'nearby' : 'direct', law: t.law,
      reviewNote: t.reviewNote, sourceIds: t.sourceIds,
      ...(h.buffered ? { bufferM } : {}), source: 'vworld', layer: h.layer,
    });
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
      hits.push({ type: z.type, name: z.name, rawName: z.name, level: t.level, relation: 'direct', law: t.law, reviewNote: t.reviewNote, sourceIds: t.sourceIds, source: 'bundled', zoneId: z.id });
    }
  }
  if (lookup) hits.push(...classifyVworldHits(lookup, cfg));

  const seen = new Set<string>();
  const unique = hits.filter((h) => {
    const key = JSON.stringify([h.source, h.layer ?? h.zoneId, h.type, h.rawName, h.relation]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Stable severity order, preserving source order within the same level.
  const priority = { prohibited: 0, conditional: 1, review: 2, reference: 3 };
  unique.sort((a, b) => priority[a.level] - priority[b.level]);

  const vworld = !lookup ? 'none' : !lookup.complete || !isEvidenceFresh(lookup) || lookup.failed.length > 0 ? 'partial' : 'ok';
  const hasSuccessfulQuery = lookup?.queried.some(q => !lookup.failed.includes(q)) ?? false;
  const level = unique[0]?.level ?? (!zones && !hasSuccessfulQuery ? 'unknown' : 'none');
  return {
    level, hits: unique,
    scoringHits: unique.filter(h => h.level === 'prohibited' || h.level === 'conditional'),
    requiresLegalReview: unique.some(h => h.level === 'review'),
    mapping: cfg.heritageMapping ?? null, fetchedAt: lookup?.fetchedAt ?? null,
    checked: { bundled: zones !== null, vworld },
  };
}

function hitLabel(h: RestrictionHit): string {
  return h.name === h.type ? h.type : `${h.name} (${h.type})`;
}

/** Format the supplied observations with their related rules and spatial limits. */
export function describeRestrictionHits(hits: RestrictionHit[]): string {
  const body = hits
    .map((h) => {
      const relation = h.relation === 'nearby'
        ? `주변 참고 · 검색 반경 ${h.bufferM}m · 법정 보존지역 해당 여부와 정확한 경계거리는 확인되지 않았습니다. 점수 반영 없음`
        : '조회 좌표의 도형 적중 · 필지 전체 포함 여부 미확인';
      return `${hitLabel(h)} — ${h.law} [${SOURCE_LABEL[h.source]} · ${relation}]${h.level === 'review' && h.reviewNote ? ` ${h.reviewNote}` : ''}`;
    })
    .join(' / ');
  return `${body} · 고시 도면·토지이용계획확인서 우선`;
}

/** Compact observations for comparisons; full legal provenance for the evidence report. */
export function summarizeRestriction(r: ScoreResult['restriction'], detailed = false): string {
  if (r.level === 'unknown') return '자료 없음 — 토지이용계획확인서(토지이음)에서 확인 필요';
  if (r.hits.length > 0) {
    const review = r.requiresLegalReview ? '국가유산 관련 법적 적용 확인 필요 · 인허가·종합 참고점수 미산정. ' : '';
    const cap = r.requiresLegalReview && r.level === 'prohibited' ? '다른 확인된 법적 입지 제한으로 E등급 상한을 유지합니다. ' : '';
    const nearby = r.hits.some(h => h.relation === 'nearby');
    const duplicate = nearby && r.hits.some(h => h.relation === 'direct') ? ' 직접·주변 조회에 동일 대상이 중복 포함될 수 있습니다.' : '';
    const partial = r.checked.vworld === 'partial' ? ' 일부 규제 조회 미완료 · 확인된 제약과 관찰은 유지됩니다.' : '';
    const mapping = detailed && r.mapping && r.hits.some(h => h.level === 'review' || h.level === 'reference')
      ? ` 법령 검토 기준일 ${r.mapping.legalReviewedAt} · 분류 ${r.mapping.mappingVersion} · VWorld 문서 갱신 ${r.mapping.vworldDocumentUpdatedAt}.`
      : '';
    const sourceIds = [...new Set(r.hits.flatMap(h => h.sourceIds ?? []))];
    const effective = (detailed ? sourceIds : []).flatMap(id => {
      const source = r.mapping?.sources[id];
      return source ? [`${source.title} 시행 ${source.effectiveAt}`] : [];
    }).join(' / ');
    const fetched = detailed && r.fetchedAt ? ` API 조회 ${r.fetchedAt} (법령·도형 기준일과 별개).` : '';
    const observations = detailed ? describeRestrictionHits(r.hits) : r.hits.map(h =>
      `${hitLabel(h)} [${h.relation === 'nearby' ? `주변 검색 반경 ${h.bufferM}m · 점수 반영 없음` : '조회 좌표 적중'}]`,
    ).join(' / ');
    const boundary = nearby && !detailed ? ' 법정 보존지역 해당 여부와 정확한 경계거리는 미확인입니다.' : '';
    return `${review}${cap}${r.level === 'reference' ? '국가유산 주변 조회 · 참고. ' : ''}${observations}${boundary}${duplicate}${partial}${mapping}${effective ? ` ${effective}.` : ''}${fetched}`;
  }
  if (r.checked.vworld === 'ok') {
    return r.checked.bundled
      ? '조회한 자료에서 해당 도형이 확인되지 않았습니다. 공원경계·보호지역 도형 + VWorld 규제 레이어 확인 · 최신 고시와 개별 행위 제한 확인 필요'
      : '조회한 자료에서 해당 도형이 확인되지 않았습니다. VWorld 규제 레이어만 확인 · 최신 고시와 개별 행위 제한 확인 필요';
  }
  if (r.checked.vworld === 'partial') return '일부 규제 조회 미완료 · 확인한 자료에서 적중 도형 없음, 미확인 항목 있음';
  return '번들에서 적중 도형 없음 · VWorld 규제 레이어(개발제한구역 등) 미조회';
}
