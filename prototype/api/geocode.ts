export const config = { runtime: 'edge', regions: ['icn1'] };

// Address -> coordinate through the VWorld Geocoder, for the search box in the site panel.
// Offline 읍면동 search is handled in the bundle; this route only covers 도로명/지번 addresses.

import { fetchVworld, jsonResponse, textResponse, vworldEnv, vworldJson } from './_vworld';

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

  const body = await vworldJson(await fetchVworld(url, key, domain));
  const response = body.response as
    | {
        status?: string;
        result?: { point?: { x?: string | number; y?: string | number } };
        refined?: { text?: string };
      }
    | undefined;
  if (response?.status !== 'OK') return null;

  // VWorld returns the point as strings; x is longitude and y is latitude.
  const lng = Number(response.result?.point?.x);
  const lat = Number(response.result?.point?.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: response.refined?.text || address };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return textResponse('method not allowed', 405);

  const { key, domain } = vworldEnv();
  if (!key) return textResponse('no VWORLD_API_KEY configured on server', 503);

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!q || q.length > 200) return textResponse('bad query', 400);

  let hit: Hit | null;
  try {
    hit = (await lookup(q, 'ROAD', key, domain)) ?? (await lookup(q, 'PARCEL', key, domain));
  } catch (e) {
    return textResponse(`vworld geocode failed: ${e instanceof Error ? e.message : String(e)}`, 502);
  }
  if (!hit) return textResponse('address not found', 404);

  return jsonResponse(hit, 'public, max-age=3600');
}
