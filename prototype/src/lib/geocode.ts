import { boundedJson, HttpLookupError } from './boundedJson';
import { cleanText, coordinate, metadata, record } from './lookupContract';
export const GEOCODE_NOT_FOUND = 'NOT_FOUND';
export interface GeocodeHit { lat: number; lng: number; label: string; fetchedAt: string; version: string }
export function parseGeocodeHit(raw: unknown): GeocodeHit {
  if (!record(raw) || typeof raw.lat !== 'number' || typeof raw.lng !== 'number' || !cleanText(raw.label, 500) || !raw.label.trim()) throw new Error('invalid geocode response');
  coordinate(raw.lat, raw.lng, 5);
  return { lat: raw.lat, lng: raw.lng, label: raw.label, ...metadata(raw) };
}
export async function geocodeAddress(q: string, signal?: AbortSignal): Promise<GeocodeHit> {
  const query = q.trim();
  if (!cleanText(query, 200) || !query) throw new Error('invalid address');
  try { return parseGeocodeHit(await boundedJson(`/api/geocode?q=${encodeURIComponent(query)}`, { signal })); }
  catch (error) { if (error instanceof HttpLookupError && error.status === 404 && error.code === 'NOT_FOUND') throw new Error(GEOCODE_NOT_FOUND); throw error; }
}
