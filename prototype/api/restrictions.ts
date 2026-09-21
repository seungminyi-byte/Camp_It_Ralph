// Pinned to Seoul like api/wms.ts: VWorld rejects Vercel's non-Korean edge egress.
export const config = { runtime: 'edge', regions: ['icn1'] };

// Point lookup of the 법정 규제구역 layers VWorld publishes but that cannot be bundled (login-only or 변경금지
// downloads): 개발제한구역, 상수원보호구역, 국가유산 지정/보호구역 (queried twice — on the point and with a buffer
// for nearby observations, not a statutory preservation boundary), 농업진흥지역, 도시자연공원구역. The response is raw hits; the scoring engine turns them
// into a verdict through constants.scoring.restriction, so this route carries no scoring logic of its own.

import { fetchVworld, jsonResponse, vworldEnv, vworldJson, vworldFeatures, vworldPageComplete, LOOKUP_VERSION, UPSTREAM_TIMEOUT_MS } from './_vworld.js';
import { ApiError, coordinateQuery, errorResponse, methodNotAllowed, Operation, queryParams } from './_http.js';

const UPSTREAM = 'https://api.vworld.kr/req/data';
const PAGE_SIZE = 5;
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
  operation: Operation,
): Promise<{ hits: Hit[]; complete: boolean }> {
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
  set('data', q.layer);
  set('geomFilter', `POINT(${lng} ${lat})`);
  if (q.bufferM > 0) set('buffer', String(q.bufferM));

  const body = await vworldJson(await fetchVworld(url, key, domain, operation));
  const features = vworldFeatures(body);
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
  return { hits, complete: vworldPageComplete(body, features.length, PAGE_SIZE) };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const operation = new Operation(req.signal, UPSTREAM_TIMEOUT_MS);
  try {
    const query = queryParams(req);
    const coordinate = coordinateQuery(query, 4);
    const bufferRaw = query.get('buffer');
    const bufferM = bufferRaw === null ? DEFAULT_BUFFER_M : Number(bufferRaw);
    if (bufferRaw !== null && !bufferRaw.trim() || !Number.isInteger(bufferM) || bufferM < 0 || bufferM > MAX_BUFFER_M) throw new ApiError('BAD_REQUEST', 400);
    const { key, domain } = vworldEnv();
    const queries = buildQueries(bufferM);
    const settled = await Promise.all(queries.map(async (q) => {
      try {
        const result = await queryLayer(q, coordinate.lat, coordinate.lng, key, domain, operation);
        return { id: q.id, hits: result.hits, error: result.complete ? null : new ApiError('UPSTREAM_INCOMPLETE') };
      }
      catch (error) { return { id: q.id, hits: [] as Hit[], error }; }
    }));
    const hits = settled.flatMap((s) => s.hits);
    const failed = settled.filter((s) => s.error !== null).map((s) => s.id);
    if (failed.length === queries.length && hits.length === 0) throw settled[0].error;
    const complete = failed.length === 0;
    return jsonResponse({
      hits, queried: queries.map((q) => q.id), failed, complete,
      coordinate, bufferM, fetchedAt: new Date().toISOString(), version: LOOKUP_VERSION,
    }, complete ? 'public, max-age=600, s-maxage=3600' : 'no-store');
  } catch (error) { return errorResponse(error); }
  finally { operation.dispose(); }
}
