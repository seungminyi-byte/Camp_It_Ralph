import { describe, expect, it } from 'vitest';
import { loadAppData, loadScenarios } from '../test/loadData';
import { scoreSite } from '../scoring/engine';
import { buildChecklist } from '../report/checklist';
import type { ScoreInput } from '../types';
import { memoContextKey, sameMemoInput } from './memoContext';

const data = loadAppData();
const sc = loadScenarios()[2];
const input: ScoreInput = { lat: sc.lat, lng: sc.lng, landUse: sc.landUse, projectType: 'standard', capexKrw: 5e11, annualRate: 0.055 };
const key = async (at: ScoreInput) => {
  const result = scoreSite(at, data);
  return memoContextKey(at, result, buildChecklist(result, data, { input: at, landUseSource: 'manual', zoningName: null }));
};

describe('memo evaluation context', () => {
  it('matches equivalent absent lookups and ignores property insertion order', async () => {
    expect(sameMemoInput(input, { ...input, disaster: null })).toBe(true);
    expect(await key({ ...input, disaster: null })).toBe(await key(input));
  });
  it('invalidates opinions when project, cost, or late disaster evidence changes', async () => {
    const before = await key(input);
    for (const changed of [
      { ...input, projectType: 'hyperscale' as const },
      { ...input, capexKrw: 1e12 },
      { ...input, disaster: { found: false, layer: 'LT_C_UP201' as const, coordinate: { lat: sc.lat, lng: sc.lng }, hits: [] } },
    ]) {
      expect(sameMemoInput(input, changed)).toBe(false);
      expect(await key(changed)).not.toBe(before);
    }
  });
});
