import { haversineKm } from '../scoring/geo';
import type { EmdCentroid } from '../types';

// emd_centroids.json spells 시도 out in full ("경기도", "세종특별자치시") and runs 시군구 together
// without spaces ("고양시일산서구"), so a query like "경기 고양" needs the short forms mapped back.
const SIDO_ALIASES: Record<string, string[]> = {
  서울특별시: ['서울', '서울시'],
  부산광역시: ['부산', '부산시'],
  대구광역시: ['대구', '대구시'],
  인천광역시: ['인천', '인천시'],
  광주광역시: ['광주', '광주시'],
  대전광역시: ['대전', '대전시'],
  울산광역시: ['울산', '울산시'],
  세종특별자치시: ['세종', '세종시'],
  경기도: ['경기'],
  강원특별자치도: ['강원', '강원도'],
  충청북도: ['충북'],
  충청남도: ['충남'],
  전북특별자치도: ['전북', '전라북도'],
  전라남도: ['전남'],
  전남광주통합특별시: ['전남', '광주', '전라남도'],
  경상북도: ['경북'],
  경상남도: ['경남'],
  제주특별자치도: ['제주', '제주도'],
};

const KOREA = { minLat: 33, maxLat: 39, minLng: 124, maxLng: 132 };

export interface EmdIndexEntry {
  row: EmdCentroid;
  /** searchable haystack: 시도 + aliases + 시군구 + 읍면동 */
  hay: string;
  display: string;
}

export interface EmdHit {
  entry: EmdIndexEntry;
  score: number;
  /** the last query token names this 읍면동 exactly */
  exact: boolean;
}

export function displayName(r: EmdCentroid): string {
  // 세종 rows repeat the 시도 as the 시군구; showing it twice reads like a bug.
  return r.sigungu === r.sido ? `${r.sido} ${r.emd}` : `${r.sido} ${r.sigungu} ${r.emd}`;
}

export function buildEmdIndex(rows: EmdCentroid[]): EmdIndexEntry[] {
  return rows.map((row) => ({
    row,
    hay: [row.sido, ...(SIDO_ALIASES[row.sido] ?? []), row.sigungu, row.emd].join(' '),
    display: displayName(row),
  }));
}

function matchesSido(entry: EmdIndexEntry, token: string): boolean {
  return (
    entry.row.sido.includes(token) ||
    (SIDO_ALIASES[entry.row.sido] ?? []).some((a) => a.includes(token))
  );
}

/**
 * Rank offline 읍면동 matches. 863 names are shared across the country ("교동" alone appears in 19
 * places), so an exact name match must outrank a substring one ("주교동" must not bury "교동").
 */
export function searchEmd(index: EmdIndexEntry[], query: string, limit = 8): EmdHit[] {
  const tokens = query.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const last = tokens[tokens.length - 1];

  const hits: EmdHit[] = [];
  for (const entry of index) {
    if (!tokens.every((t) => entry.hay.includes(t))) continue;
    const emd = entry.row.emd;
    let score = emd === last ? 100 : emd.startsWith(last) ? 60 : emd.includes(last) ? 30 : 0;
    if (score === 0) continue;
    if (tokens.length > 1 && (entry.row.sigungu.includes(tokens[0]) || matchesSido(entry, tokens[0]))) {
      score += 20;
    }
    score += Math.min(10, Math.log10(entry.row.n + 1) * 3); // prefer the better-sampled centroid
    hits.push({ entry, score, exact: emd === last });
  }
  hits.sort((a, b) => b.score - a.score || b.entry.row.n - a.entry.row.n);

  // "전남광주통합특별시" duplicates 광주/전남 rows at the same coordinates; keep one of each pair.
  const kept: EmdHit[] = [];
  for (const h of hits) {
    const dup = kept.some(
      (k) =>
        k.entry.row.sigungu === h.entry.row.sigungu &&
        k.entry.row.emd === h.entry.row.emd &&
        haversineKm(k.entry.row.lat, k.entry.row.lng, h.entry.row.lat, h.entry.row.lng) < 1,
    );
    if (!dup) kept.push(h);
    if (kept.length >= limit) break;
  }
  return kept;
}

const LAT_LNG_RE = /^([+-]?\d{1,3}(?:\.\d+)?)\s*[,\s/]\s*([+-]?\d{1,3}(?:\.\d+)?)$/;

/** Shaped like a coordinate pair, inside Korea or not — lets the UI explain an out-of-range pair. */
export function looksLikeLatLng(query: string): boolean {
  return LAT_LNG_RE.test(query.trim());
}

/** "37.68, 126.74" — also accepts the two swapped, since both orders are common. */
export function parseLatLng(query: string): { lat: number; lng: number } | null {
  const m = query.trim().match(LAT_LNG_RE);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const inKorea = (lat: number, lng: number) =>
    lat >= KOREA.minLat && lat <= KOREA.maxLat && lng >= KOREA.minLng && lng <= KOREA.maxLng;
  if (inKorea(a, b)) return { lat: a, lng: b };
  if (inKorea(b, a)) return { lat: b, lng: a };
  return null;
}
