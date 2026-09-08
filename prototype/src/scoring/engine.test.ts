import { describe, expect, it } from 'vitest';
import type { AppData, ScoreInput } from '../types';
import { loadAppData, loadScenarios } from '../test/loadData';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { scoreSite } from './engine';

const data = loadAppData();
const scenarios = loadScenarios();
const input = (lat = 36.4916, lng = 127.3046): ScoreInput => ({
  lat,
  lng,
  landUse: 'industrial',
  project: defaultProject(data.constants),
  conditions: emptyConditions(),
  restrictions: { hits: [], queried: ['all'], failed: [], complete: true },
  disaster: {
    found: false,
    layer: 'LT_C_UP201',
    coordinate: { lat, lng },
    hits: [],
  },
  zoning: {
    found: true,
    layer: 'test',
    name: '공업지역',
    landUse: 'industrial',
    all: [],
  },
});
const evaluate = (
  overrides: Partial<ScoreInput> = {},
  dataset: AppData = data,
) => scoreSite({ ...input(), ...overrides }, dataset);

describe('사업조건 면적·비용', () => {
  it('면적 30,000㎡ / 용적률 200% / 건폐율 50% / 4층 → 최소 대지 15,000㎡', () => {
    const c = {
      ...emptyConditions(),
      plannedAreaM2: 30000,
      landAreaM2: 10000,
      farPct: 200,
      coveragePct: 50,
      floors: 4,
    };
    const r = evaluate({ conditions: c });
    expect(r.area.minimumLandM2).toBe(15000);
    expect(r.area.shortfallM2).toBe(5000);
    expect(r.area.status).toBe('shortfall');
    expect(
      evaluate({ conditions: { ...c, landAreaM2: 15000 } }).area.status,
    ).toBe('fits');
  });
  it.each([null, 0, -1, NaN, Infinity])(
    '잘못된 필수 면적 %s → 계산 보류',
    (landAreaM2) => {
      expect(
        evaluate({
          conditions: {
            ...emptyConditions(),
            landAreaM2,
            plannedAreaM2: 30000,
            farPct: 200,
            coveragePct: 50,
            floors: 4,
          },
        }).area.status,
      ).toBe('unknown');
    },
  );
  it('랙 역산은 IT부하를 사용하고 수전용량으로 대체하지 않는다', () => {
    const p = {
      ...defaultProject(data.constants),
      areaMethod: 'racks' as const,
      targetMw: 40,
      itMw: 20,
      rackKw: 10,
      rackAreaM2: 3,
      whiteSpacePct: 30,
    };
    expect(evaluate({ project: p }).area).toMatchObject({
      racks: 2000,
      requiredAreaM2: 20000,
    });
    expect(
      evaluate({ project: { ...p, itMw: null } }).area.requiredAreaM2,
    ).toBeNull();
    expect(evaluate({ project: { ...p, rackKw: 100 } }).area.racks).toBe(200);
  });
  it('전환은 기존 건물 면적을 비교하고 구조·층고 확인을 남긴다', () => {
    const r = evaluate({
      project: { ...defaultProject(data.constants), development: 'conversion' },
      conditions: {
        ...emptyConditions(),
        plannedAreaM2: 10000,
        existingAreaM2: 8000,
      },
    });
    expect(r.area).toMatchObject({
      status: 'shortfall',
      shortfallM2: 2000,
      minimumLandM2: null,
    });
    expect(r.review.actions.join(' ')).toContain('구조하중');
  });
  it('차입잔액 1,000억원·연 6%·12개월 → 60억원, 사업비를 대신 사용하지 않는다', () => {
    const p = {
      ...defaultProject(data.constants),
      rates: [0.06, 0.06, 0.06] as [number, number, number],
    };
    const r = evaluate({
      project: p,
      conditions: { ...emptyConditions(), averageDebtKrw: 1e11 },
    });
    expect(r.finance.cells.find((c) => c.months === 12)?.costKrw).toBe(6e9);
    expect(
      evaluate({ capexKrw: 5e11 }).finance.cells.every(
        (c) => c.costKrw === null,
      ),
    ).toBe(true);
  });
  it('미입력 비용과 명시적 0을 구분하며 총액과 항목을 중복 합산하지 않는다', () => {
    const c = emptyConditions();
    c.costs.land = 1e10;
    expect(evaluate({ conditions: c }).businessCost).toMatchObject({
      amountKrw: 1e10,
      complete: false,
      comparisonKey: null,
    });
    c.costs = {
      land: 1e10,
      building: 2e10,
      civil: 0,
      power: 0,
      telecom: 0,
      other: 0,
    };
    expect(evaluate({ conditions: c }).businessCost).toMatchObject({
      amountKrw: 3e10,
      complete: true,
    });
    expect(
      evaluate({ conditions: { ...c, costMode: 'total', totalCostKrw: 4e10 } })
        .businessCost.amountKrw,
    ).toBe(4e10);
  });
});

