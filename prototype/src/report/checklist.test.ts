import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../lib/csv';
import { scoreSite } from '../scoring/engine';
import { decodeTerrain } from '../scoring/terrain';
import type {
  AppData, CaseRow, NewsSignalFile, PermitDelayFile, RegulationRow, Scenario, TerrainGridFile,
} from '../types';
import { CHECKLIST_KEYS, buildChecklist, verdictFromPoints } from './checklist';

const DATA_DIR = join(__dirname, '..', '..', 'public', 'data');
const readJson = <T,>(n: string): T => JSON.parse(readFileSync(join(DATA_DIR, n), 'utf-8')) as T;
const readJsonOrNull = <T,>(n: string): T | null =>
  existsSync(join(DATA_DIR, n)) ? readJson<T>(n) : null;

function loadData(): AppData {
  const terrainFile = readJsonOrNull<TerrainGridFile>('terrain_grid.json');
  return {
    emdPower: readJson('emd_power.json'),
    emdCentroids: readJson('emd_centroids.json'),
    substations: readJson('substations_osm.json'),
    schools: readJson('schools.json'),
    popGrid: readJson('pop_grid.json'),
    dcStats: readJson('dc_stats.json'),
    constants: readJson('constants.json'),
    cases: parseCsv(readFileSync(join(DATA_DIR, 'cases.csv'), 'utf-8')).map((r) => ({
      ...r, lat: Number(r.lat), lng: Number(r.lng), delay_months: Number(r.delay_months),
    })) as unknown as CaseRow[],
    regulations: parseCsv(readFileSync(join(DATA_DIR, 'regulations.csv'), 'utf-8')).map((r) => ({
      ...r, deduction: Number(r.deduction),
    })) as unknown as RegulationRow[],
    permitDelay: readJsonOrNull<PermitDelayFile>('permit_delay.json'),
    newsSignal: readJsonOrNull<NewsSignalFile>('news_signal.json'),
    terrain: terrainFile ? decodeTerrain(terrainFile) : null,
  };
}

const data = loadData();
const scenarios = readJson<{ scenarios: Scenario[] }>('scenarios.json').scenarios;
const fin = data.constants.scoring.finance;

function rowsFor(id: string, landUseSource: 'unknown' | 'auto' | 'manual' = 'manual') {
  const sc = scenarios.find((s) => s.id === id)!;
  const input = {
    lat: sc.lat, lng: sc.lng, landUse: sc.landUse,
    capexKrw: fin.defaultCapexKrw, annualRate: fin.defaultAnnualRate,
  };
  const result = scoreSite(input, data);
  const source = sc.landUse === 'unknown' ? 'unknown' : landUseSource;
  return buildChecklist(result, data, { input, landUseSource: source, zoningName: null });
}

const byKey = (rows: ReturnType<typeof rowsFor>, key: string) => rows.find((r) => r.key === key)!;

describe('verdictFromPoints', () => {
  it('splits at 0 and 10 points', () => {
    expect(verdictFromPoints(0)).toBe('good');
    expect(verdictFromPoints(9)).toBe('caution');
    expect(verdictFromPoints(10)).toBe('risk');
  });
});

describe('buildChecklist', () => {
  it('always returns the same 12 rows in order', () => {
    const rows = rowsFor('goyang-deogi');
    expect(rows.map((r) => r.key)).toEqual([...CHECKLIST_KEYS]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(12);
    expect(rows.every((r) => r.evidence.length > 0)).toBe(true);
  });

  it('고양 덕이동: 용도지역 미확인은 판단 보류, 갈등 사례는 위험', () => {
    const rows = rowsFor('goyang-deogi');
    expect(byKey(rows, 'permit.landUse').verdict).toBe('na');
    expect(byKey(rows, 'permit.cases').verdict).toBe('risk');
    expect(byKey(rows, 'permit.news').verdict).not.toBe('na');
  });

  it('인천 청천동: 주거지역과 조례 규제가 모두 위험', () => {
    const rows = rowsFor('incheon-residential');
    expect(byKey(rows, 'permit.landUse').verdict).toBe('risk');
    expect(byKey(rows, 'permit.regulation').verdict).toBe('risk');
  });

  it('세종 반곡동: 규제·사례 모두 양호', () => {
    const rows = rowsFor('sejong-contrast');
    expect(byKey(rows, 'permit.regulation').verdict).toBe('good');
    expect(byKey(rows, 'permit.cases').verdict).toBe('good');
  });

  it('지형 데이터가 있으면 부지 두 행이 판정을 갖는다', () => {
    const rows = rowsFor('sejong-contrast');
    if (data.terrain) {
      expect(byKey(rows, 'site.terrain').verdict).not.toBe('na');
      expect(byKey(rows, 'site.landWater').verdict).toBe('good');
    } else {
      expect(byKey(rows, 'site.terrain').verdict).toBe('na');
    }
  });

  it('용도지역 판정 출처를 근거 문구에 적는다', () => {
    const auto = byKey(rowsFor('sejong-contrast', 'auto'), 'permit.landUse');
    expect(auto.evidence).toContain('VWorld 자동 판정');
    const manual = byKey(rowsFor('sejong-contrast', 'manual'), 'permit.landUse');
    expect(manual.evidence).toContain('수동 선택');
  });
});
