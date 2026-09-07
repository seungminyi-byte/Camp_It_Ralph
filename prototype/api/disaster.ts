// Pinned to Seoul like the other VWorld routes: calls from overseas Vercel regions can fail.
export const config = { runtime: 'edge', regions: ['icn1'] };

// Point lookup only. The engine applies the configured deduction to validated results.

import { fetchVworld, jsonResponse, textResponse, vworldEnv, vworldJson } from './_vworld.js';

const UPSTREAM = 'https://api.vworld.kr/req/data';
const LAYER = 'LT_C_UP201';

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
  const response = body.response as
    | {
        status?: string;
        result?: { featureCollection?: { features?: { properties?: Record<string, unknown> }[] } };
      }
    | undefined;

  if (response?.status === 'NOT_FOUND') return [];
  if (response?.status !== 'OK') {
    throw new Error(`${LAYER}: status ${String(response?.status)}`);
  }

  const features = response.result?.featureCollection?.features;
  if (!Array.isArray(features)) throw new Error(`${LAYER}: malformed feature collection`);
  return features.map((feature) => {
    if (!feature || typeof feature !== 'object' || !feature.properties ||
      typeof feature.properties !== 'object' || Array.isArray(feature.properties)) {
      throw new Error(`${LAYER}: malformed feature`);
    }
    const attributes = scalarAttributes(feature.properties ?? {});
    return { name: riskZoneName(attributes), attributes };
  });
}

async function queryDisasterRisk(
  lat: number,
  lng: number,
  key: string,
  domain: string,
): Promise<DisasterRiskHit[]> {
  const url = new URL(UPSTREAM);
  const set = (name: string, value: string) => url.searchParams.set(name, value);
  set('service', 'data');
  set('version', '2.0');
  set('request', 'GetFeature');
  set('format', 'json');
  set('errorFormat', 'json');
  set('size', '10');
  set('page', '1');
  set('geometry', 'false');
  set('attribute', 'true');
  set('crs', 'EPSG:4326');
  set('data', LAYER);
  set('geomFilter', `POINT(${lng} ${lat})`);

  return parseDisasterRiskHits(await vworldJson(await fetchVworld(url, key, domain)));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return textResponse('method not allowed', 405);

  const { key, domain } = vworldEnv();
  if (!key) return textResponse('no VWORLD_API_KEY configured on server', 503);

  const query = new URL(req.url).searchParams;
  const lat = Number(query.get('lat'));
  const lng = Number(query.get('lng'));
  if (!(lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132)) {
    return textResponse('lat/lng outside Korea', 400);
  }

  const roundedLat = Math.round(lat * 1e5) / 1e5;
  const roundedLng = Math.round(lng * 1e5) / 1e5;

  try {
    const hits = await queryDisasterRisk(roundedLat, roundedLng, key, domain);
    return jsonResponse(
      {
        found: hits.length > 0,
        layer: LAYER,
        coordinate: { lat: roundedLat, lng: roundedLng },
        hits,
      },
      'public, max-age=600, s-maxage=3600',
    );
  } catch {
    // Do not reflect upstream bodies, which can contain the server's credential.
    return textResponse('vworld disaster-risk lookup failed', 502);
  }
}
