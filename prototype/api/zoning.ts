// Pinned to Seoul like api/wms.ts: VWorld rejects Vercel's non-Korean edge egress.
export const config = { runtime: 'edge', regions: ['icn1'] };

// Point lookup of 용도지역 (land-use zoning) through the VWorld 2D Data API, so the app can fill
// the dropdown automatically instead of asking the user to read it off the WMS overlay.
// A hit also tells the scoring engine that a water-looking cell is reclaimed land, not open sea.

import { fetchVworld, jsonResponse, vworldEnv, vworldJson, vworldFeatures, vworldPageComplete, LOOKUP_VERSION, UPSTREAM_TIMEOUT_MS } from './_vworld.js';
import { ApiError, coordinateQuery, errorResponse, methodNotAllowed, Operation, queryParams } from './_http.js';

const UPSTREAM = 'https://api.vworld.kr/req/data';
const PAGE_SIZE = 5;

// 도시지역 / 관리지역 / 농림지역 / 자연환경보전지역
const LAYERS = ['LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114'] as const;
const LAYER_FALLBACK_NAME: Record<string, string> = {
  LT_C_UQ111: '도시지역',
  LT_C_UQ112: '관리지역',
  LT_C_UQ113: '농림지역',
  LT_C_UQ114: '자연환경보전지역',
};

import { landUseFromName } from '../shared/zoning.js';

interface Found {
  layer: string;
  name: string;
  sido?: string;
  sigungu?: string;
}

async function queryLayer(
  layer: string,
  lat: number,
  lng: number,
  key: string,
  domain: string,
  operation: Operation,
): Promise<{ hits: Found[]; complete: boolean }> {
  const url = new URL(UPSTREAM);
  const set = (k: string, v: string) => url.searchParams.set(k, v);
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
  set('data', layer);
  set('geomFilter', `POINT(${lng} ${lat})`);

  const body = await vworldJson(await fetchVworld(url, key, domain, operation));
  const features = vworldFeatures(body);
  const hits = features.map((f) => {
    const props = f.properties ?? {};
    const raw = props.uname;
    // uname is the documented 용도지역명; fall back to any "…지역" attribute, then the layer name.
    const name =
      (typeof raw === 'string' && raw) ||
      Object.values(props).find((v): v is string => typeof v === 'string' && v.endsWith('지역')) ||
      LAYER_FALLBACK_NAME[layer];
    return {
      layer,
      name,
      sido: typeof props.sido_name === 'string' ? props.sido_name : undefined,
      sigungu: typeof props.sigg_name === 'string' ? props.sigg_name : undefined,
    };
  });
  return { hits, complete: vworldPageComplete(body, features.length, PAGE_SIZE) };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const operation = new Operation(req.signal, UPSTREAM_TIMEOUT_MS);
  try {
    const coordinate = coordinateQuery(queryParams(req), 4);
    const { key, domain } = vworldEnv();
    const settled = await Promise.all(LAYERS.map(async (layer) => {
      try {
        const result = await queryLayer(layer, coordinate.lat, coordinate.lng, key, domain, operation);
        return { layer, hits: result.hits, error: result.complete ? null : new ApiError('UPSTREAM_INCOMPLETE') };
      }
      catch (error) { return { layer, hits: [] as Found[], error }; }
    }));
    const hits = settled.flatMap((s) => s.hits);
    const failed = settled.filter((s) => s.error !== null).map((s) => s.layer);
    if (failed.length === LAYERS.length && hits.length === 0) throw settled[0].error;
    const complete = failed.length === 0;
    const first = hits[0];
    return jsonResponse({
      found: hits.length > 0,
      layer: first?.layer ?? null, name: first?.name ?? null,
      landUse: first ? landUseFromName(first.layer, first.name) : 'unknown',
      sido: first?.sido, sigungu: first?.sigungu,
      all: hits.map((h) => ({ layer: h.layer, name: h.name })),
      queried: [...LAYERS], failed, complete,
      coordinate, fetchedAt: new Date().toISOString(), version: LOOKUP_VERSION,
    }, complete ? 'public, max-age=600, s-maxage=3600' : 'no-store');
  } catch (error) { return errorResponse(error); }
  finally { operation.dispose(); }
}
