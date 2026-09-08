import { useEffect, useState } from 'react';
import type {
  AppData,
  HouseholdGridFile,
  CaseRow,
  NewsSignalFile,
  PermitDelayFile,
  ProtectedZones,
  ProtectedZonesFile,
  RegulationRow,
  TerrainGrid,
  TerrainGridFile,
} from '../types';
import { decodeTerrain } from '../scoring/terrain';
import { decodeProtectedZones } from '../scoring/restriction';
import { parseCsv } from '../lib/csv';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

/** Optional data file: a missing or broken file disables the feature instead of failing the app. */
async function fetchJsonOrNull<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** A corrupt terrain file disables the terrain signal instead of blanking the app. */
function safeDecodeTerrain(file: TerrainGridFile | null): TerrainGrid | null {
  if (!file) return null;
  try {
    return decodeTerrain(file);
  } catch (e) {
    console.warn('terrain_grid.json ignored:', e);
    return null;
  }
}

/** A malformed protected_zones.json disables the restriction layer instead of blanking the app. */
function safeDecodeProtectedZones(
  file: ProtectedZonesFile | null,
): ProtectedZones | null {
  if (!file) return null;
  try {
    return decodeProtectedZones(file);
  } catch (e) {
    console.warn('protected_zones.json ignored:', e);
    return null;
  }
}

async function fetchCsv(path: string): Promise<Record<string, string>[]> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return parseCsv(await res.text());
}

export function useAppData(): { data: AppData | null; error: string | null } {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [
          emdPower,
          emdCentroids,
          substations,
          schools,
          popGrid,
          dcStats,
          constants,
          casesRaw,
          regsRaw,
          permitDelay,
          newsSignal,
          terrainFile,
          protectedZonesFile,
          households,
        ] = await Promise.all([
          fetchJson<AppData['emdPower']>('data/emd_power.json'),
          fetchJson<AppData['emdCentroids']>('data/emd_centroids.json'),
          fetchJson<AppData['substations']>('data/substations_osm.json'),
          fetchJson<AppData['schools']>('data/schools.json'),
          fetchJson<AppData['popGrid']>('data/pop_grid.json'),
          fetchJson<AppData['dcStats']>('data/dc_stats.json'),
          fetchJson<AppData['constants']>('data/constants.json'),
          fetchCsv('data/cases.csv'),
          fetchCsv('data/regulations.csv'),
          fetchJsonOrNull<PermitDelayFile>('data/permit_delay.json'),
          fetchJsonOrNull<NewsSignalFile>('data/news_signal.json'),
          fetchJsonOrNull<TerrainGridFile>('data/terrain_grid.json'),
          fetchJsonOrNull<ProtectedZonesFile>('data/protected_zones.json'),
          fetchJsonOrNull<HouseholdGridFile>('data/households_grid.json'),
        ]);
        const cases: CaseRow[] = casesRaw.map((r) => ({
          id: r.id,
          name: r.name,
          sido: r.sido,
          sigungu: r.sigungu,
          lat: Number(r.lat),
          lng: Number(r.lng),
          cause: r.cause,
          delay_months: Number(r.delay_months),
          delay_estimated: r.delay_estimated,
          status: r.status as CaseRow['status'],
          source_url: r.source_url,
          summary: r.summary,
        }));
        const regulations: RegulationRow[] = regsRaw.map((r) => ({
          sido: r.sido,
          sigungu: r.sigungu,
          reg_type: r.reg_type,
          detail: r.detail,
          deduction: Number(r.deduction),
          effective: r.effective,
          source_url: r.source_url,
        }));
        if (!cancelled) {
          setData({
            households: validHouseholds(households) ? households : null,
            emdPower,
            emdCentroids,
            substations,
            schools,
            popGrid,
            cases,
            regulations,
            dcStats,
            constants,
            permitDelay,
            newsSignal,
            terrain: safeDecodeTerrain(terrainFile),
            protectedZones: safeDecodeProtectedZones(protectedZonesFile),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}

function validHouseholds(f: HouseholdGridFile | null): boolean {
  return (
    !!f &&
    f.version === 1 &&
    f.year === 2024 &&
    Array.isArray(f.rows) &&
    f.rows.every(
      (r) =>
        Array.isArray(r) &&
        r.length === 3 &&
        Number.isFinite(r[0]) &&
        Number.isFinite(r[1]) &&
        (r[2] === null || (Number.isInteger(r[2]) && r[2] >= 0)),
    )
  );
}
