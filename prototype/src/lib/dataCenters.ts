import type { DataCenterSiteFile } from '../types';

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const categories = ['edgeSmall', 'colocation', 'hyperscale'];

export function validDataCenters(file: unknown): file is DataCenterSiteFile {
  if (!record(file) || file.version !== 1 || !text(file.asOf) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(file.asOf) ||
      !Number.isFinite(Date.parse(file.asOf)) ||
      new Date(file.asOf).toISOString().slice(0, 10) !== file.asOf ||
      !text(file.scope) || !record(file.classification) || !Array.isArray(file.sites)) return false;
  if (!categories.every(k => text((file.classification as Record<string, unknown>)[k]))) return false;
  const asOfYear = Number(file.asOf.slice(0, 4));
  const ids = new Set<string>();
  return file.sites.every(site => {
    if (!record(site) || !text(site.id) || ids.has(site.id) ||
        !['name', 'categoryReason', 'address', 'scaleNote', 'sourceName', 'sourceUrl', 'coordinateBasis'].every(k => text(site[k])) ||
        site.status !== 'operational' || !categories.includes(String(site.category)) ||
        !finite(site.lat) || !finite(site.lng) || site.lat < 33 || site.lat > 39.5 || site.lng < 124 || site.lng > 132 ||
        !(site.openedYear === null || (finite(site.openedYear) && Number.isInteger(site.openedYear) && site.openedYear >= 1900 && site.openedYear <= asOfYear)) ||
        !(site.capacityMw === null ? site.capacityKind === null : finite(site.capacityMw) && site.capacityMw > 0 && ['IT', 'facility', 'design'].includes(String(site.capacityKind)))) return false;
    try {
      const url = new URL(String(site.sourceUrl));
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    } catch { return false; }
    ids.add(site.id);
    return true;
  });
}

/** Optional map evidence never blocks the scoring dataset. */
export async function loadDataCenters(): Promise<DataCenterSiteFile | null> {
  try {
    const response = await fetch('data/data_centers.json');
    if (!response.ok) return null;
    const file: unknown = await response.json();
    return validDataCenters(file) ? file : null;
  } catch { return null; }
}
