import type { OnlineEvidence } from '../types';

export const LOOKUP_VERSION = 'vworld-v2-20260921';
export const LOOKUP_TTL_MS = 10 * 60_000;
export const ZONING_LAYERS = ['LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114'];
export const RESTRICTION_LAYERS = ['LT_C_UD801', 'LT_C_UM710', 'LT_C_UO301', 'LT_C_AGRIXUE101', 'LT_C_UQ162'];
export const DISASTER_LAYERS = ['LT_C_UP201'];
export function restrictionLayers(buffer: number) {
  if (!Number.isInteger(buffer) || buffer < 0 || buffer > 1000) throw new Error('invalid lookup radius');
  return [...RESTRICTION_LAYERS, ...(buffer > 0 ? [`LT_C_UO301@${buffer}`] : [])];
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function cleanText(value: unknown, max = 1000): value is string {
  return typeof value === 'string' && value.length <= max && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}
export function serviceCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132;
}
export function coordinate(lat: number, lng: number, precision: 4 | 5) {
  if (!serviceCoordinate(lat, lng)) throw new Error('invalid lookup coordinate');
  const scale = 10 ** precision;
  return { lat: Math.round(lat * scale) / scale, lng: Math.round(lng * scale) / scale };
}
export function lookupKey(endpoint: string, lat: number, lng: number, precision: 4 | 5, scope: string) {
  const c = coordinate(lat, lng, precision);
  return `${LOOKUP_VERSION}|${endpoint}|${c.lat},${c.lng}|${scope}`;
}
export function metadata(raw: Record<string, unknown>) {
  if (raw.version !== LOOKUP_VERSION || typeof raw.fetchedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.fetchedAt) ||
      !Number.isFinite(Date.parse(raw.fetchedAt)) || new Date(raw.fetchedAt).toISOString() !== raw.fetchedAt ||
      Date.parse(raw.fetchedAt) > Date.now() + 60_000) throw new Error('invalid lookup metadata');
  return { version: LOOKUP_VERSION, fetchedAt: raw.fetchedAt };
}
export function envelope(raw: unknown, lat: number, lng: number, precision: 4 | 5) {
  if (!record(raw)) throw new Error('invalid lookup response');
  const c = coordinate(lat, lng, precision);
  if (!record(raw.coordinate) || raw.coordinate.lat !== c.lat || raw.coordinate.lng !== c.lng) throw new Error('lookup coordinate mismatch');
  return { ...metadata(raw), coordinate: c };
}
function uniqueStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => cleanText(v, 100)) && new Set(value).size === value.length;
}
export function completeness(raw: Record<string, unknown>, expected: string[], hitCount: number) {
  if (!uniqueStrings(raw.queried) || raw.queried.length !== expected.length || raw.queried.some((v) => !expected.includes(v)) ||
      !uniqueStrings(raw.failed) || raw.failed.some((v) => !expected.includes(v)) ||
      typeof raw.complete !== 'boolean' || raw.complete !== (raw.failed.length === 0) ||
      raw.failed.length === expected.length && hitCount === 0) throw new Error('invalid lookup completeness');
  return { queried: [...raw.queried], failed: [...raw.failed], complete: raw.complete };
}
export function isEvidenceFresh(value: OnlineEvidence, now = Date.now()) {
  return value.stale !== true && value.complete !== false && (!value.fetchedAt || now - Date.parse(value.fetchedAt) < LOOKUP_TTL_MS);
}

let refreshRevision = 0;
/** A distinct CDN URL for retries, excluded from the semantic evidence identity. */
export function refreshQuery(force: boolean) {
  return force ? `&refresh=${Date.now()}-${++refreshRevision}` : '';
}
