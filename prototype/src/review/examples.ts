import type { Constants, SiteConditions } from '../types';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { emptyReview, type ReviewInputs } from './session';

export type ReviewExample = 'area' | 'compare';
export function exampleFromSearch(search: string): ReviewExample | null {
  const value = new URLSearchParams(search).get('example');
  return value === 'area' || value === 'compare' ? value : null;
}
/** All business inputs are fictional. Online evidence is deliberately empty and fetched normally. */
export function exampleInputs(kind: ReviewExample, constants: Constants): ReviewInputs {
  const conditions = (second = false): SiteConditions => ({
    ...emptyConditions(), landAreaM2: second ? 20000 : 10000, plannedAreaM2: 30000,
    farPct: 200, coveragePct: 50, floors: 4, costMode: 'total',
    totalCostKrw: second ? 2200e8 : 2000e8, averageDebtKrw: second ? 1200e8 : 1000e8,
  });
  const pins = [0, ...(kind === 'compare' ? [1] : [])].map(i => ({
    id: `example-${i === 0 ? 'a' : 'b'}`,
    selection: { lat: i === 0 ? 36.4967 : 36.5067, lng: 127.3007, source: 'coords' as const,
      label: `가상 부지 ${i === 0 ? 'A' : 'B'} · 가상 면적·가격 조건` },
    conditions: conditions(i === 1), manualLandUse: null, landUse: 'unknown' as const,
    zoning: null, restrictions: null, disaster: null,
  }));
  return { ...emptyReview(), exampleMode: kind, site: pins[0].selection,
    conditions: pins[0].conditions, projectOverride: { ...defaultProject(constants), targetMw: 40, rates: [0.04, 0.06, 0.08] },
    pins, openedPinId: pins[0].id };
}
