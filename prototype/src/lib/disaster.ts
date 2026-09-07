import type { DisasterLookup, DisasterRiskHit } from '../types';

const cache = new Map<string, DisasterLookup>();
const CACHE_LIMIT = 500;

export function disasterCacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function peekDisaster(lat: number, lng: number): DisasterLookup | undefined {
  return cache.get(disasterCacheKey(lat, lng));
}

export function parseDisasterLookup(raw: unknown, lat: number, lng: number): DisasterLookup {
  if (!raw || typeof raw !== 'object') throw new Error('invalid disaster response');
  const r = raw as Partial<DisasterLookup>;
  if (r.layer !== 'LT_C_UP201' || typeof r.found !== 'boolean' || !Array.isArray(r.hits) ||
    !r.coordinate || !Number.isFinite(r.coordinate.lat) || !Number.isFinite(r.coordinate.lng) ||
    disasterCacheKey(r.coordinate.lat, r.coordinate.lng) !== disasterCacheKey(lat, lng) ||
    r.found !== (r.hits.length > 0)) throw new Error('invalid disaster response');
  for (const hit of r.hits) {
    if (!hit || typeof hit !== 'object' || (hit.name !== null && typeof hit.name !== 'string') ||
      !hit.attributes || typeof hit.attributes !== 'object' || Array.isArray(hit.attributes) ||
      !Object.values(hit.attributes).every((v) => v === null || typeof v === 'string' ||
        typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) {
      throw new Error('invalid disaster hit');
    }
  }
  return { found: r.found, layer: r.layer, coordinate: r.coordinate, hits: r.hits as DisasterRiskHit[] };
}

export async function fetchDisaster(lat: number, lng: number, signal?: AbortSignal): Promise<DisasterLookup> {
  const key = disasterCacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached) return cached;
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`/api/disaster?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`disaster ${response.status}`);
  const result = parseDisasterLookup(await response.json(), lat, lng);
  if (!signal?.aborted) {
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, result);
  }
  return result;
}
