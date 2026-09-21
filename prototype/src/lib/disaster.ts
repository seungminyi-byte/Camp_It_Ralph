import type { DisasterLookup } from '../types';
import { boundedJson } from './boundedJson';
import { EvidenceCache } from './evidenceCache';
import { refreshQuery, cleanText, completeness, coordinate, DISASTER_LAYERS, envelope, lookupKey, record } from './lookupContract';
const cache = new EvidenceCache<DisasterLookup>((v) => v.hits.length > 0, (previous, next) => ({ ...next, found: true,
  hits: [...new Map([...previous.hits, ...next.hits].map((h) => [JSON.stringify(h), h])).values()],
}));
export const disasterCacheKey = (lat: number, lng: number) => lookupKey('disaster', lat, lng, 5, DISASTER_LAYERS.join(','));
export const peekDisaster = (lat: number, lng: number) => cache.peek(disasterCacheKey(lat, lng));
export function parseDisasterLookup(raw: unknown, lat: number, lng: number): DisasterLookup {
  const meta = envelope(raw, lat, lng, 5);
  if (!record(raw) || raw.layer !== 'LT_C_UP201' || typeof raw.found !== 'boolean' || !Array.isArray(raw.hits) || raw.hits.length > 10 ||
      raw.found !== (raw.hits.length > 0) || raw.hits.some((h) => !record(h) || h.name !== null && !cleanText(h.name) ||
        !record(h.attributes) || Object.keys(h.attributes).length > 128 || Object.entries(h.attributes).some(([k, v]) =>
          !cleanText(k, 128) || !(v === null || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v) || cleanText(v, 500))))) throw new Error('invalid disaster response');
  return { ...meta, ...completeness(raw, DISASTER_LAYERS, raw.hits.length), found: raw.found, layer: 'LT_C_UP201', hits: raw.hits as DisasterLookup['hits'] };
}
export async function fetchDisaster(lat: number, lng: number, signal?: AbortSignal, force = false): Promise<DisasterLookup> {
  const c = coordinate(lat, lng, 5);
  return cache.load(disasterCacheKey(lat, lng), async () => parseDisasterLookup(await boundedJson(`/api/disaster?lat=${c.lat}&lng=${c.lng}${refreshQuery(force)}`, { signal }), lat, lng), signal, force);
}

export const seedDisaster = (key: string, value: DisasterLookup) => cache.seed(key, value);
