// Pinned to Seoul like the other VWorld routes: calls from overseas Vercel regions can fail.
export const config = { runtime: 'edge', regions: ['icn1'] };

import { fetchVworld, jsonResponse, textResponse, vworldEnv, vworldJson } from './_vworld.js';

const UPSTREAM = 'https://api.vworld.kr/req/data';
const LAYER = 'LP_PA_CBND_BUBUN';
export const MINIMUM_AREA_M2 = 3_305.8;
const MINIMUM_AREA_PYEONG = 1_000;
const SEARCH_RADIUS_KM = 15;
const TILE_HALF_WIDTH_KM = 1.5;
const PAGE_SIZE = 1_000;
const MAX_CANDIDATES = 3;

type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = Position[][][];

interface GeoGeometry {
  type?: unknown;
  coordinates?: unknown;
}

interface RawFeature {
  id?: unknown;
  geometry?: GeoGeometry;
  properties?: Record<string, unknown>;
}

interface ParsedCandidate {
  id: string;
  label: string;
  pnu: string | null;
  areaM2: number;
  areaPyeong: number;
  distanceKm: number;
  center: { lat: number; lng: number };
  rings: [number, number][][];
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === 'number' && Number.isFinite(value[0]) &&
    typeof value[1] === 'number' && Number.isFinite(value[1]);
}

function isRing(value: unknown): value is Position[] {
  return Array.isArray(value) && value.length >= 4 && value.every(isPosition);
}

function polygonParts(geometry: GeoGeometry | undefined): PolygonCoordinates[] {
  if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates) &&
      geometry.coordinates.every(isRing)) {
    return [geometry.coordinates as PolygonCoordinates];
  }
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) &&
      geometry.coordinates.every(
        (polygon) => Array.isArray(polygon) && polygon.every(isRing),
      )) {
    return geometry.coordinates as MultiPolygonCoordinates;
  }
  return [];
}

function signedRingAreaM2(ring: Position[]): number {
  const meanLat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length;
  const xScale = 111_320 * Math.cos((meanLat * Math.PI) / 180);
  const yScale = 110_574;
  let twiceArea = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    twiceArea += current[0] * xScale * next[1] * yScale - next[0] * xScale * current[1] * yScale;
  }
  return twiceArea / 2;
}

export function geometryAreaM2(geometry: GeoGeometry | undefined): number {
  return polygonParts(geometry).reduce((total, polygon) => {
    const exterior = Math.abs(signedRingAreaM2(polygon[0]));
    const holes = polygon.slice(1).reduce((sum, ring) => sum + Math.abs(signedRingAreaM2(ring)), 0);
    return total + Math.max(0, exterior - holes);
  }, 0);
}

function centerOf(parts: PolygonCoordinates[]): { lat: number; lng: number } | null {
  const points = parts.flatMap((polygon) => polygon[0]?.slice(0, -1) ?? []);
  if (points.length === 0) return null;
  return {
    lng: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    lat: points.reduce((sum, point) => sum + point[1], 0) / points.length,
  };
}

