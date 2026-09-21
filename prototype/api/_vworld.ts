// Files beginning with '_' are helpers, not deployed API routes.
import { ApiError, boundedBytes, cancelBody, cleanString, isRecord, Operation } from './_http.js';

declare const process: { env: Record<string, string | undefined> };
export const UPSTREAM_TIMEOUT_MS = 12_000;
export const JSON_MAX_BYTES = 2 * 1024 * 1024;
export const LOOKUP_VERSION = 'vworld-v2-20260921';

export function registeredDomain(env: Record<string, string | undefined>): string {
  const value = env.VWORLD_DOMAIN || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost');
  try {
    const url = new URL(value);
    if (!cleanString(value, 2048) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return value;
  } catch { throw new ApiError('SERVER_UNAVAILABLE', 503); }
}

export function vworldEnv(): { key: string; domain: string } {
  const env = process.env;
  const key = env.VWORLD_API_KEY;
  if (!key || !cleanString(key, 512) || /\s/.test(key)) throw new ApiError('SERVER_UNAVAILABLE', 503);
  return { key, domain: registeredDomain(env) };
}

/** Fetch and consume the bounded body before releasing the caller's operation budget. */
export async function fetchVworld(url: URL, key: string, domain: string, operation: Operation): Promise<Response> {
  if (url.origin !== 'https://api.vworld.kr' || !['/req/data', '/req/address', '/req/wms'].includes(url.pathname)) throw new ApiError('UPSTREAM_INVALID');
  url.searchParams.set('key', key);
  url.searchParams.set('domain', domain);
  operation.check();
  const pending = fetch(url, { headers: { Referer: domain }, signal: operation.signal, redirect: 'error' });
  // Also discard late headers from non-cooperative transports after cancellation.
  void pending.then((res) => { if (operation.signal.aborted) cancelBody(res.body); }, () => {});
  const res = await operation.wait(pending);
  const mediaType = res.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!res.ok || (url.pathname === '/req/wms' ? mediaType !== 'image/png' : mediaType !== 'application/json')) {
    cancelBody(res.body);
    throw new ApiError(res.ok ? 'UPSTREAM_INVALID' : 'UPSTREAM_UNAVAILABLE');
  }
  const bytes = await boundedBytes(res, operation, JSON_MAX_BYTES);
  return new Response(bytes, { headers: { 'Content-Type': mediaType! } });
}

export function jsonResponse(body: unknown, cacheControl: string): Response {
  return new Response(JSON.stringify(body), { headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  } });
}

export async function vworldJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await res.arrayBuffer()));
    if (!isRecord(value)) throw new Error();
    return value;
  } catch { throw new ApiError('UPSTREAM_INVALID'); }
}

export function vworldResponse(body: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(body.response)) throw new ApiError('UPSTREAM_INVALID');
  const response = body.response;
  if (response.status !== 'OK' && response.status !== 'NOT_FOUND') throw new ApiError(response.status === 'ERROR' ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_INVALID');
  return response;
}

export interface VworldFeature extends Record<string, unknown> { properties: Record<string, unknown> }
export function vworldFeatures(body: Record<string, unknown>): VworldFeature[] {
  const response = vworldResponse(body);
  if (response.status === 'NOT_FOUND') return [];
  const result = response.result;
  if (!isRecord(result) || !isRecord(result.featureCollection)) throw new ApiError('UPSTREAM_INVALID');
  const features = result.featureCollection.features;
  if (!Array.isArray(features) || features.length > 1000) throw new ApiError('UPSTREAM_INVALID');
  return features.map((feature): VworldFeature => {
    if (!isRecord(feature) || !isRecord(feature.properties)) throw new ApiError('UPSTREAM_INVALID');
    const entries = Object.entries(feature.properties);
    if (entries.length > 128 || entries.some(([key, value]) => !cleanString(key, 128) ||
      (typeof value === 'string' && !cleanString(value, 1000)) ||
      (typeof value === 'number' && !Number.isFinite(value)))) throw new ApiError('UPSTREAM_INVALID');
    for (const name of ['uname', 'sido_name', 'sigg_name', 'dstrct_nm', 'zone_nm', 'district_nm', 'name']) {
      const value = feature.properties[name];
      if (value !== undefined && value !== null && !cleanString(value, 1000)) throw new ApiError('UPSTREAM_INVALID');
    }
    return { ...feature, properties: feature.properties };
  });
}

/** First-page lookups cannot prove completeness at the requested size limit. */
export function vworldPageComplete(body: Record<string, unknown>, count: number, pageSize: number): boolean {
  const response = vworldResponse(body);
  if (response.status === 'NOT_FOUND') return true;
  if (count >= pageSize) return false;
  const integer = (value: unknown): number | null => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  // VWorld's public 2D Data 2.0 response table defines record and page as sibling objects.
  // A malformed count does not discard observed features; it withholds completeness.
  if (response.record !== undefined) {
    if (!isRecord(response.record) || integer(response.record.total) !== count || integer(response.record.current) !== count) return false;
  }
  if (response.page !== undefined) {
    if (!isRecord(response.page)) return false;
    const total = integer(response.page.total), current = integer(response.page.current), size = integer(response.page.size);
    if (total === null || total > 1 || current !== 1 || size === null || size < count || size > pageSize) return false;
  }
  return true;
}
