// Pinned to Seoul like api/wms.ts: VWorld rejects Vercel's non-Korean edge egress.
export const config = { runtime: 'edge', regions: ['icn1'] };

// Point lookup of the 법정 규제구역 layers VWorld publishes but that cannot be bundled (login-only or 변경금지
// downloads): 개발제한구역, 상수원보호구역, 국가유산 지정/보호구역 (queried twice — on the point and with a buffer
// for 역사문화환경 보존지역), 농업진흥지역, 도시자연공원구역. The response is raw hits; the scoring engine turns them
// into a verdict through constants.scoring.restriction, so this route carries no scoring logic of its own.

import { fetchVworld, jsonResponse, textResponse, vworldEnv, vworldJson } from './_vworld.js';

const UPSTREAM = 'https://api.vworld.kr/req/data';
const DEFAULT_BUFFER_M = 500;
const MAX_BUFFER_M = 1000;

interface Query {
  id: string;
  layer: string;
  bufferM: number;
}

interface Hit {
  layer: string;
  name: string | null;
  buffered: boolean;
}

function buildQueries(bufferM: number): Query[] {
  const queries: Query[] = [
    { id: 'LT_C_UD801', layer: 'LT_C_UD801', bufferM: 0 }, // 개발제한구역
    { id: 'LT_C_UM710', layer: 'LT_C_UM710', bufferM: 0 }, // 상수원보호구역
    { id: 'LT_C_UO301', layer: 'LT_C_UO301', bufferM: 0 }, // 국가유산 지정/보호구역
    { id: 'LT_C_AGRIXUE101', layer: 'LT_C_AGRIXUE101', bufferM: 0 }, // 농업진흥지역 (진흥/보호구역)
    { id: 'LT_C_UQ162', layer: 'LT_C_UQ162', bufferM: 0 }, // 도시자연공원구역
  ];
  if (bufferM > 0) queries.push({ id: `LT_C_UO301@${bufferM}`, layer: 'LT_C_UO301', bufferM });
  return queries;
}

async function queryLayer(
  q: Query,
  lat: number,
  lng: number,
  key: string,
  domain: string,
): Promise<Hit[]> {
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
  set('data', q.layer);
  set('geomFilter', `POINT(${lng} ${lat})`);
  if (q.bufferM > 0) set('buffer', String(q.bufferM));

  const body = await vworldJson(await fetchVworld(url, key, domain));
  const response = body.response as
    | {
        status?: string;
        result?: { featureCollection?: { features?: { properties?: Record<string, unknown> }[] } };
      }
    | undefined;
  const status = response?.status;
  if (status === 'NOT_FOUND') return [];
  if (status !== 'OK') throw new Error(`${q.id}: status ${String(status)}`);

  const features = response?.result?.featureCollection?.features ?? [];
  const seen = new Set<string>();
  const hits: Hit[] = [];
  for (const f of features) {
    const props = f.properties ?? {};
    const raw = props.uname;
    // uname is the documented zone name; fall back to any "…구역/지역/공원" attribute, else leave it to the engine.
    const name =
      (typeof raw === 'string' && raw) ||
      Object.values(props).find(
        (v): v is string => typeof v === 'string' && /(구역|지역|공원)$/.test(v),
      ) ||
      null;
    const dedupe = `${q.layer}|${q.bufferM > 0}|${name ?? ''}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    hits.push({ layer: q.layer, name, buffered: q.bufferM > 0 });
  }
  return hits;
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
  const bufferRaw = q.get('buffer');
  const bufferM = bufferRaw === null ? DEFAULT_BUFFER_M : Number(bufferRaw);
  if (!Number.isInteger(bufferM) || bufferM < 0 || bufferM > MAX_BUFFER_M) {
    return textResponse(`buffer must be an integer 0~${MAX_BUFFER_M}`, 400);
  }
  // Round server-side too, so the CDN key matches what the client already rounded (~11m).
  const rlat = Math.round(lat * 1e4) / 1e4;
  const rlng = Math.round(lng * 1e4) / 1e4;

  const queries = buildQueries(bufferM);
  const settled = await Promise.all(
    queries.map((query) =>
      queryLayer(query, rlat, rlng, key, domain).then(
        (hits) => ({ id: query.id, hits, error: null as string | null }),
        (e: unknown) => ({ id: query.id, hits: [] as Hit[], error: e instanceof Error ? e.message : String(e) }),
      ),
    ),
  );

  const hits = settled.flatMap((s) => s.hits);
  const failed = settled.filter((s) => s.error !== null).map((s) => s.id);
  // Every layer failing is a lookup failure (502, never cached); a partial answer is still useful — the engine
  // reports it as "일부 레이어 미확인" — but must not be frozen in the CDN.
  if (failed.length === queries.length) {
    const detail = settled.map((s) => s.error).filter(Boolean).join(' / ');
    return textResponse(`vworld restrictions failed: ${detail}`, 502);
  }
  const complete = failed.length === 0;
  return jsonResponse(
    { hits, queried: queries.map((query) => query.id), failed, complete },
    // VWorld's terms require live use, so this is a short CDN cache, not a stored copy.
    complete ? 'public, max-age=600, s-maxage=3600' : 'no-store',
  );
}
