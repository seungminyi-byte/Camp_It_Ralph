import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyReview, inputSnapshot, restoreSession, ReviewSessionStore, serializeSession, SESSION_BYTES, SESSION_KEY, SESSION_TTL, STORAGE_WARNING } from './session';
import { defaultProject } from '../lib/reviewInputs';
import { loadAppData } from '../test/loadData';
const now = Date.parse('2026-09-21T10:00:00.000Z');
function fixture() {
  const inputs = emptyReview(); inputs.site = { lat: 37.5, lng: 127, source: 'coords', label: '공개 검증 후보' };
  inputs.conditions.averageDebtKrw = 0; inputs.conditions.landAreaM2 = -1; inputs.conditions.farPct = 0; inputs.conditions.floors = 2.5;
  inputs.projectOverride = defaultProject(loadAppData().constants);
  inputs.pins = Array.from({ length: 4 }, (_, i) => ({ id: `opaque-${i}`, selection: { ...inputs.site! }, conditions: structuredClone(inputs.conditions), manualLandUse: i % 2 ? 'commercial' as const : 'industrial' as const, landUse: 'industrial' as const, zoning: null, restrictions: null, disaster: null }));
  inputs.openedPinId = 'opaque-2'; inputs.areaUnit = 'pyeong'; return inputs;
}
function mutate(change: (v: Record<string, any>) => void) { const raw = JSON.parse(serializeSession(fixture(), now)); change(raw); return restoreSession(JSON.stringify(raw), now); }
function storage() { const map = new Map<string, string>(); return { map, getItem: vi.fn((key: string) => map.get(key) ?? null), setItem: vi.fn((key: string, val: string) => { map.set(key, val); }), removeItem: vi.fn((key: string) => { map.delete(key); }) }; }
afterEach(() => vi.useRealTimers());
describe('fixed S01-S10 input schema', () => {
  it('preserves ordered opaque pins, same-coordinate manual assumptions, 0/null and finite invalid values', () => {
    const original = fixture(), restored = restoreSession(serializeSession(original, now), now).inputs;
    expect(inputSnapshot(restored)).toEqual(inputSnapshot(original));
    expect(restored.conditions).toMatchObject({ averageDebtKrw: 0, landAreaM2: -1, farPct: 0, floors: 2.5, costs: { telecom: null } });
    expect(restored.pins.map(p => p.id)).toEqual(['opaque-0', 'opaque-1', 'opaque-2', 'opaque-3']);
  });
  it.each(['version', 'date', 'expired', 'future', 'number', 'rates', 'note', 'label', 'source', 'consultationDate'])('rejects corrupt top-level %s with notice', kind => {
    const result = mutate(raw => {
      if (kind === 'version') raw.version = 99;
      if (kind === 'date') raw.savedAt = '2026-02-31T00:00:00.000Z';
      if (kind === 'expired') raw.savedAt = new Date(now - SESSION_TTL - 1).toISOString();
      if (kind === 'future') raw.savedAt = new Date(now + 60001).toISOString();
      if (kind === 'number') raw.current.conditions.floors = '4';
      if (kind === 'rates') raw.projectOverride.rates = [4, 5];
      if (kind === 'note') raw.current.conditions.consultations.power.note = '가'.repeat(2001);
      if (kind === 'label') raw.current.selection.label = 'x'.repeat(201);
      if (kind === 'source') raw.current.selection.source = 'guess';
      if (kind === 'consultationDate') raw.current.conditions.consultations.power.date = '2026-02-31';
    });
    expect(result.inputs.site).toBeNull(); expect(result.notice).toContain('복원하지 않았');
  });
  it('measures bytes before parsing and preserves exactly 24 hours', () => {
    expect(restoreSession(serializeSession(fixture(), now), now + SESSION_TTL).inputs.site).not.toBeNull();
    expect(restoreSession('가'.repeat(SESSION_BYTES / 3 + 1), now).inputs.site).toBeNull();
    const data = fixture(); for (const p of [data, ...data.pins]) for (const c of Object.values(p.conditions.consultations)) c.note = '가'.repeat(2000);
    data.site!.label = '나'.repeat(200); for (const p of data.pins) { p.id += '다'.repeat(190); p.selection.label = '라'.repeat(200); }
    expect(() => serializeSession(data, now)).toThrow('size');
  });
  it('excludes only bad, duplicate or fifth pins with notice', () => {
    const result = mutate(raw => { raw.pins[1].conditions.floors = 'invalid'; raw.pins.push(raw.pins[0], { ...raw.pins[2], id: 'fifth' }, { ...raw.pins[2], id: 'sixth' }); });
    expect(result.inputs.pins.map(p => p.id)).toEqual(['opaque-0', 'opaque-2', 'opaque-3', 'fifth']); expect(result.notice).toContain('3개');
  });
  it('never restores unknown properties, auto land use, evidence, score or AI', () => {
    const result = mutate(raw => { raw.ai = 'secret'; raw.current.landUse = 'industrial'; raw.current.manualLandUse = null; raw.current.zoning = { found: true }; raw.pins[0].manualLandUse = null; raw.pins[0].landUse = 'industrial'; raw.pins[0].zoning = { found: true }; raw.pins[0].score = 100; raw.current.conditions.unknown = 'secret'; });
    const saved = serializeSession(result.inputs, now);
    expect(saved).not.toMatch(/secret|zoning|score|landUse"/); expect(result.inputs.pins[0]).toMatchObject({ landUse: 'unknown', zoning: null, restrictions: null, disaster: null });
  });
  it('rejects nonfinite in-memory inputs without altering them', () => {
    const input = fixture(); input.conditions.farPct = Infinity;
    expect(() => serializeSession(input, now)).toThrow(); expect(input.conditions.farPct).toBe(Infinity);
  });
});
describe('S11-S14 storage lifetime', () => {
  it('hydrates synchronously before any write, isolates instances and flushes latest within 250ms', () => {
    vi.useFakeTimers(); const disk = storage(); disk.map.set(SESSION_KEY, serializeSession(fixture()));
    const store = new ReviewSessionStore(() => disk), other = new ReviewSessionStore(() => storage());
    expect(store.snapshot().inputs.pins).toHaveLength(4); expect(disk.setItem).not.toHaveBeenCalled(); expect(other.snapshot().inputs.pins).toHaveLength(0);
    store.update(s => ({ ...s, conditions: { ...s.conditions, averageDebtKrw: 10 } }));
    store.update(s => ({ ...s, conditions: { ...s.conditions, averageDebtKrw: 0 } }));
    vi.advanceTimersByTime(249); expect(disk.setItem).not.toHaveBeenCalled(); vi.advanceTimersByTime(1);
    expect(restoreSession(disk.map.get(SESSION_KEY)!).inputs.conditions.averageDebtKrw).toBe(0);
  });
  it('immediate navigation/pagehide flush stores latest and reset clears only service key atomically', () => {
    vi.useFakeTimers(); const disk = storage(); disk.map.set('other', 'retained'); const store = new ReviewSessionStore(() => disk);
    const revisions: number[] = []; store.subscribe(() => revisions.push(store.snapshot().inputs.selectionRevision));
    store.update(() => fixture()); store.flush(); expect(disk.map.has(SESSION_KEY)).toBe(true);
    store.reset(); store.flush(); vi.advanceTimersByTime(300);
    expect(disk.map.get('other')).toBe('retained'); expect(disk.map.has(SESSION_KEY)).toBe(false); expect(store.snapshot().inputs.pins).toEqual([]); expect(store.snapshot().resetRevision).toBe(1); expect(revisions).toEqual([0, 1]);
  });
  it.each(['get', 'set', 'remove'])('handles %s exceptions honestly', method => {
    const disk = storage(); if (method === 'get') disk.getItem.mockImplementation(() => { throw Error('denied'); });
    const store = new ReviewSessionStore(() => disk);
    if (method === 'set') { disk.setItem.mockImplementation(() => { throw Error('quota'); }); store.update(() => fixture()); store.flush(); expect(store.snapshot().inputs.pins).toHaveLength(4); }
    if (method === 'remove') { disk.removeItem.mockImplementation(() => { throw Error('denied'); }); store.reset(); }
    expect(store.snapshot().notice).toContain(method === 'remove' ? '지우지 못했습니다' : STORAGE_WARNING);
  });
});
