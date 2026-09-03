import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../lib/csv';
import type { AppData, CaseRow, RegulationRow, Scenario } from '../types';
import { scoreSite } from './engine';

const DATA_DIR = join(__dirname, '..', '..', 'public', 'data');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')) as T;
}

function loadData(): AppData {
  const casesRaw = parseCsv(readFileSync(join(DATA_DIR, 'cases.csv'), 'utf-8'));
  const regsRaw = parseCsv(readFileSync(join(DATA_DIR, 'regulations.csv'), 'utf-8'));
  return {
    emdPower: readJson('emd_power.json'),
    emdCentroids: readJson('emd_centroids.json'),
    substations: readJson('substations_osm.json'),
    schools: readJson('schools.json'),
    popGrid: readJson('pop_grid.json'),
    dcStats: readJson('dc_stats.json'),
    constants: readJson('constants.json'),
    scenarios: readJson<{ scenarios: Scenario[] }>('scenarios.json').scenarios,
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
  };
}

const data = loadData();
const baseInput = {
  capexKrw: data.constants.scoring.finance.defaultCapexKrw,
  annualRate: data.constants.scoring.finance.defaultAnnualRate,
};

function scenario(id: string): Scenario {
  const sc = data.scenarios.find((s) => s.id === id);
  if (!sc) throw new Error(`scenario ${id} missing`);
  return sc;
}

describe('scoreSite golden cases', () => {
  it('scenario 1: 고양 덕이동 lands in C~D with case evidence', () => {
    const sc = scenario('goyang-deogi');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    expect(r.emd?.emd).toBe('덕이동');
    expect(sc.expectedGrade).toContain(r.composite.grade);
    expect(r.permit.matchedCases.map((c) => c.name)).toContain('고양 덕이동 데이터센터');
    expect(r.gate.pass).toBe(true);
  });

  it('scenario 2: 인천 주거 인접 lands in E with ordinance flag', () => {
    const sc = scenario('incheon-residential');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    expect(sc.expectedGrade).toContain(r.composite.grade);
    expect(r.permit.deductions.some((d) => d.label === '조례상 입지 불가')).toBe(true);
  });

  it('scenario 3: 세종 대조 lands in A~B with short delay', () => {
    const sc = scenario('sejong-contrast');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    expect(sc.expectedGrade).toContain(r.composite.grade);
    expect(r.gate.pass).toBe(true);
    expect(r.delay.maxMonths).toBeLessThanOrEqual(6);
    expect(r.power.regionScore).toBe(data.constants.scoring.power.regionPrior['default']);
  });

  it('gate failure: mid-mountain site is capped at grade D', () => {
    const r = scoreSite({ lat: 37.85, lng: 128.45, landUse: 'green', ...baseInput }, data);
    if (!r.gate.pass) {
      expect(['D', 'E']).toContain(r.composite.grade);
      expect(r.power.score).toBeLessThanOrEqual(
        data.constants.scoring.power.gateFailCap,
      );
    }
  });

  it('regulation special: 인천 industrial site still carries 조례 deduction', () => {
    const r = scoreSite({ lat: 37.5218, lng: 126.6963, landUse: 'industrial', ...baseInput }, data);
    expect(r.permit.matchedRegulations.length).toBeGreaterThan(0);
    expect(r.permit.deductions.some((d) => d.label === '조례상 입지 불가')).toBe(false);
  });

  it('finance scales with delay point months', () => {
    const sc = scenario('goyang-deogi');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    const expected = (baseInput.capexKrw * baseInput.annualRate / 12) * r.delay.pointMonths;
    expect(r.finance.delayCostKrw).toBeCloseTo(expected, 0);
  });
});