function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInParts(lng: number, lat: number, parts: PolygonCoordinates[]): boolean {
  return parts.some((polygon) =>
    pointInRing(lng, lat, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(lng, lat, hole)),
  );
}

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function stringProp(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function parseFeatures(body: Record<string, unknown>): { features: RawFeature[]; total: number | null } {
  const response = body.response as {
    status?: unknown;
    record?: { total?: unknown };
    result?: { featureCollection?: { features?: unknown } };
  } | undefined;
  if (response?.status === 'NOT_FOUND') return { features: [], total: 0 };
  if (response?.status !== 'OK') throw new Error(`${LAYER}: status ${String(response?.status)}`);
  const features = response.result?.featureCollection?.features;
  if (!Array.isArray(features)) throw new Error(`${LAYER}: malformed feature collection`);
  return {
    features: features.filter((feature): feature is RawFeature => !!feature && typeof feature === 'object'),
    total: typeof response.record?.total === 'number' ? response.record.total : Number(response.record?.total) || null,
  };
}

export function buildCandidates(
  features: RawFeature[],
  selectedLat: number,
  selectedLng: number,
): ParsedCandidate[] {
  const seen = new Set<string>();
  return features.flatMap((feature, index): ParsedCandidate[] => {
    const parts = polygonParts(feature.geometry);
    const center = centerOf(parts);
    const areaM2 = geometryAreaM2(feature.geometry);
    if (!center || areaM2 < MINIMUM_AREA_M2) return [];
    if (pointInParts(selectedLng, selectedLat, parts)) return [];
    const properties = feature.properties ?? {};
    const pnu = stringProp(properties, ['pnu', 'PNU']);
    const id = pnu ?? (typeof feature.id === 'string' ? feature.id : `parcel-${index}`);
    if (seen.has(id)) return [];
    seen.add(id);
    const distance = distanceKm(selectedLat, selectedLng, center.lat, center.lng);
    // The upstream search is a square BOX; enforce the user-facing circular radius here.
    if (distance > SEARCH_RADIUS_KM) return [];
    const address = stringProp(properties, ['addr', 'full_addr', 'address']);
    const jibun = stringProp(properties, ['jibun', 'jibun_nm']);
    return [{
      id,
      label: address ?? jibun ?? `인근 필지 ${index + 1}`,
      pnu,
      areaM2,
      areaPyeong: areaM2 / 3.3058,
      distanceKm: distance,
      center,
      rings: parts.map((polygon) => polygon[0].map(([lng, lat]) => [lat, lng])),
    }];
  }).sort((a, b) => {
    // Prefer closer parcels, with a small benefit for sites that comfortably clear the cutoff.
    const aRank = a.distanceKm - Math.min(a.areaM2 / MINIMUM_AREA_M2, 3) * 0.08;
    const bRank = b.distanceKm - Math.min(b.areaM2 / MINIMUM_AREA_M2, 3) * 0.08;
    return aRank - bRank;
  }).slice(0, MAX_CANDIDATES);
}

async function queryParcelTile(lat: number, lng: number, key: string, domain: string) {
  const latDelta = TILE_HALF_WIDTH_KM / 110.574;
  const lngDelta = TILE_HALF_WIDTH_KM / (111.32 * Math.cos((lat * Math.PI) / 180));
  const url = new URL(UPSTREAM);
  const set = (name: string, value: string) => url.searchParams.set(name, value);
  set('service', 'data');
  set('version', '2.0');
  set('request', 'GetFeature');
  set('format', 'json');
  set('errorFormat', 'json');
  set('size', String(PAGE_SIZE));
  set('page', '1');
  set('geometry', 'true');
  set('attribute', 'true');
  set('crs', 'EPSG:4326');
  set('data', LAYER);
  set('geomFilter', `BOX(${lng - lngDelta},${lat - latDelta},${lng + lngDelta},${lat + latDelta})`);
  return parseFeatures(await vworldJson(await fetchVworld(url, key, domain)));
}

function ringCenters(lat: number, lng: number, distance: number): { lat: number; lng: number }[] {
  return Array.from({ length: 8 }, (_, index) => {
    const angle = (index * Math.PI) / 4;
    const northKm = Math.cos(angle) * distance;
    const eastKm = Math.sin(angle) * distance;
    return {
      lat: lat + northKm / 110.574,
      lng: lng + eastKm / (111.32 * Math.cos((lat * Math.PI) / 180)),
    };
  });
}

async function stagedParcelSearch(lat: number, lng: number, key: string, domain: string) {
  const stages = [[{ lat, lng }], ...[5, 10, 14].map((distance) => ringCenters(lat, lng, distance))];
  const features: RawFeature[] = [];
  let totalFeatures = 0;
  let truncated = false;
  let searchedTiles = 0;
  for (const centers of stages) {
    const settled = await Promise.all(centers.map((center) => queryParcelTile(center.lat, center.lng, key, domain)));
    searchedTiles += centers.length;
    for (const result of settled) {
      features.push(...result.features);
      totalFeatures += result.features.length;
      truncated ||= result.total !== null && result.total > PAGE_SIZE;
    }
    if (buildCandidates(features, lat, lng).length >= MAX_CANDIDATES) break;
  }
  return { features, totalFeatures, truncated, searchedTiles };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return textResponse('method not allowed', 405);
  const { key, domain } = vworldEnv();
  if (!key) return textResponse('no VWORLD_API_KEY configured on server', 503);
  const query = new URL(req.url).searchParams;
  const lat = Number(query.get('lat'));
  const lng = Number(query.get('lng'));
  if (!(lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132)) return textResponse('lat/lng outside Korea', 400);
  const roundedLat = Math.round(lat * 1e5) / 1e5;
  const roundedLng = Math.round(lng * 1e5) / 1e5;
  try {
    const result = await stagedParcelSearch(roundedLat, roundedLng, key, domain);
    return jsonResponse({
      basis: 'vworld-continuous-cadastral-map',
      minimumAreaM2: MINIMUM_AREA_M2,
      minimumAreaPyeong: MINIMUM_AREA_PYEONG,
      searchRadiusKm: SEARCH_RADIUS_KM,
      candidates: buildCandidates(result.features, roundedLat, roundedLng),
      truncated: result.truncated,
      searchedTiles: result.searchedTiles,
      note: '15km 안에서 가까운 구역부터 단계적으로 탐색한 결과입니다. 연속지적도 도형 추정면적이며 권리·거래·접도·공식 대장면적 확인 전의 1차 후보입니다.',
    }, 'public, max-age=300, s-maxage=1800');
  } catch {
    return textResponse('vworld nearby-site lookup failed', 502);
  }
}
