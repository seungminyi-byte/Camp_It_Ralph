import type { NearbySiteCandidates } from '../types';

export async function lookupNearbySites(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<NearbySiteCandidates> {
  const response = await fetch(`/api/nearby-sites?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`, { signal });
  if (!response.ok) throw new Error(`nearby sites ${response.status}`);
  return (await response.json()) as NearbySiteCandidates;
}
