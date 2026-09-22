import { describe, expect, it, vi, afterEach } from 'vitest';
import { exampleFromSearch, exampleInputs } from './examples';
import { ReviewSessionStore, restoreSession, SESSION_KEY } from './session';
import { loadAppData } from '../test/loadData';
import { scoreSite } from '../scoring/engine';
import { toScoreInput } from '../compare/pins';

const data = loadAppData();
afterEach(() => vi.useRealTimers());
describe('explicit fictional business examples', () => {
  it('loads only known example links and never fabricates public observations', () => {
    expect(exampleFromSearch('?example=area')).toBe('area');
    expect(exampleFromSearch('?example=compare')).toBe('compare');
    expect(exampleFromSearch('?example=other')).toBeNull();
    const inputs = exampleInputs('compare', data.constants);
    expect(inputs.pins).toHaveLength(2);
    for (const pin of inputs.pins) {
      expect(pin.selection.label).toContain('가상');
      expect(pin).toMatchObject({ manualLandUse: null, landUse: 'unknown', zoning: null, restrictions: null, disaster: null });
      expect(scoreSite(toScoreInput(pin, inputs.projectOverride!), data).composite.score).toBeNull();
    }
  });
  it('shows a 5000 sqm shortfall, fixes it at 15000 and compares distinct fictional costs', () => {
    const inputs = exampleInputs('compare', data.constants);
    const a = toScoreInput(inputs.pins[0], inputs.projectOverride!);
    const result = scoreSite(a, data);
    expect(result.area).toMatchObject({ status: 'shortfall', minimumLandM2: 15000, shortfallM2: 5000 });
    expect(scoreSite({ ...a, conditions: { ...a.conditions!, landAreaM2: 15000 } }, data).area.status).toBe('fits');
    const b = scoreSite(toScoreInput(inputs.pins[1], inputs.projectOverride!), data);
    expect(b.area.status).toBe('fits');
    expect(b.businessCost.amountKrw! - result.businessCost.amountKrw!).toBe(200e8);
  });
  it('keeps prior review persisted through edits, reload and repeated examples; exit restores it', () => {
    vi.useFakeTimers();
    const values = new Map<string, string>();
    const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
    const store = new ReviewSessionStore(() => storage);
    store.update(s => ({ ...s, site: { lat: 37.5, lng: 127, source: 'coords', label: '기존 검토' }, conditions: { ...s.conditions, landAreaM2: 12345 } }));
    store.beginExample(exampleInputs('area', data.constants));
    store.update(s => ({ ...s, conditions: { ...s.conditions, landAreaM2: 15000 } }));
    store.beginExample(exampleInputs('compare', data.constants));
    store.flush();
    expect(restoreSession(values.get(SESSION_KEY)!).inputs.site?.label).toBe('기존 검토');
    expect(new ReviewSessionStore(() => storage).snapshot().inputs.conditions.landAreaM2).toBe(12345);
    store.endExample();
    expect(store.snapshot().inputs.site?.label).toBe('기존 검토');
    expect(store.snapshot().inputs.exampleMode).toBeUndefined();
    expect(store.snapshot().inputs.conditions.landAreaM2).toBe(12345);
    store.beginExample(exampleInputs('area', data.constants));
    store.reset();
    store.endExample();
    expect(store.snapshot().inputs.site).toBeNull();
  });
});
