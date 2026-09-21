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
import { validDataCenters } from '../lib/dataCenters';
import { bundleLoader, type BundleLoader } from '../lib/bundleLoader';
import { parseBundleCsv, parseBundleJson } from '../lib/bundleValidation';

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

export function useAppData(loader: BundleLoader = bundleLoader) {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const leases: (() => void)[] = [];
    const failed: string[] = [];
    const acquire = <T,>(name: string, parse: (text: string) => T) => {
      const lease = loader.acquire(name, parse); leases.push(lease.release); return lease.promise;
    };
    const json = <T,>(name: string) => acquire<T>(name, text => parseBundleJson<T>(name, text));
    const optional = <T,>(name: string, validate?: (value: T) => boolean) => acquire<T>(name, text => {
      const value = parseBundleJson<T>(name, text);
      if (validate && !validate(value)) throw Error('Invalid optional bundle');
      return value;
    }).catch(() => { failed.push(name); return null; });
    (async () => {
      try {
        const [
          emdPower,
          emdCentroids,
          substations,
          schools,
          popGrid,
          dcStats,
          dataCenterFile,
          constants,
          casesRaw,
          regsRaw,
          permitDelay,
          newsSignal,
          terrainFile,
          protectedZonesFile,
          households,
        ] = await Promise.all([
          json<AppData['emdPower']>('emd_power.json'),
          json<AppData['emdCentroids']>('emd_centroids.json'),
          json<AppData['substations']>('substations_osm.json'),
          json<AppData['schools']>('schools.json'),
          json<AppData['popGrid']>('pop_grid.json'),
          json<AppData['dcStats']>('dc_stats.json'),
          optional<AppData['dataCenters']>('data_centers.json', validDataCenters),
          json<AppData['constants']>('constants.json'),
          acquire('cases.csv', text => parseBundleCsv('cases.csv', text)),
          acquire('regulations.csv', text => parseBundleCsv('regulations.csv', text)),
          optional<PermitDelayFile>('permit_delay.json'),
          optional<NewsSignalFile>('news_signal.json'),
          optional<TerrainGridFile>('terrain_grid.json', value => safeDecodeTerrain(value) !== null),
          optional<ProtectedZonesFile>('protected_zones.json', value => safeDecodeProtectedZones(value) !== null),
          optional<HouseholdGridFile>('households_grid.json', validHouseholds),
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
          setWarnings(failed);
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
            dataCenters: dataCenterFile,
            constants,
            permitDelay,
            newsSignal,
            terrain: safeDecodeTerrain(terrainFile),
            protectedZones: safeDecodeProtectedZones(protectedZonesFile),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '자료를 확인할 수 없습니다.');
        leases.forEach(release => release());
      }
    })();
    return () => {
      cancelled = true;
      leases.forEach(release => release());
    };
  }, [attempt, loader]);

  return { data, error, warnings, retry: () => { setError(null); setAttempt(value => value + 1); } };
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
