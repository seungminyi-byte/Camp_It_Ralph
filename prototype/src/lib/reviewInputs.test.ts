import { expect, it } from 'vitest';
import { convertArea, defaultProject, emptyConditions } from './reviewInputs';
import { loadAppData } from '../test/loadData';
const constants = loadAppData().constants;
it('keeps the exact square metre value through a display-unit round trip', () => {
  const factor = constants.scoring.review.m2PerPyeong;
  expect(convertArea(10000, 'm2', 'pyeong', factor)).toBe(3025);
  expect(convertArea(3025, 'pyeong', 'm2', factor)).toBe(10000);
});
it('does not supply fictional project cost, floor area or debt defaults', () => {
  const p = defaultProject(constants);
  const c = emptyConditions();
  expect(p.type).toBe('standard');
  expect(p.itMw).toBeNull();
  expect(p.targetMw).toBeNull();
  expect(c.plannedAreaM2).toBeNull();
  expect(c.averageDebtKrw).toBeNull();
  expect(Object.values(c.costs).every((x) => x === null)).toBe(true);
});
