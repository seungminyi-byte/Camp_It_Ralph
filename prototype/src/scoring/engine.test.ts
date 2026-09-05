import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../lib/csv';
import type {
  AppData,
  CaseRow,
  NewsSignalFile,
  PermitDelayFile,
  RegulationRow,
  Scenario,
  TerrainGridFile,
} from '../types';
import { decodeTerrain } from './terrain';
import { scoreSite } from './engine';

const DATA_DIR = join(__dirname, '..', '..', 'public', 'data');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf-8')) as T;
}

function readJsonOrNull<T>(name: string): T | null {
  return existsSync(join(DATA_DIR, name)) ? readJson<T>(name) : null;
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
    terrain: (() => {
      const f = readJsonOrNull<TerrainGridFile>('terrain_grid.json');
      return f ? decodeTerrain(f) : null;
    })(),
  };
}

/** scenarios.json is a test/precompute fixture only — the app itself no longer loads it. */
const scenarios = readJson<{ scenarios: Scenario[] }>('scenarios.json').scenarios;

const data = loadData();
const baseInput = {
  capexKrw: data.constants.scoring.finance.defaultCapexKrw,
  annualRate: data.constants.scoring.finance.defaultAnnualRate,
};

function scenario(id: string): Scenario {
  const sc = scenarios.find((s) => s.id === id);
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
    if (data.terrain) {
      expect(r.site.status).toBe('ok');
      expect(r.terrain?.deduction ?? 0).toBeLessThanOrEqual(5);
    }
  });

  it('scenario 2: 인천 주거 인접 lands in E with ordinance flag', () => {
    const sc = scenario('incheon-residential');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    expect(sc.expectedGrade).toContain(r.composite.grade);
    expect(r.permit.deductions.some((d) => d.label === '조례상 입지 불가')).toBe(true);
    if (data.terrain) {
      expect(r.site.status).toBe('ok');
      expect(r.terrain?.deduction ?? 0).toBeLessThanOrEqual(5);
    }
  });

  it('scenario 3: 세종 대조 lands in A~B with short delay', () => {
    const sc = scenario('sejong-contrast');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    expect(sc.expectedGrade).toContain(r.composite.grade);
    expect(r.gate.pass).toBe(true);
    expect(r.delay.maxMonths).toBeLessThanOrEqual(6);
    expect(r.power.regionScore).toBe(data.constants.scoring.power.regionPrior['default']);
    if (data.terrain) {
      expect(r.site.status).toBe('ok');
      // 세종 반곡동 sits on the 5-degree band edge; a drift past it would cost the B grade.
      expect(r.terrain?.deduction ?? 0).toBeLessThanOrEqual(5);
    }
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

  it('permit-delay stat: 세종 is at/below baseline (no deduction), 고양 falls back to city roll-up', () => {
    if (!data.permitDelay) return; // signal disabled when data/permit_delay.json is absent
    const sj = scenario('sejong-contrast');
    const rs = scoreSite({ lat: sj.lat, lng: sj.lng, landUse: sj.landUse, ...baseInput }, data);
    expect(rs.permit.delayStat?.enough).toBe(true);
    expect(rs.permit.delayStat?.deduction).toBe(0);
    expect(rs.permit.deductions.some((d) => d.label === '허가→착공 지연 통계')).toBe(false);

    const gy = scenario('goyang-deogi');
    const rg = scoreSite({ lat: gy.lat, lng: gy.lng, landUse: gy.landUse, ...baseInput }, data);
    expect(rg.permit.delayStat?.areaLabel).toBe('고양시');
    expect(rg.permit.delayStat?.row.n).toBeGreaterThanOrEqual(
      data.constants.scoring.permit.delayStat.minPermits,
    );
  });

  it('permit-delay stat: 금천구 (slow permits→start) carries the deduction', () => {
    if (!data.permitDelay) return;
    const r = scoreSite({ lat: 37.4685, lng: 126.899, landUse: 'industrial', ...baseInput }, data);
    expect(r.emd?.sigungu).toBe('금천구');
    const d = r.permit.deductions.find((x) => x.label === '허가→착공 지연 통계');
    expect(d?.points).toBeGreaterThanOrEqual(6);
    expect(d?.evidence).toContain('금천구');
  });

  it('news signal: 고양시는 시 단위 행으로 감점되고도 기대 등급(C~D)에 머문다', () => {
    if (!data.newsSignal) return; // signal disabled when data/news_signal.json is absent
    const sc = scenario('goyang-deogi');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    expect(r.permit.newsSignal?.areaLabel).toBe('고양시');
    expect(r.permit.newsSignal?.row.level).toBe('city');
    const d = r.permit.deductions.find((x) => x.label === '뉴스 갈등 보도');
    expect(d?.points).toBeGreaterThanOrEqual(8);
    expect(d?.evidence).toContain('고양시');
    expect(sc.expectedGrade).toContain(r.composite.grade);
  });

  it('news signal: 세종은 시도 단위 행이라 감점이 축소되고 등급·지연이 유지된다', () => {
    if (!data.newsSignal) return;
    const sc = scenario('sejong-contrast');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    const cfg = data.constants.scoring.permit;
    const row = r.permit.newsSignal?.row;
    expect(row?.level).toBe('sido');
    const band =
      cfg.newsDeduction.find((b) => (row?.conflictArticles ?? 0) <= b.maxCount)?.deduction ?? 0;
    expect(r.permit.newsSignal?.deduction).toBe(Math.round(band * cfg.newsLevelWeight.sido));
    expect(sc.expectedGrade).toContain(r.composite.grade);
    expect(r.delay.maxMonths).toBeLessThanOrEqual(6);
  });

  it('finance scales with delay point months', () => {
    const sc = scenario('goyang-deogi');
    const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
    const expected = (baseInput.capexKrw * baseInput.annualRate / 12) * r.delay.pointMonths;
    expect(r.finance.delayCostKrw).toBeCloseTo(expected, 0);
  });

  it('terrain: 서해 한복판은 해상으로 판정되고 용도지역·수동 지정으로만 뒤집힌다', () => {
    if (!data.terrain) return; // signal disabled when data/terrain_grid.json is absent
    const at = { lat: 37.4, lng: 126.2, landUse: 'unknown' as const, ...baseInput };
    expect(scoreSite(at, data).site.status).toBe('sea');

    const zoned = scoreSite(
      { ...at, zoning: { found: true, layer: 'LT_C_UQ111', name: '일반공업지역', landUse: 'industrial', all: [] } },
      data,
    );
    expect(zoned.site.status).toBe('reclaimed');

    expect(scoreSite({ ...at, assumeLand: true }, data).site.status).toBe('reclaimed');
  });

  it('terrain: 태백산맥 능선은 산지 감점과 부적합 플래그를 받는다', () => {
    if (!data.terrain) return;
    const r = scoreSite({ lat: 37.85, lng: 128.45, landUse: 'green', ...baseInput }, data);
    expect(r.site.status).toBe('ok');
    expect(r.terrain?.unsuitable).toBe(true);
    const d = r.permit.deductions.find((x) => x.label === '지형·경사');
    expect(d?.points).toBeGreaterThanOrEqual(20);
    expect(d?.evidence).toContain('중앙값 경사');
  });

  it('coverage: 독도 인근(울릉읍 중심점 89km)은 판독 불가로 빠지고 지형 감점이 없다', () => {
    const r = scoreSite({ lat: 37.24, lng: 131.86, landUse: 'unknown', ...baseInput }, data);
    expect(r.site.status).toBe('outside');
    expect(r.site.label).toBe('판독 불가');
    expect(r.terrain).toBeNull();
    expect(r.permit.deductions.some((x) => x.label === '지형·경사')).toBe(false);
  });

  it('coverage: 개성·대마도는 판독 불가, 데모 3지점은 남한 자료 범위 안이다', () => {
    const at = (lat: number, lng: number) =>
      scoreSite({ lat, lng, landUse: 'unknown', ...baseInput }, data).site;
    expect(at(37.97, 126.55).status).toBe('outside'); // 개성 — 휴전선 이북
    expect(at(37.97, 126.55).detail).toContain('이북');
    expect(at(34.4, 129.3).status).toBe('outside'); // 대마도 — 거제 남부면 중심점에서 71km
    for (const sc of scenarios) {
      expect(at(sc.lat, sc.lng).status, sc.id).not.toBe('outside');
    }
  });

  describe('conflictRisk (named roll-up of the three conflict deductions)', () => {
    const CONFLICT_LABELS = new Set(['동일 시군구 갈등 사례', '인근 갈등 사례', '뉴스 갈등 보도']);
    const sumConflict = (r: ReturnType<typeof scoreSite>) =>
      r.permit.deductions.filter((d) => CONFLICT_LABELS.has(d.label)).reduce((s, d) => s + d.points, 0);
    const expectedLevel = (points: number) => {
      const cfg = data.constants.scoring.permit.conflictRisk;
      return points >= cfg.highMin ? 'high' : points >= cfg.mediumMin ? 'medium' : 'low';
    };

    it('equals the sum of its components and of the matching deductions, for every demo point', () => {
      for (const sc of scenarios) {
        const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
        const c = r.permit.conflictRisk;
        expect(c.points).toBe(c.casePoints + c.nearbyPoints + c.newsPoints);
        expect(c.points).toBe(sumConflict(r));
        expect(c.level).toBe(expectedLevel(c.points));
      }
    });

    it('고양 덕이동: two same-district cases plus city-level news make it high', () => {
      const sc = scenario('goyang-deogi');
      const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
      expect(r.permit.conflictRisk.casePoints).toBe(20);
      if (data.newsSignal) expect(r.permit.conflictRisk.newsPoints).toBeGreaterThanOrEqual(8);
      expect(r.permit.conflictRisk.level).toBe('high');
    });

    it('인천 청천동: one resolved case and no news keeps it at medium', () => {
      const sc = scenario('incheon-residential');
      const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
      expect(r.permit.conflictRisk.casePoints).toBe(6);
      expect(r.permit.conflictRisk.nearbyPoints).toBe(0); // 부천 삼정동 sits just past caseNearbyKm
      expect(r.permit.conflictRisk.newsPoints).toBe(0);
      expect(r.permit.conflictRisk.level).toBe('medium');
    });

    it('세종 반곡동: sido-level news only, halved by newsLevelWeight, stays low', () => {
      if (!data.newsSignal) return;
      const sc = scenario('sejong-contrast');
      const r = scoreSite({ lat: sc.lat, lng: sc.lng, landUse: sc.landUse, ...baseInput }, data);
      const cfg = data.constants.scoring.permit;
      expect(r.permit.conflictRisk.casePoints).toBe(0);
      expect(r.permit.conflictRisk.newsPoints).toBe(r.permit.newsSignal?.deduction ?? -1);
      // 4 points sits one below mediumMin (5): ~30+ conflict articles in 세종 would tip it to medium.
      expect(r.permit.conflictRisk.points).toBeLessThan(cfg.conflictRisk.mediumMin);
      expect(r.permit.conflictRisk.level).toBe('low');
    });
  });
});
