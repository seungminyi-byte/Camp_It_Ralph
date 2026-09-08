import { describe, expect, it } from 'vitest';
import { loadAppData, loadScenarios } from '../test/loadData';
import { scoreSite } from '../scoring/engine';
import { buildChecklist } from '../report/checklist';
import type { ScoreInput } from '../types';
import { memoContextKey, sameMemoInput } from './memoContext';

const data = loadAppData();
const sc = loadScenarios()[2];
const input: ScoreInput = {
  lat: sc.lat,
  lng: sc.lng,
  landUse: sc.landUse,
  projectType: 'standard',
  capexKrw: 5e11,
  annualRate: 0.055,
};
const key = async (at: ScoreInput) => {
  const result = scoreSite(at, data);
  return memoContextKey(
    at,
    result,
    buildChecklist(result, data, {
      input: at,
      landUseSource: 'manual',
      zoningName: null,
    }),
  );
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
      {
        ...input,
        disaster: {
          found: false,
          layer: 'LT_C_UP201' as const,
          coordinate: { lat: sc.lat, lng: sc.lng },
          hits: [],
        },
      },
    ]) {
      expect(sameMemoInput(input, changed)).toBe(false);
      expect(await key(changed)).not.toBe(before);
    }
  });
});

describe('new business and public evidence signatures', () => {
  it('invalidates for scale and business type independently', async () => {
    const project = scoreSite(input, data).project.assumptions;
    const at = { ...input, project };
    const before = await key(at);
    for (const changed of [
      { ...at, project: { ...project, type: 'hyperscale' as const } },
      { ...at, project: { ...project, businessType: 'ai' as const } },
    ]) {
      expect(sameMemoInput(at, changed)).toBe(false);
      expect(await key(changed)).not.toBe(before);
    }
  });
  it('invalidates when source processing changes without changing nearby counts', async () => {
    const before = await key(input);
    const changedData = {
      ...data,
      households: { ...data.households!, pipelineVersion: 'p09-v2' },
    };
    const changed = scoreSite(input, changedData);
    expect(changed.permit.householdsNearby).toBe(
      scoreSite(input, data).permit.householdsNearby,
    );
    expect(
      await memoContextKey(
        input,
        changed,
        buildChecklist(changed, changedData, {
          input,
          landUseSource: 'manual',
          zoningName: null,
        }),
      ),
    ).not.toBe(before);
  });
  it('invalidates on household data changes even with identical user input', async () => {
    const r = scoreSite(input, data);
    const rows = buildChecklist(r, data, {
      input,
      landUseSource: 'manual',
      zoningName: null,
    });
    const before = await memoContextKey(input, r, rows);
    const changed = scoreSite(input, { ...data, households: null });
    expect(
      await memoContextKey(
        input,
        changed,
        buildChecklist(changed, data, {
          input,
          landUseSource: 'manual',
          zoningName: null,
        }),
      ),
    ).not.toBe(before);
  });
  it('invalidates on a site-specific consultation change or a shared design change', async () => {
    const r = scoreSite(input, data);
    const at = {
      ...input,
      project: r.project.assumptions,
      conditions: r.conditions,
    };
    const before = await key(at);
    const changed = {
      ...at,
      conditions: {
        ...at.conditions,
        consultations: {
          ...at.conditions.consultations,
          water: {
            status: 'discussing' as const,
            note: '검토 중',
            date: '2026-09-08',
          },
        },
      },
    };
    expect(sameMemoInput(at, changed)).toBe(false);
    expect(await key(changed)).not.toBe(before);
    expect(
      await key({ ...at, project: { ...at.project, rackKw: 80 } }),
    ).not.toBe(before);
  });
});
