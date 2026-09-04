import { useEffect, useState } from 'react';
import type { AppData, CaseRow, PermitDelayFile, RegulationRow } from '../types';
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
          scenariosFile,
          casesRaw,
          regsRaw,
          permitDelay,
        ] = await Promise.all([
          fetchJson<AppData['emdPower']>('data/emd_power.json'),
          fetchJson<AppData['emdCentroids']>('data/emd_centroids.json'),
          fetchJson<AppData['substations']>('data/substations_osm.json'),
          fetchJson<AppData['schools']>('data/schools.json'),
          fetchJson<AppData['popGrid']>('data/pop_grid.json'),
          fetchJson<AppData['dcStats']>('data/dc_stats.json'),
          fetchJson<AppData['constants']>('data/constants.json'),
          fetchJson<{ scenarios: AppData['scenarios'] }>('data/scenarios.json'),
          fetchCsv('data/cases.csv'),
          fetchCsv('data/regulations.csv'),
          fetchJsonOrNull<PermitDelayFile>('data/permit_delay.json'),
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
            emdPower,
            emdCentroids,
            substations,
            schools,
            popGrid,
            cases,
            regulations,
            dcStats,
            scenarios: scenariosFile.scenarios,
            constants,
            permitDelay,
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
