import { LOOKUP_VERSION, ZONING_LAYERS, restrictionLayers } from '../lib/lookupContract';
export const lat = 36.4916, lng = 127.3046;
export const meta = (latitude = lat, longitude = lng) => ({ coordinate: { lat: latitude, lng: longitude }, fetchedAt: new Date().toISOString(), version: LOOKUP_VERSION });
export const zoningFixture = (latitude = lat, longitude = lng) => ({ ...meta(latitude, longitude), found: true, layer: 'LT_C_UQ111', name: '공업지역', landUse: 'industrial' as const,
  all: [{ layer: 'LT_C_UQ111', name: '공업지역' }], queried: [...ZONING_LAYERS], failed: [] as string[], complete: true });
export const restrictionFixture = (latitude = lat, longitude = lng) => ({ ...meta(latitude, longitude), bufferM: 500,
  hits: [] as { layer: string; name: string | null; buffered: boolean }[], queried: restrictionLayers(500), failed: [] as string[], complete: true });
export const disasterFixture = (latitude = lat, longitude = lng) => ({ ...meta(latitude, longitude), found: false, layer: 'LT_C_UP201' as const,
  hits: [] as { name: string | null; attributes: Record<string, string | number | boolean | null> }[], queried: ['LT_C_UP201'], failed: [] as string[], complete: true });
export const prohibitedHit = { layer: 'LT_C_UD801', name: '개발제한구역', buffered: false };
