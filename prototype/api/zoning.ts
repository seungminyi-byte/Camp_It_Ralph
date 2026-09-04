// Pinned to Seoul like api/wms.ts: VWorld rejects Vercel's non-Korean edge egress.
export const config = { runtime: 'edge', regions: ['icn1'] };

// Point lookup of 용도지역 (land-use zoning) through the VWorld 2D Data API, so the app can fill
// the dropdown automatically instead of asking the user to read it off the WMS overlay.
// A hit also tells the scoring engine that a water-looking cell is reclaimed land, not open sea.

import { fetchVworld, jsonResponse, textResponse, vworldEnv, vworldJson } from './_vworld';

const UPSTREAM = 'https://api.vworld.kr/req/data';

// 도시지역 / 관리지역 / 농림지역 / 자연환경보전지역
const LAYERS = ['LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114'] as const;
const LAYER_FALLBACK_NAME: Record<string, string> = {
  LT_C_UQ111: '도시지역',
  LT_C_UQ112: '관리지역',
  LT_C_UQ113: '농림지역',
  LT_C_UQ114: '자연환경보전지역',
};

type LandUse = 'industrial' | 'semiIndustrial' | 'commercial' | 'green' | 'residential' | 'unknown';

/** 준공업 must be tested before 공업; everything outside 도시지역 scores as green. */
function landUseFromName(layer: string, name: string): LandUse {
  if (layer !== 'LT_C_UQ111') return 'green';
  if (name.includes('준공업')) return 'semiIndustrial';
  if (name.includes('공업')) return 'industrial';
  if (name.includes('상업')) return 'commercial';
  if (name.includes('주거')) return 'residential';
  if (name.includes('녹지')) return 'green';
  return 'unknown';
}

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
): Promise<Found[]> {
  const url = new URL(UPSTREAM);
  const set = (k: string, v: string) => url.searchParams.set(k, v);
  set('service', 'data');
  set('version', '2.0');
  set('request', 'GetFeature');
  set('format', 'json');
  set('errorFormat', 'json');
  set('size', '5');
  set('page', '1');
  set('geometry', 'false');
  set('attribute', 'true');
  set('crs', 'EPSG:4326');
  set('data', layer);
  set('geomFilter', `POINT(${lng} ${lat})`);

  const body = await vworldJson(await fetchVworld(url, key, domain));
  const response = body.response as
    | {
        status?: string;
        result?: { featureCollection?: { features?: { properties?: Record<string, unknown> }[] } };
      }
    | undefined;
  const status = response?.status;
  if (status === 'NOT_FOUND') return [];
  if (status !== 'OK') throw new Error(`${layer}: status ${String(status)}`);

  const features = response?.result?.featureCollection?.features ?? [];
  return features.map((f) => {
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
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return textResponse('method not allowed', 405);

  const { key, domain } = vworldEnv();
  if (!key) return textResponse('no VWORLD_API_KEY configured on server', 503);

  const q = new URL(req.url).searchParams;
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  if (!(lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132)) {
    return textResponse('lat/lng outside Korea', 400);
  }
  // Round server-side too, so the CDN key matches what the client already rounded (~11m).
  const rlat = Math.round(lat * 1e4) / 1e4;
  const rlng = Math.round(lng * 1e4) / 1e4;

  const settled = await Promise.all(
    LAYERS.map((layer) =>
      queryLayer(layer, rlat, rlng, key, domain).then(
        (hits) => ({ hits, error: null as string | null }),
        (e: unknown) => ({ hits: [] as Found[], error: e instanceof Error ? e.message : String(e) }),
      ),
    ),
  );

  const hits = settled.flatMap((s) => s.hits);
  const errors = settled.map((s) => s.error).filter((e): e is string => e !== null);

  // "Nothing here" and "the lookup failed" mean opposite things to the caller: only the former is
  // evidence of open water, so a failure must not be cached or reported as found:false.
  if (hits.length === 0 && errors.length > 0) {
    return textResponse(`vworld zoning failed: ${errors.join(' / ')}`, 502);
  }

  const first = hits[0];
  return jsonResponse(
    {
      found: hits.length > 0,
      layer: first?.layer ?? null,
      name: first?.name ?? null,
      landUse: first ? landUseFromName(first.layer, first.name) : 'unknown',
      sido: first?.sido,
      sigungu: first?.sigungu,
      all: hits.map((h) => ({ layer: h.layer, name: h.name })),
    },
    // VWorld's terms require live use, so this is a short CDN cache, not a stored copy.
    'public, max-age=600, s-maxage=3600',
  );
}
