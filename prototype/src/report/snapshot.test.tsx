// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadAppData } from '../test/loadData';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { scoreSite } from '../scoring/engine';
import { buildChecklist } from './checklist';
import { captureReport } from './snapshot';
import { ChecklistReport, type ReportProps } from '../components/ChecklistReport';
import { reviewGroups } from './presentation';
import { toScoreInput, type CompareEntry, type PinnedSite } from '../compare/pins';
import { restrictionFixture, zoningFixture, disasterFixture } from '../test/onlineFixtures';
const data = loadAppData();
function props(): Omit<ReportProps, 'variant'> {
  const input = { lat: 36.4967, lng: 127.3007, landUse: 'industrial' as const,
    project: { ...defaultProject(data.constants), rates: [0.04, 0.06, 0.08] as [number, number, number], delays: [6, 12, 24] as [number, number, number] },
    conditions: { ...emptyConditions(), plannedAreaM2: 30000, landAreaM2: 10000, farPct: 200, coveragePct: 50, floors: 4, averageDebtKrw: 100000000000, costMode: 'total' as const, totalCostKrw: 200000000000 } };
  const result = scoreSite(input, data);
  return { data, input, result, rows: buildChecklist(result, data, { input, landUseSource: 'manual', zoningName: null }), site: { lat: input.lat, lng: input.lng, source: 'coords', label: '현재 합성 후보' }, landUseSource: 'manual', zoningName: null, memo: null, generatedBy: null, generatedAt: null };
}
function pin(label: string, cost: number, base = props()): CompareEntry {
  const pin: PinnedSite = { id: label, selection: { ...base.site, label }, conditions: { ...base.result.conditions, totalCostKrw: cost }, landUse: base.input.landUse, manualLandUse: base.input.landUse, zoning: null, restrictions: null, disaster: null };
  return { pin, result: scoreSite(toScoreInput(pin, base.result.project.assumptions), data) };
}
function dom(p = props()) {
  const box = document.createElement('div');
  box.innerHTML = renderToStaticMarkup(<ChecklistReport {...p} variant="print" />);
  return box;
}
describe('report content and captured state', () => {
  it('preserves independent arithmetic and the exact financial row/column relationship', () => {
    const p = props(), box = dom(p);
    expect(p.result.area.minimumLandM2).toBe(15000); expect(p.result.area.shortfallM2).toBe(5000);
    const rows = [...box.querySelectorAll('.sensitivity-table tbody tr')];
    expect(rows[1].querySelector('th')?.textContent).toBe('6%');
    expect(box.querySelectorAll('.sensitivity-table thead th')[2].textContent).toBe('12개월');
    expect(rows[1].querySelectorAll('td')[1].textContent).toBe('60억원');
    expect(rows[0].querySelectorAll('td')[1].textContent).toBe('40억원');
    expect(box.querySelector('.report-first-page')?.textContent).toContain('15,000㎡');
    expect(box.querySelector('.report-first-page')?.textContent).toContain('5,000㎡');
  });
  it.each([0, 1, 4])('first page has five essentials and only the actual %i pins', count => {
    const p = props(); p.entries = Array.from({ length: count }, (_, i) => pin(`후보 ${i + 1}`, 200000000000 + i * 10000000000));
    const first = dom(p).querySelector('.report-first-page')!;
    for (const title of ['후보 위치', '확인된 주요 제약', '중요한 미확인', '담은 후보 비교 요약', '다음 확인사항']) expect(first.textContent).toContain(title);
    expect(first.querySelectorAll('.report-comparison tbody tr')).toHaveLength(count);
    expect(first.textContent).toContain(count ? '현재 후보는 포함되지 않음' : '담은 비교 후보 없음');
    if (count === 1) expect(first.textContent).toContain('2곳 이상');
  });
  it('matches the current pin by opaque id without inventing a fifth row', () => {
    const p = props(); p.entries = [pin('A', 200000000000), pin('B', 230000000000)]; p.currentPinId = 'B';
    const first = dom(p).querySelector('.report-first-page')!;
    expect(first.textContent).toContain('현재 후보가 아래 비교에 포함');
    expect(first.querySelectorAll('.report-comparison tbody tr')).toHaveLength(2);
    expect(first.textContent).toContain('300억원');
  });
  it.each(['incomplete', 'mixed'])('withholds differences for %s costs', mode => {
    const p = props(), second = pin('B', 230000000000); second.pin.conditions.costMode = 'items';
    second.pin.conditions.costs = { land: 1e8, building: 0, civil: 0, power: 0, telecom: mode === 'incomplete' ? null : 0, other: 0 };
    second.result = scoreSite(toScoreInput(second.pin, p.result.project.assumptions), data);
    p.entries = [pin('A', 2e11), second];
    const first = dom(p).querySelector('.report-first-page')!;
    expect(first.textContent).toContain('차액 계산 보류'); expect(first.textContent).not.toContain('최저');
  });
  it('keeps explicit zero distinct from null', () => {
    const p = props(); p.input.conditions = { ...p.result.conditions, averageDebtKrw: 0, totalCostKrw: 0 }; p.result = scoreSite(p.input, data);
    expect(dom(p).querySelector('.report-first-page')?.textContent).toContain('0원');
    p.input.conditions.averageDebtKrw = null; p.input.conditions.totalCostKrw = null; p.result = scoreSite(p.input, data);
    const first = dom(p).querySelector('.report-first-page')?.textContent;
    expect(first).toContain('계산 보류'); expect(first).not.toContain(' 0원');
  });
  it.each([0, 2.5])('does not show computed area for invalid floors %s', floors => {
    const p = props(); p.input.conditions = { ...p.result.conditions, floors }; p.result = scoreSite(p.input, data);
    expect(p.result.area.minimumLandM2).toBeNull();
    const first = dom(p).querySelector('.report-first-page')?.textContent;
    expect(first).toContain('면적 계산 보류'); expect(first).not.toMatch(/NaN|Infinity/);
  });
  it('copies current, comparison, notes, evidence and checklist together without mutating original', () => {
    const p = props(); p.entries = [pin('A', 2e11)]; p.result.conditions.consultations.power.note = '본문'.repeat(1000) + '끝표식'; p.rows[0].evidence = '근거끝';
    const snapshot = captureReport(p, 'revision-1', new Date('2026-09-21T10:00:00Z'));
    p.result.conditions.consultations.power.note = '새 입력'; p.entries[0].pin.selection.label = '새 이름'; p.rows[0].evidence = '새 근거';
    expect(snapshot.result.conditions.consultations.power.note).toContain('끝표식'); expect(snapshot.entries![0].pin.selection.label).toBe('A'); expect(snapshot.rows[0].evidence).toBe('근거끝');
    expect(Object.isFrozen(snapshot.result)).toBe(true);
    const text = dom(snapshot).textContent!; expect(text).toContain('끝표식'); expect(text).toContain('근거끝');
    expect(captureReport(p, 'revision-2').snapshotId).not.toBe(snapshot.snapshotId);
  });
  it('uses capture time for fresh/expired/partial status rather than the later render time', () => {
    const p = props(); p.input.zoning = { ...zoningFixture(), fetchedAt: '2026-09-21T10:00:00.000Z' };
    p.input.restrictions = { ...restrictionFixture(), fetchedAt: '2026-09-21T10:00:00.000Z', complete: false, failed: ['LT_C_UD801'] };
    p.input.disaster = { ...disasterFixture(), fetchedAt: '2026-09-21T10:00:00.000Z' };
    const fresh = captureReport(p, 'fresh', new Date('2026-09-21T10:00:01Z'));
    expect(dom(fresh).querySelector('.report-online-status')?.textContent).toContain('용도지역: 조회 완료');
    expect(dom(fresh).querySelector('.report-online-status')?.textContent).toContain('규제구역: 일부 조회 미완료');
    const expired = captureReport(p, 'expired', new Date('2026-09-21T10:10:01Z'));
    expect(dom(expired).querySelector('.report-online-status')?.textContent).toContain('이전 조회 결과');
    expect(dom(fresh).querySelector('.report-online-status')?.textContent).not.toContain('이전 조회 결과');
  });
  it('preserves the engine action order and partitions issues without adding or losing a judgment', () => {
    const p = props(), groups = reviewGroups(p.result), html = dom(p);
    expect([...groups.constraints, ...groups.unknowns]).toHaveLength(p.result.review.issues.length);
    const lead = html.querySelector('.report-next li')?.textContent;
    expect(lead).toBe(p.result.review.actions[0]);
  });
});
