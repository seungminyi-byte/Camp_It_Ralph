import { describe, expect, it } from 'vitest';
import type { ParsedMemo } from '../genai/memoFormat';
import { scoreSite } from '../scoring/engine';
import { CHECKLIST_KEYS } from './checklist';
import { buildReportViewModel, completedReportMemo } from './viewModel';
import { loadAppData, loadScenarios } from '../test/loadData';

const data = loadAppData();
const scenario = loadScenarios().find((item) => item.id === 'sejong-contrast')!;
const site = { lat: scenario.lat, lng: scenario.lng, source: 'coords' as const };

function modelFor(input: Parameters<typeof scoreSite>[0]) {
  const result = scoreSite(input, data);
  return buildReportViewModel({ data, input, result, site });
}

describe('report view model', () => {
  it.each([
    ['manual', { landUseSource: 'manual' as const, zoning: null }, null],
    ['valid auto', { landUseSource: 'auto' as const, zoning: { found: true, layer: 'test', name: '시험 공업지역', landUse: 'industrial' as const, all: [] } }, '시험 공업지역'],
    ['failed auto', { landUseSource: 'auto' as const, zoning: null }, null],
    ['mismatched auto', { landUseSource: 'auto' as const, zoning: { found: true, layer: 'test', name: '시험 주거지역', landUse: 'residential' as const, all: [] } }, null],
    ['omitted source', { zoning: { found: true, layer: 'test', name: '시험 공업지역', landUse: 'industrial' as const, all: [] } }, null],
  ])('%s zoning status and detail come only from engine evidence', (_name, extra, expectedName) => {
    const input = { lat: site.lat, lng: site.lng, landUse: 'industrial' as const, ...extra };
    const model = modelFor(input);
    const row = model.rows.find((item) => item.key === 'permit.landUse')!;
    expect(model.rows.map((item) => item.key)).toEqual([...CHECKLIST_KEYS]);
    expect(row.evidence).toBe(model.zoning?.detail);
    if (expectedName) expect(row.evidence).toContain(expectedName);
    else expect(row.evidence).not.toContain('시험 주거지역');
    expect(row.verdict).toBe(
      model.zoning?.status === 'available'
        ? 'good'
        : model.zoning?.status === 'partial'
          ? 'caution'
          : 'na',
    );
  });

  it('keeps the engine overview order and all actions without a render-time completeness failure', () => {
    const model = modelFor({ lat: site.lat, lng: site.lng, landUse: scenario.landUse });
    expect(model.overview.issues).toEqual(model.result.review.overview.issues.slice(0, 3));
    expect(model.overview.actions).toEqual(model.result.review.overview.actions.slice(0, 3));
    expect(model.rows).toHaveLength(18);
  });

  it('includes only complete, current AI output', () => {
    const complete: ParsedMemo = {
      overall: '확인',
      actions: [],
      caveats: [],
      items: {},
      error: null,
      complete: true,
      openSection: null,
      visible: '확인',
    };
    expect(completedReportMemo(complete, 'done', false)).toBe(complete);
    for (const status of ['streaming', 'error', 'stopped', null] as const) {
      expect(completedReportMemo(complete, status, false)).toBeNull();
    }
    expect(completedReportMemo(complete, 'done', true)).toBeNull();
  });
});
