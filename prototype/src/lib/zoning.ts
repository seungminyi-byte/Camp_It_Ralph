import type { LandUse, ZoningLookup } from '../types';

const LAND_USES: LandUse[] = [
  'industrial',
  'semiIndustrial',
  'commercial',
  'green',
  'residential',
  'unknown',
];

// Only successful lookups are cached: a failure must stay retryable, and it is not evidence of
// open water the way a genuine "no polygon here" answer is.
const cache = new Map<string, ZoningLookup>();
const CACHE_LIMIT = 500;

/** ~11m — matches the rounding the Edge route applies, so the CDN sees the same URL. */
export function zoningCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

export function peekZoning(lat: number, lng: number): ZoningLookup | undefined {
  return cache.get(zoningCacheKey(lat, lng));
}

export async function lookupZoning(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<ZoningLookup> {
  const key = zoningCacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit) return hit;

  const res = await fetch(`/api/zoning?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`, { signal });
  if (!res.ok) throw new Error(`zoning ${res.status}`);
  const raw = (await res.json()) as ZoningLookup;
  const result: ZoningLookup = {
    ...raw,
    landUse: LAND_USES.includes(raw.landUse) ? raw.landUse : 'unknown',
    all: raw.all ?? [],
  };

  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, result);
  return result;
}
