import type { NearbySiteCandidates } from '../types';
import { boundedJson } from './boundedJson';
import { EvidenceCache } from './evidenceCache';
import { refreshQuery, cleanText, coordinate, envelope, lookupKey, record } from './lookupContract';
const cache = new EvidenceCache<NearbySiteCandidates>(() => false);
export const nearbyCacheKey = (lat: number, lng: number) => lookupKey('nearby-sites', lat, lng, 5, 'LP_PA_CBND_BUBUN|radius15km|min3305.8m2');
export const peekNearbySites = (lat: number, lng: number) => cache.peek(nearbyCacheKey(lat, lng));
function validPoint(value: unknown): boolean {
  return record(value) && typeof value.lat === 'number' && typeof value.lng === 'number' &&
    Number.isFinite(value.lat) && value.lat >= 32 && value.lat <= 40 && Number.isFinite(value.lng) && value.lng >= 123 && value.lng <= 133;
}
function validRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4 || value.length > 20_000 || value.some((p) => !Array.isArray(p) || p.length !== 2 || !validPoint({ lat: p[0], lng: p[1] }))) return false;
  const last = value[value.length - 1];
  return value[0][0] === last[0] && value[0][1] === last[1] && new Set(value.slice(0, -1).map((p) => p.join(','))).size >= 3;
}
export function parseNearbySites(raw: unknown, lat: number, lng: number): NearbySiteCandidates {
  const meta = envelope(raw, lat, lng, 5);
  if (!record(raw) || raw.basis !== 'vworld-continuous-cadastral-map' || raw.minimumAreaM2 !== 3305.8 || raw.minimumAreaPyeong !== 1000 || raw.searchRadiusKm !== 15 ||
      typeof raw.truncated !== 'boolean' || ![1, 9, 17, 25].includes(raw.searchedTiles as number) || !cleanText(raw.note, 2000) || !Array.isArray(raw.candidates) || raw.candidates.length > 3 ||
      raw.candidates.some((c) => !record(c) || !cleanText(c.id) || !c.id || !cleanText(c.label) || !c.label || c.pnu !== null && !cleanText(c.pnu) ||
        typeof c.areaM2 !== 'number' || !Number.isFinite(c.areaM2) || c.areaM2 < 3305.8 || typeof c.areaPyeong !== 'number' || !Number.isFinite(c.areaPyeong) || Math.abs(c.areaPyeong - c.areaM2 / 3.3058) > 0.01 ||
        typeof c.distanceKm !== 'number' || !Number.isFinite(c.distanceKm) || c.distanceKm < 0 || c.distanceKm > 15 || !validPoint(c.center) ||
        !Array.isArray(c.rings) || c.rings.length === 0 || c.rings.length > 100 || !c.rings.every(validRing))) throw new Error('invalid nearby response');
  if (new Set(raw.candidates.map((c) => c.id)).size !== raw.candidates.length) throw new Error('duplicate nearby candidate');
  return { ...meta, basis: raw.basis, minimumAreaM2: 3305.8, minimumAreaPyeong: 1000, searchRadiusKm: 15,
    candidates: raw.candidates as NearbySiteCandidates['candidates'], truncated: raw.truncated, searchedTiles: raw.searchedTiles as number,
    note: raw.note, complete: !raw.truncated };
}
export async function lookupNearbySites(lat: number, lng: number, signal?: AbortSignal, force = false): Promise<NearbySiteCandidates> {
  const c = coordinate(lat, lng, 5);
  return cache.load(nearbyCacheKey(lat, lng), async () => parseNearbySites(await boundedJson(`/api/nearby-sites?lat=${c.lat}&lng=${c.lng}${refreshQuery(force)}`, { signal }), lat, lng), signal, force);
}
