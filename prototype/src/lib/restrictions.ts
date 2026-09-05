import type { RestrictionLookup } from '../types';

// Only complete answers are cached: a partial one (some VWorld layers failed) must stay retryable, and a
// failure is not evidence that the point is clear of 개발제한구역 or a 보호구역.
const cache = new Map<string, RestrictionLookup>();
const CACHE_LIMIT = 500;

/** ~11m plus the buffer, matching the rounding the Edge route applies so the CDN sees the same URL. */
export function restrictionCacheKey(lat: number, lng: number, bufferM: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}|${bufferM}`;
}

export function peekRestrictions(lat: number, lng: number, bufferM: number): RestrictionLookup | undefined {
  return cache.get(restrictionCacheKey(lat, lng, bufferM));
}

function isHit(h: unknown): h is RestrictionLookup['hits'][number] {
  return (
    typeof h === 'object' &&
    h !== null &&
    typeof (h as { layer?: unknown }).layer === 'string' &&
    typeof (h as { buffered?: unknown }).buffered === 'boolean'
  );
}

/** GET /api/restrictions for the point; throws when the route is unreachable or every layer failed. */
export async function fetchRestrictions(
  lat: number,
  lng: number,
  bufferM: number,
  signal?: AbortSignal,
): Promise<RestrictionLookup> {
  const key = restrictionCacheKey(lat, lng, bufferM);
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await fetch(
    `/api/restrictions?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&buffer=${bufferM}`,
    { signal },
  );
  if (!res.ok) throw new Error(`restrictions ${res.status}`);
  const raw = (await res.json()) as Partial<RestrictionLookup>;
  const failed = Array.isArray(raw.failed) ? raw.failed.filter((f): f is string => typeof f === 'string') : [];
  const result: RestrictionLookup = {
    hits: Array.isArray(raw.hits)
      ? raw.hits.filter(isHit).map((h) => ({ layer: h.layer, name: typeof h.name === 'string' ? h.name : null, buffered: h.buffered }))
      : [],
    queried: Array.isArray(raw.queried) ? raw.queried.filter((q): q is string => typeof q === 'string') : [],
    failed,
    complete: failed.length === 0,
  };

  if (result.complete) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, result);
  }
  return result;
}
