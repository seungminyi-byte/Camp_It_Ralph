// Pinned to Seoul like the other VWorld routes: calls from overseas Vercel regions can fail.
export const config = { runtime: 'edge', regions: ['icn1'] };

import { fetchVworld, jsonResponse, vworldEnv, vworldJson, vworldFeatures, vworldPageComplete, LOOKUP_VERSION, UPSTREAM_TIMEOUT_MS } from './_vworld.js';
import { ApiError, coordinateQuery, errorResponse, methodNotAllowed, Operation, queryParams, isRecord } from './_http.js';

const UPSTREAM = 'https://api.vworld.kr/req/data';
const LAYER = 'LP_PA_CBND_BUBUN';
export const MINIMUM_AREA_M2 = 3_305.8;
const MINIMUM_AREA_PYEONG = 1_000;
const SEARCH_RADIUS_KM = 15;
const TILE_HALF_WIDTH_KM = 1.5;
const PAGE_SIZE = 1_000;
const MAX_CANDIDATES = 3;

type Position = [number, number, number?];
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
  return Array.isArray(value) && (value.length === 2 || value.length === 3) &&
    value.every((ordinate) => typeof ordinate === 'number' && Number.isFinite(ordinate)) &&
    typeof value[0] === 'number' && value[0] >= -180 && value[0] <= 180 &&
    typeof value[1] === 'number' && value[1] >= -90 && value[1] <= 90;
}

function isRing(value: unknown): value is Position[] {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
  const first = value[0], last = value[value.length - 1];
  if (first.length !== last.length || !first.every((ordinate, index) => ordinate === last[index])) return false;
  if (new Set(value.slice(0, -1).map(([lng, lat]) => `${lng},${lat}`)).size < 3) return false;
  // Use coordinates relative to the first point to reject zero-area rings without
  // subtracting large longitude/latitude products. This does not repair topology.
  let twiceArea = 0;
  for (let index = 1; index < value.length - 1; index++) {
    const current = value[index], next = value[index + 1];
    twiceArea += (current[0] - first[0]) * (next[1] - first[1]) -
      (next[0] - first[0]) * (current[1] - first[1]);
  }
  return Number.isFinite(twiceArea) && twiceArea !== 0;
}

function isPolygonCoordinates(value: unknown): value is PolygonCoordinates {
  return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

function polygonParts(geometry: GeoGeometry | undefined): PolygonCoordinates[] {
  if (geometry?.type === 'Polygon' && isPolygonCoordinates(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length > 0 && geometry.coordinates.every(isPolygonCoordinates)) {
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

function parseFeatures(body: Record<string, unknown>): { features: RawFeature[]; complete: boolean } {
  const features = vworldFeatures(body);
  for (const feature of features) {
    if (!isRecord(feature.geometry) || polygonParts(feature.geometry).length === 0) throw new ApiError('UPSTREAM_INVALID');
  }
  return { features: features as RawFeature[], complete: vworldPageComplete(body, features.length, PAGE_SIZE) };
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

async function queryParcelTile(lat: number, lng: number, key: string, domain: string, operation: Operation) {
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
  return parseFeatures(await vworldJson(await fetchVworld(url, key, domain, operation)));
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

async function stagedParcelSearch(lat: number, lng: number, key: string, domain: string, operation: Operation) {
  const stages = [[{ lat, lng }], ...[5, 10, 14].map((distance) => ringCenters(lat, lng, distance))];
  const features: RawFeature[] = [];
  let totalFeatures = 0;
  let truncated = false;
  let searchedTiles = 0;
  for (const centers of stages) {
    const settled = await Promise.all(centers.map((center) => queryParcelTile(center.lat, center.lng, key, domain, operation)));
    searchedTiles += centers.length;
    for (const result of settled) {
      features.push(...result.features);
      totalFeatures += result.features.length;
      truncated ||= !result.complete;
    }
    if (buildCandidates(features, lat, lng).length >= MAX_CANDIDATES) break;
  }
  return { features, totalFeatures, truncated, searchedTiles };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const operation = new Operation(req.signal, UPSTREAM_TIMEOUT_MS);
  try {
    const coordinate = coordinateQuery(queryParams(req), 5);
    const { key, domain } = vworldEnv();
    const result = await stagedParcelSearch(coordinate.lat, coordinate.lng, key, domain, operation);
    return jsonResponse({
      basis: 'vworld-continuous-cadastral-map',
      minimumAreaM2: MINIMUM_AREA_M2, minimumAreaPyeong: MINIMUM_AREA_PYEONG,
      searchRadiusKm: SEARCH_RADIUS_KM,
      candidates: buildCandidates(result.features, coordinate.lat, coordinate.lng),
      truncated: result.truncated, searchedTiles: result.searchedTiles,
      coordinate, fetchedAt: new Date().toISOString(), version: LOOKUP_VERSION,
      note: '15km 안에서 가까운 구역부터 단계적으로 탐색한 결과입니다. 연속지적도 도형 추정면적이며 권리·거래·접도·공식 대장면적 확인 전의 1차 후보입니다.',
    }, 'public, max-age=300, s-maxage=1800');
  } catch (error) { operation.abort(); return errorResponse(error); }
  finally { operation.dispose(); }
}
