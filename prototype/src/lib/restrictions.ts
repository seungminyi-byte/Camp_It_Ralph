import type { RestrictionLookup } from '../types';
import { boundedJson } from './boundedJson';
import { EvidenceCache } from './evidenceCache';
import { refreshQuery, cleanText, completeness, coordinate, envelope, lookupKey, record, RESTRICTION_LAYERS, restrictionLayers } from './lookupContract';
const cache = new EvidenceCache<RestrictionLookup>((v) => v.hits.length > 0, (previous, next) => ({ ...next,
  hits: [...new Map([...previous.hits, ...next.hits].map((h) => [`${h.layer}|${h.buffered}|${h.name}`, h])).values()],
}));
export const restrictionCacheKey = (lat: number, lng: number, bufferM: number) => lookupKey('restrictions', lat, lng, 4, restrictionLayers(bufferM).join(','));
export const peekRestrictions = (lat: number, lng: number, bufferM: number) => cache.peek(restrictionCacheKey(lat, lng, bufferM));
export function parseRestrictionLookup(raw: unknown, lat: number, lng: number, bufferM: number): RestrictionLookup {
  const meta = envelope(raw, lat, lng, 4);
  const layers = restrictionLayers(bufferM);
  if (!record(raw) || raw.bufferM !== bufferM || !Array.isArray(raw.hits) || raw.hits.length > 30 || raw.hits.some((h) =>
      !record(h) || !RESTRICTION_LAYERS.includes(h.layer as string) || typeof h.buffered !== 'boolean' ||
      h.buffered && (bufferM === 0 || h.layer !== 'LT_C_UO301') || h.name !== null && !cleanText(h.name))) throw new Error('invalid restriction response');
  if (new Set(raw.hits.map((h) => JSON.stringify([h.layer, h.buffered, h.name]))).size !== raw.hits.length) throw new Error('duplicate restriction hit');
  return { ...meta, ...completeness(raw, layers, raw.hits.length), bufferM, hits: raw.hits as RestrictionLookup['hits'] };
}
export async function fetchRestrictions(lat: number, lng: number, bufferM: number, signal?: AbortSignal, force = false): Promise<RestrictionLookup> {
  const c = coordinate(lat, lng, 4);
  return cache.load(restrictionCacheKey(lat, lng, bufferM), async () => parseRestrictionLookup(await boundedJson(`/api/restrictions?lat=${c.lat}&lng=${c.lng}&buffer=${bufferM}${refreshQuery(force)}`, { signal }), lat, lng, bufferM), signal, force);
}

export const seedRestrictions = (key: string, value: RestrictionLookup) => cache.seed(key, value);
