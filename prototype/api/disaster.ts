// Pinned to Seoul like the other VWorld routes: calls from overseas Vercel regions can fail.
export const config = { runtime: 'edge', regions: ['icn1'] };

// Point lookup only. The engine applies the configured deduction to validated results.

import { fetchVworld, jsonResponse, vworldEnv, vworldJson, vworldFeatures, vworldPageComplete, LOOKUP_VERSION, UPSTREAM_TIMEOUT_MS } from './_vworld.js';
import { coordinateQuery, errorResponse, methodNotAllowed, Operation, queryParams } from './_http.js';

const UPSTREAM = 'https://api.vworld.kr/req/data';
const LAYER = 'LT_C_UP201';
const PAGE_SIZE = 10;

type Scalar = string | number | boolean | null;

export interface DisasterRiskHit {
  name: string | null;
  attributes: Record<string, Scalar>;
}

function scalarAttributes(properties: Record<string, unknown>): Record<string, Scalar> {
  return Object.fromEntries(
    Object.entries(properties)
      .filter((entry): entry is [string, Scalar] => {
        const value = entry[1];
        return value === null || ['string', 'number', 'boolean'].includes(typeof value);
      })
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 500) : value]),
  );
}

function riskZoneName(attributes: Record<string, Scalar>): string | null {
  const preferredKeys = ['uname', 'dstrct_nm', 'zone_nm', 'district_nm', 'name'];
  for (const key of preferredKeys) {
    const value = attributes[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const fallback = Object.values(attributes).find(
    (value): value is string => typeof value === 'string' && /(?:지구|지역)$/.test(value.trim()),
  );
  return fallback?.trim() ?? null;
}

export function parseDisasterRiskHits(body: Record<string, unknown>): DisasterRiskHit[] {
  return vworldFeatures(body).map((feature) => {
    const attributes = scalarAttributes(feature.properties ?? {});
    return { name: riskZoneName(attributes), attributes };
  });
}

async function queryDisasterRisk(
  lat: number,
  lng: number,
  key: string,
  domain: string,
  operation: Operation,
): Promise<{ hits: DisasterRiskHit[]; complete: boolean }> {
  const url = new URL(UPSTREAM);
  const set = (name: string, value: string) => url.searchParams.set(name, value);
  set('service', 'data');
  set('version', '2.0');
  set('request', 'GetFeature');
  set('format', 'json');
  set('errorFormat', 'json');
  set('size', String(PAGE_SIZE));
  set('page', '1');
  set('geometry', 'false');
  set('attribute', 'true');
  set('crs', 'EPSG:4326');
  set('data', LAYER);
  set('geomFilter', `POINT(${lng} ${lat})`);

  const body = await vworldJson(await fetchVworld(url, key, domain, operation));
  const hits = parseDisasterRiskHits(body);
  return { hits, complete: vworldPageComplete(body, hits.length, PAGE_SIZE) };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const operation = new Operation(req.signal, UPSTREAM_TIMEOUT_MS);
  try {
    const coordinate = coordinateQuery(queryParams(req), 5);
    const { key, domain } = vworldEnv();
    const { hits, complete } = await queryDisasterRisk(coordinate.lat, coordinate.lng, key, domain, operation);
    return jsonResponse({
      found: hits.length > 0, layer: LAYER, coordinate, hits,
      queried: [LAYER], failed: complete ? [] : [LAYER], complete,
      fetchedAt: new Date().toISOString(), version: LOOKUP_VERSION,
    }, complete ? 'public, max-age=0, s-maxage=300' : 'no-store');
  } catch (error) { return errorResponse(error); }
  finally { operation.dispose(); }
}
