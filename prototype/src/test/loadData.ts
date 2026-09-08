import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../lib/csv';
import { decodeTerrain } from '../scoring/terrain';
import { decodeProtectedZones } from '../scoring/restriction';
import type {
  AppData,
  DataCenterSiteFile,
  CaseRow,
  NewsSignalFile,
  PermitDelayFile,
  ProtectedZonesFile,
  RegulationRow,
  Scenario,
  TerrainGridFile,
} from '../types';

const DATA_DIR = join(import.meta.dirname, '..', '..', 'public', 'data');

export function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')) as T;
}

export function readJsonOrNull<T>(name: string): T | null {
  return existsSync(join(DATA_DIR, name)) ? readJson<T>(name) : null;
}

/** The bundled app data exactly as useAppData assembles it, for tests that need the real thing. */
export function loadAppData(): AppData {
  const casesRaw = parseCsv(readFileSync(join(DATA_DIR, 'cases.csv'), 'utf-8'));
  const regsRaw = parseCsv(
    readFileSync(join(DATA_DIR, 'regulations.csv'), 'utf-8'),
  );
  const terrainFile = readJsonOrNull<TerrainGridFile>('terrain_grid.json');
  const zonesFile = readJsonOrNull<ProtectedZonesFile>('protected_zones.json');
  return {
    emdPower: readJson('emd_power.json'),
    emdCentroids: readJson('emd_centroids.json'),
    substations: readJson('substations_osm.json'),
    schools: readJson('schools.json'),
    popGrid: readJson('pop_grid.json'),
    households: readJsonOrNull('households_grid.json'),
    dcStats: readJson('dc_stats.json'),
    dataCenters: readJsonOrNull<DataCenterSiteFile>('data/data_centers.json')?.sites ?? [],
    constants: readJson('constants.json'),
    cases: casesRaw.map((r) => ({
      ...r,
      lat: Number(r.lat),
      lng: Number(r.lng),
      delay_months: Number(r.delay_months),
    })) as unknown as CaseRow[],
    regulations: regsRaw.map((r) => ({
      ...r,
      deduction: Number(r.deduction),
    })) as unknown as RegulationRow[],
    permitDelay: readJsonOrNull<PermitDelayFile>('permit_delay.json'),
    newsSignal: readJsonOrNull<NewsSignalFile>('news_signal.json'),
    terrain: terrainFile ? decodeTerrain(terrainFile) : null,
    protectedZones: zonesFile ? decodeProtectedZones(zonesFile) : null,
  };
}

/** scenarios.json is a test fixture only; the app itself no longer loads it. */
export function loadScenarios(): Scenario[] {
  return readJson<{ scenarios: Scenario[] }>('scenarios.json').scenarios;
}