describe('공개자료와 판단의 한계', () => {
  it('유형·수전규모는 참고점수에 임의 보정을 만들지 않는다', () => {
    const scores = (['small', 'standard', 'hyperscale'] as const).map((type) =>
      evaluate({
        project: { ...defaultProject(data.constants), type, targetMw: 40 },
      }),
    );
    expect(new Set(scores.map((r) => r.composite.score)).size).toBe(1);
    expect(JSON.stringify(scores)).not.toContain('40MW 이상 검토 가능');
  });
  it('뉴스·사례를 삭제해도 점수는 같고 주민수용성 등급을 생성하지 않는다', () => {
    const before = evaluate();
    const after = evaluate({}, { ...data, cases: [], newsSignal: null });
    expect(before.composite.score).toBe(after.composite.score);
    expect(
      before.permit.deductions.some((d) => /사례|뉴스/.test(d.label)),
    ).toBe(false);
    expect(before.permit).not.toHaveProperty('conflictRisk');
  });
  it('변전소 미등재·미조회는 D 상한 대신 미산정', () => {
    const r = evaluate({}, { ...data, emdPower: [] });
    expect(r.composite.score).toBeNull();
    expect(r.composite.grade).toBeNull();
    expect(r.review.label).not.toBe('부적합');
  });
  it('재해·규제 조회 누락은 미산정이며 안전으로 바뀌지 않는다', () => {
    const r = evaluate({ restrictions: null, disaster: null });
    expect(r.composite.score).toBeNull();
    expect(r.disaster.status).toBe('unknown');
    expect(r.review.tone).not.toBe('good');
  });
  it('가구 누락은 미확인이며 인구와 중복 감점하지 않는다', () => {
    const r = evaluate({}, { ...data, households: null });
    expect(r.permit.householdsNearby).toBeNull();
    expect(r.permit.deductions.some((d) => d.label.includes('가구'))).toBe(
      false,
    );
  });
  it('0가구와 결측가구를 구분한다', () => {
    const file = {
      version: 1,
      source: 'SGIS',
      sourceUrl: '',
      year: 2024,
      spatialUnit: '1km',
      note: '',
      rows: [[36.4916, 127.3046, 0]] as [number, number, number | null][],
    };
    expect(
      evaluate({}, { ...data, households: file }).permit.householdsNearby,
    ).toBe(0);
    file.rows[0][2] = null;
    expect(
      evaluate({}, { ...data, households: file }).permit.householdsNearby,
    ).toBeNull();
  });
  it('전국 가구 자료는 부산·제주·강릉을 포함한다', () => {
    for (const [lat, lng] of [
      [35.18, 129.08],
      [33.5, 126.5],
      [37.75, 128.9],
    ]) {
      expect(
        data.households?.rows.some(
          (r) =>
            Math.abs(r[0] - lat) < 0.1 &&
            Math.abs(r[1] - lng) < 0.1 &&
            r[2] !== null,
        ),
      ).toBe(true);
    }
  });
});

