import { describe, expect, it } from 'vitest';
import { scoreSite } from '../scoring/engine';
import { loadAppData, loadScenarios } from '../test/loadData';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import type { LandUse } from '../types';
import {
  MAX_PINS,
  compareSummary,
  pinId,
  removePin,
  toScoreInput,
  togglePin,
  type CompareEntry,
  type PinnedSite,
} from './pins';

const data = loadAppData();
const scenarios = loadScenarios();
const project = defaultProject(data.constants);

function pin(
  lat: number,
  lng: number,
  landUse: LandUse = 'unknown',
): PinnedSite {
  const base = { selection: { lat, lng, source: 'map' as const }, landUse };
  return {
    conditions: emptyConditions(),
    id: pinId(base),
    ...base,
    manualLandUse: landUse === 'unknown' ? null : landUse,
    zoning: null,
    restrictions: null,
    disaster: null,
  };
}

describe('pinId', () => {
  it('rounds coordinates to 5 decimals and separates land use', () => {
    expect(pinId(pin(37.123456789, 127.1))).toBe('37.12346,127.10000|unknown');
    expect(pinId(pin(37.1, 127.1, 'industrial'))).not.toBe(
      pinId(pin(37.1, 127.1, 'unknown')),
    );
  });
});

describe('togglePin / removePin', () => {
  const a = pin(37.1, 127.1);
  const b = pin(37.2, 127.2);

  it('adds, then removes the same pin on a second toggle', () => {
    const once = togglePin([], a);
    expect(once.map((p) => p.id)).toEqual([a.id]);
    expect(togglePin(once, a)).toEqual([]);
  });

  it('refuses a new pin when the tray is full and returns the same array', () => {
    const full = Array.from({ length: MAX_PINS }, (_, i) =>
      pin(37 + i * 0.1, 127),
    );
    const next = togglePin(full, b);
    expect(next).toBe(full);
    // but an already-pinned site can still be removed from a full tray
    expect(togglePin(full, full[0])).toHaveLength(MAX_PINS - 1);
  });

  it('removePin leaves the array untouched for an unknown id', () => {
    const pins = [a, b];
    expect(removePin(pins, 'nope')).toBe(pins);
    expect(removePin(pins, a.id).map((p) => p.id)).toEqual([b.id]);
  });
});

describe('common assumptions and separate site conditions', () => {
  it('applies project changes without replacing site costs, area or evidence', () => {
    const sc = scenarios[2];
    const p = pin(sc.lat, sc.lng, sc.landUse);
    p.conditions.landAreaM2 = 12345;
    p.conditions.averageDebtKrw = 1e11;
    p.conditions.costs.land = 456e8;
    p.restrictions = {
      hits: [{ layer: 'LT_C_UD801', name: '개발제한구역', buffered: false }],
      queried: ['LT_C_UD801'],
      failed: [],
      complete: true,
    };
    p.disaster = {
      found: true,
      layer: 'LT_C_UP201',
      coordinate: { lat: sc.lat, lng: sc.lng },
      hits: [{ name: '시험지구', attributes: {} }],
    };
    for (const type of ['small', 'standard', 'hyperscale'] as const) {
      const changed = { ...project, type, businessType: 'ai' as const, targetMw: 40 };
      const input = toScoreInput(p, changed);
      const result = scoreSite(input, data);
      expect(input.conditions).toBe(p.conditions);
      expect(input.restrictions).toBe(p.restrictions);
      expect(result.conditions.costs.land).toBe(456e8);
      expect(result.conditions.landAreaM2).toBe(12345);
      expect(result.composite.capReason).toBe('restriction');
      expect(result.disaster.deduction).toBe(15);
      expect(result.project.assumptions.targetMw).toBe(40);
      expect(result.project.assumptions.businessType).toBe('ai');
    }
  });
});
describe('comparable complete business costs', () => {
  const entry = (
    amount: number | null,
    mode: 'total' | 'items' = 'total',
  ): CompareEntry => {
    const p = pin(36.49, 127.3);
    p.conditions.costMode = mode;
    p.conditions.totalCostKrw = amount;
    return { pin: p, result: scoreSite(toScoreInput(p, project), data) };
  };
  it('subtracts engine totals only within a complete identical scope', () => {
    expect(compareSummary([entry(100e8), entry(180e8)])?.diffKrw).toBe(80e8);
  });
  it('never treats a missing line entry as the cheapest candidate', () => {
    expect(compareSummary([entry(100e8), entry(null, 'items')])).toBeNull();
    expect(compareSummary([entry(100e8), entry(null)])).toBeNull();
    expect(compareSummary([entry(100e8)])).toBeNull();
  });
  it('does not compare item sums to directly entered totals', () => {
    const a = entry(100e8);
    const b = entry(null, 'items');
    for (const key of Object.keys(
      b.pin.conditions.costs,
    ) as (keyof typeof b.pin.conditions.costs)[])
      b.pin.conditions.costs[key] = 0;
    b.result = scoreSite(toScoreInput(b.pin, project), data);
    expect(b.result.businessCost.complete).toBe(true);
    expect(compareSummary([a, b])).toBeNull();
  });
});
