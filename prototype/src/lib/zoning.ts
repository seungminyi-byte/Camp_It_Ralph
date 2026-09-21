import { landUseFromName } from '../../shared/zoning';
import type { LandUse, ZoningLookup } from '../types';
import { boundedJson } from './boundedJson';
import { EvidenceCache } from './evidenceCache';
import { refreshQuery, cleanText, completeness, coordinate, envelope, lookupKey, record, ZONING_LAYERS } from './lookupContract';
const LAND_USES: LandUse[] = ['industrial', 'semiIndustrial', 'commercial', 'green', 'residential', 'unknown'];
const cache = new EvidenceCache<ZoningLookup>((v) => v.found, (previous, next) => {
  const all = [...new Map([...previous.all, ...next.all].map((h) => [`${h.layer}|${h.name}`, h])).values()];
  return { ...next, found: true, all, layer: next.layer ?? previous.layer, name: next.name ?? previous.name, landUse: next.found ? next.landUse : previous.landUse };
});
export const zoningCacheKey = (lat: number, lng: number) => lookupKey('zoning', lat, lng, 4, ZONING_LAYERS.join(','));
export const peekZoning = (lat: number, lng: number) => cache.peek(zoningCacheKey(lat, lng));
export function parseZoningLookup(raw: unknown, lat: number, lng: number): ZoningLookup {
  const meta = envelope(raw, lat, lng, 4);
  if (!record(raw) || typeof raw.found !== 'boolean' || !LAND_USES.includes(raw.landUse as LandUse) ||
      !Array.isArray(raw.all) || raw.all.length > 20 || raw.all.some((h) => !record(h) || !ZONING_LAYERS.includes(h.layer as string) || !cleanText(h.name) || !h.name.trim()) ||
      raw.found !== (raw.all.length > 0) ||
      (raw.found ? raw.layer !== raw.all[0].layer || raw.name !== raw.all[0].name || raw.landUse !== landUseFromName(raw.all[0].layer, raw.all[0].name) : raw.layer !== null || raw.name !== null || raw.landUse !== 'unknown') ||
      raw.sido !== undefined && !cleanText(raw.sido) || raw.sigungu !== undefined && !cleanText(raw.sigungu)) throw new Error('invalid zoning response');
  return { ...meta, ...completeness(raw, ZONING_LAYERS, raw.all.length), found: raw.found, layer: raw.layer as string | null,
    name: raw.name as string | null, landUse: raw.landUse as LandUse, all: raw.all as ZoningLookup['all'],
    ...(raw.sido === undefined ? {} : { sido: raw.sido as string }), ...(raw.sigungu === undefined ? {} : { sigungu: raw.sigungu as string }) };
}
export async function lookupZoning(lat: number, lng: number, signal?: AbortSignal, force = false): Promise<ZoningLookup> {
  const c = coordinate(lat, lng, 4);
  return cache.load(zoningCacheKey(lat, lng), async () => parseZoningLookup(await boundedJson(`/api/zoning?lat=${c.lat}&lng=${c.lng}${refreshQuery(force)}`, { signal }), lat, lng), signal, force);
}

export const seedZoning = (key: string, value: ZoningLookup) => cache.seed(key, value);