describe('규제·재해·자료 범위 회귀', () => {
  it.each([
    ['북한산', 37.66, 126.98],
    ['지리산', 35.34, 127.73],
    ['설악산', 38.12, 128.47],
  ] as const)('%s 보호구역 E 상한을 유지한다', (_, lat, lng) => {
    const r = scoreSite(input(lat, lng), data);
    expect(r.restriction.level).toBe('prohibited');
    expect(r.composite.grade).toBe('E');
    expect(r.composite.capReason).toBe('restriction');
    expect(r.review.tone).toBe('risk');
    expect(
      r.permit.deductions.filter((d) => d.label === '법적 입지 제한 구역'),
    ).toHaveLength(1);
  });
  it('재해 감점은 15점 한 번이며 추가 E 상한이 없다', () => {
    const base = input();
    const r = evaluate({
      disaster: {
        ...base.disaster!,
        found: true,
        hits: [
          { name: '시험 구역', attributes: {} },
          { name: '시험 구역', attributes: {} },
        ],
      },
    });
    expect(r.disaster.deduction).toBe(15);
    expect(
      r.permit.deductions.filter((d) => d.label === '재해위험지구 검토 필요'),
    ).toHaveLength(1);
    expect(r.composite.capReason).not.toBe('restriction');
  });
  it.each([
    [38, 126.5],
    [35.6, 139.7],
  ])('자료 범위 밖 %s,%s 에 수치 결과를 제공하지 않는다', (lat, lng) => {
    const r = scoreSite(input(lat, lng), data);
    expect(r.site.status).toBe('outside');
    expect(r.composite.score).toBeNull();
    expect(r.composite.grade).toBeNull();
  });
  it('서해는 수역, 송도 매립지는 수역 확정에서 제외한다', () => {
    expect(
      scoreSite({ ...input(37.4, 126.2), zoning: null }, data).site.status,
    ).toBe('sea');
    expect(scoreSite(input(37.4, 126.62), data).site.status).not.toBe('sea');
  });
  it('데모점은 번들 입지 제한 밖이며 세종 경사 경계를 유지한다', () => {
    for (const sc of scenarios) {
      const r = scoreSite(
        { ...input(sc.lat, sc.lng), landUse: sc.landUse },
        data,
      );
      expect(r.restriction.level).not.toBe('prohibited');
    }
    const sc = scenarios.find((s) => s.id === 'sejong-contrast')!;
    expect(
      scoreSite({ ...input(sc.lat, sc.lng), landUse: sc.landUse }, data).terrain
        ?.deduction,
    ).toBeLessThanOrEqual(5);
  });
});

describe('개편 기준 골든 값과 경계 입력', () => {
  it.each([
    ['goyang-deogi', null, null, 9091],
    ['incheon-residential', 32, 'E', 15809],
    ['sejong-contrast', 77, 'B', 4496],
  ] as const)(
    '%s: 규제·재해 조회 없음 확인 조건의 참고값',
    (id, score, grade, households) => {
      const sc = scenarios.find((s) => s.id === id)!;
      const r = scoreSite(
        { ...input(sc.lat, sc.lng), landUse: sc.landUse },
        data,
      );
      expect(r.composite.score).toBe(score);
      expect(r.composite.grade).toBe(grade);
      expect(r.permit.householdsNearby).toBe(households);
    },
  );
  it('용적률·건폐율·층수의 누락과 비정상 범위를 계산하지 않는다', () => {
    const c = {
      ...emptyConditions(),
      plannedAreaM2: 30000,
      landAreaM2: 15000,
      farPct: 200,
      coveragePct: 50,
      floors: 4,
    };
    for (const patch of [
      { farPct: 0 },
      { farPct: -1 },
      { coveragePct: 101 },
      { coveragePct: null },
      { floors: 1.5 },
      { floors: 0 },
      { plannedAreaM2: -1 },
    ]) {
      expect(evaluate({ conditions: { ...c, ...patch } }).area.status).toBe(
        'unknown',
      );
    }
  });
  it('확인 상태만 선택하거나 잘못된 날짜를 입력하면 협의 확인사항을 남긴다', () => {
    const c = emptyConditions();
    c.consultations.water = {
      status: 'confirmed',
      note: '공급기관 검토 중',
      date: '2026-02-30',
    };
    expect(
      evaluate({ conditions: c }).review.issues.some(
        (x) => x.title === '용수 공급조건 확인',
      ),
    ).toBe(true);
    c.consultations.water.date = '2026-09-08';
    expect(
      evaluate({ conditions: c }).review.issues.some(
        (x) => x.title === '용수 공급조건 확인',
      ),
    ).toBe(false);
  });
  it('큰 비용의 범위 초과를 미확인으로 남긴다', () => {
    const r = evaluate({
      conditions: { ...emptyConditions(), averageDebtKrw: Number.MAX_VALUE },
      project: { ...defaultProject(data.constants), rates: [10, 10, 10] },
    });
    expect(r.finance.cells.every((c) => c.costKrw === null)).toBe(true);
    expect(r.finance.missing).toContain('금융비용 계산 범위 초과');
  });
});
