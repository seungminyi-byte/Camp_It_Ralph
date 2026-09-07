import { describe, expect, it } from 'vitest';
import { scoreSite } from '../scoring/engine';
import { loadAppData, loadScenarios } from '../test/loadData';
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
const fin = data.constants.scoring.finance;

function pin(lat: number, lng: number, landUse: LandUse = 'unknown'): PinnedSite {
  const base = { selection: { lat, lng, source: 'map' as const }, landUse };
  return { id: pinId(base), ...base, manualLandUse: landUse === 'unknown' ? null : landUse, zoning: null, restrictions: null, disaster: null };
}

describe('pinId', () => {
  it('rounds coordinates to 5 decimals and separates land use', () => {
    expect(pinId(pin(37.123456789, 127.1))).toBe('37.12346,127.10000|unknown');
    expect(pinId(pin(37.1, 127.1, 'industrial'))).not.toBe(pinId(pin(37.1, 127.1, 'unknown')));
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
    const full = Array.from({ length: MAX_PINS }, (_, i) => pin(37 + i * 0.1, 127));
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

describe('toScoreInput', () => {
  it('carries the location facts and takes capex/rate from the caller', () => {
    const p = pin(37.1, 127.1, 'industrial');
    const input = toScoreInput(p, 123, 0.07, 'small');
    expect(input).toMatchObject({ lat: 37.1, lng: 127.1, landUse: 'industrial', projectType: 'small', capexKrw: 123, annualRate: 0.07 });
  });
  it('keeps regulatory and disaster evidence when all project assumptions change', () => {
    const sc = scenarios[2];
    const p = pin(sc.lat, sc.lng, sc.landUse);
    p.restrictions = { hits: [{ layer: 'LT_C_UD801', name: '개발제한구역', buffered: false }], queried: ['LT_C_UD801'], failed: [], complete: true };
    p.disaster = { found: true, layer: 'LT_C_UP201', coordinate: { lat: sc.lat, lng: sc.lng }, hits: [{ name: '시험지구', attributes: {} }] };
    for (const type of ['small', 'standard', 'hyperscale'] as const) {
      const input = toScoreInput(p, 1e12, 0.07, type);
      const result = scoreSite(input, data);
      expect(input.restrictions).toBe(p.restrictions);
      expect(input.disaster).toBe(p.disaster);
      expect(result.composite.capReason).toBe('restriction');
      expect(result.disaster.deduction).toBe(15);
      expect(result.project.type).toBe(type);
      expect(result.finance.monthlyCostKrw).toBeCloseTo(1e12 * 0.07 / 12);
    }
  });
});

describe('compareSummary', () => {
  const entries: CompareEntry[] = scenarios.map((sc) => {
    const p = pin(sc.lat, sc.lng, sc.landUse);
    return { pin: p, result: scoreSite(toScoreInput(p, fin.defaultCapexKrw, fin.defaultAnnualRate, 'standard'), data) };
  });

  it('needs at least two entries', () => {
    expect(compareSummary([])).toBeNull();
    expect(compareSummary(entries.slice(0, 1))).toBeNull();
  });

  it('finds 세종 cheapest and reports the spread the demo closes on', () => {
    const s = compareSummary(entries)!;
    const sejong = entries.find((e) => e.result.emd?.sido === '세종특별자치시')!;
    expect(s.cheapest.pin.id).toBe(sejong.pin.id);
    expect(s.diffKrw).toBe(s.costliest.result.finance.delayCostKrw - s.cheapest.result.finance.delayCostKrw);
    expect(s.diffMonths).toBe(s.costliest.result.delay.pointMonths - s.cheapest.result.delay.pointMonths);
    // "위치만 바꾸면 수백억 차이" — guard the narrative without hard-coding today's exact figure
    expect(s.diffKrw).toBeGreaterThanOrEqual(300e8);
  });
});
