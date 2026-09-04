export const GEOCODE_NOT_FOUND = 'NOT_FOUND';

export interface GeocodeHit {
  lat: number;
  lng: number;
  label: string;
}

/** VWorld geocoding through the Edge proxy; throws GEOCODE_NOT_FOUND when the address is unknown. */
export async function geocodeAddress(q: string, signal?: AbortSignal): Promise<GeocodeHit> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal });
  if (res.status === 404) throw new Error(GEOCODE_NOT_FOUND);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const hit = (await res.json()) as GeocodeHit;
  if (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lng)) throw new Error('geocode bad payload');
  return hit;
}
