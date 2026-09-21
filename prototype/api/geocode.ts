export const config = { runtime: 'edge', regions: ['icn1'] };

// Address -> coordinate through the VWorld Geocoder, for the search box in the site panel.
// Offline 읍면동 search is handled in the bundle; this route only covers 도로명/지번 addresses.

import { fetchVworld, jsonResponse, vworldEnv, vworldJson, vworldResponse, LOOKUP_VERSION, UPSTREAM_TIMEOUT_MS } from './_vworld.js';
import { ApiError, cleanString, isRecord, serviceCoordinate, errorResponse, methodNotAllowed, Operation, queryParams } from './_http.js';

const UPSTREAM = 'https://api.vworld.kr/req/address';

interface Hit {
  lat: number;
  lng: number;
  label: string;
}

async function lookup(
  address: string,
  type: 'ROAD' | 'PARCEL',
  key: string,
  domain: string,
  operation: Operation,
): Promise<Hit | null> {
  const url = new URL(UPSTREAM);
  const set = (k: string, v: string) => url.searchParams.set(k, v);
  set('service', 'address');
  set('request', 'getCoord');
  set('version', '2.0');
  set('crs', 'EPSG:4326');
  set('format', 'json');
  set('simple', 'false');
  set('refine', 'true');
  set('type', type);
  set('address', address);

  const body = await vworldJson(await fetchVworld(url, key, domain, operation));
  const response = vworldResponse(body);
  if (response.status === 'NOT_FOUND') return null;
  if (!isRecord(response.result) || !isRecord(response.result.point)) throw new ApiError('UPSTREAM_INVALID');
  const point = response.result.point;
  const validNumber = (value: unknown): value is number | string =>
    typeof value === 'number' || typeof value === 'string' && value.trim().length > 0 && value.length <= 30;
  if (!validNumber(point.x) || !validNumber(point.y)) throw new ApiError('UPSTREAM_INVALID');
  const lng = Number(point.x), lat = Number(point.y);
  if (!serviceCoordinate(lat, lng)) throw new ApiError('UPSTREAM_INVALID');
  let label = address;
  if (response.refined !== undefined && response.refined !== null) {
    if (!isRecord(response.refined)) throw new ApiError('UPSTREAM_INVALID');
    const text = response.refined.text;
    if (text !== undefined && text !== null) {
      if (!cleanString(text, 500) || !text.trim()) throw new ApiError('UPSTREAM_INVALID');
      label = text.trim();
    }
  }
  return { lat, lng, label };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const operation = new Operation(req.signal, UPSTREAM_TIMEOUT_MS);
  try {
    const q = (queryParams(req).get('q') ?? '').trim();
    if (!q || q.length > 200) throw new ApiError('BAD_REQUEST', 400);
    const { key, domain } = vworldEnv();
    const hit = await lookup(q, 'ROAD', key, domain, operation) ?? await lookup(q, 'PARCEL', key, domain, operation);
    if (!hit) throw new ApiError('NOT_FOUND', 404);
    return jsonResponse({ ...hit, fetchedAt: new Date().toISOString(), version: LOOKUP_VERSION }, 'public, max-age=3600');
  } catch (error) { return errorResponse(error); }
  finally { operation.dispose(); }
}
