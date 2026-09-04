// Pinned to Seoul: VWorld rejects Vercel's global edge egress (HAProxy 502 / connection reset from
// e.g. hnd1), while requests from the icn1 region succeed.
export const config = { runtime: 'edge', regions: ['icn1'] };

// Proxies VWorld WMS GetMap requests for the 용도지역 (zoning) overlay so the server-side
// VWORLD_API_KEY never reaches the browser. VWorld requires the registered service URL in the
// `domain` parameter for non-browser calls (VWORLD_DOMAIN overrides the production URL).
// Only whitelisted layers, PNG output and tile-sized images are forwarded; tiles are cached at
// the edge for a day to stay well inside the 40,000 calls/day quota.

import { fetchVworld, registeredDomain, UPSTREAM_TIMEOUT_MS } from './_vworld';

declare const process: { env: Record<string, string | undefined> };

const UPSTREAM = 'https://api.vworld.kr/req/wms';
const ALLOWED_LAYERS = new Set(['lt_c_uq111', 'lt_c_uq112', 'lt_c_uq113', 'lt_c_uq114']);
const ALLOWED_CRS = new Set(['EPSG:3857', 'EPSG:900913', 'EPSG:4326']);
const MAX_SIZE = 512;

function param(q: URLSearchParams, name: string): string {
  return q.get(name) ?? q.get(name.toUpperCase()) ?? q.get(name.toLowerCase()) ?? '';
}

function validLayerList(value: string): string | null {
  const parts = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!parts.length || parts.length > 4 || !parts.every((p) => ALLOWED_LAYERS.has(p))) return null;
  return parts.join(',');
}

function validSize(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= MAX_SIZE ? n : null;
}

function validBbox(value: string): string | null {
  const nums = value.split(',').map(Number);
  return nums.length === 4 && nums.every(Number.isFinite) ? nums.join(',') : null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });
  const env = process.env;
  const key = env.VWORLD_API_KEY;
  if (!key) return new Response('no VWORLD_API_KEY configured on server', { status: 503 });

  const q = new URL(req.url).searchParams;
  if (param(q, 'request').toLowerCase() !== 'getmap') {
    return new Response('only GetMap is supported', { status: 400 });
  }
  const layers = validLayerList(param(q, 'layers'));
  const styles = param(q, 'styles') ? validLayerList(param(q, 'styles')) : layers;
  const crs = (param(q, 'crs') || param(q, 'srs') || 'EPSG:3857').toUpperCase();
  const bbox = validBbox(param(q, 'bbox'));
  const width = validSize(param(q, 'width') || '256');
  const height = validSize(param(q, 'height') || '256');
  if (!layers || !styles || !bbox || !width || !height || !ALLOWED_CRS.has(crs)) {
    return new Response('bad wms params', { status: 400 });
  }
  const version = param(q, 'version') === '1.1.1' ? '1.1.1' : '1.3.0';
  const transparent = param(q, 'transparent').toLowerCase() === 'false' ? 'false' : 'true';

  const domain = registeredDomain(env);
  const upstream = new URL(UPSTREAM);
  const set = (k: string, v: string) => upstream.searchParams.set(k, v);
  set('service', 'WMS');
  set('request', 'GetMap');
  set('version', version);
  set('layers', layers);
  set('styles', styles);
  set(version === '1.3.0' ? 'crs' : 'srs', crs);
  set('bbox', bbox);
  set('width', String(width));
  set('height', String(height));
  set('format', 'image/png');
  set('transparent', transparent);
  set('bgcolor', '0xFFFFFF');
  set('exceptions', 'text/xml');

  // VWorld occasionally stalls; fail fast so Leaflet can retry on the next pan.
  let res: Response;
  try {
    res = await fetchVworld(upstream, key, domain, UPSTREAM_TIMEOUT_MS);
  } catch (e) {
    return new Response(`vworld unreachable: ${e instanceof Error ? e.message : String(e)}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.startsWith('image/')) {
    // VWorld reports key/domain problems as XML or HTML with status 200; surface them as 502.
    const detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 1500);
    return new Response(`vworld ${res.status} ${contentType}: ${detail}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return new Response(res.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
