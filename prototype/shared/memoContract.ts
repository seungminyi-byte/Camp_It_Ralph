/** One set of report item identifiers for the UI and server response schema. */
export const CHECKLIST_KEYS = [
  'power.gate', 'power.distance', 'power.region',
  'permit.landUse', 'permit.population', 'permit.school', 'permit.regulation',
  'permit.restriction', 'permit.disaster', 'permit.cases', 'permit.news', 'permit.delayStat',
  'site.terrain', 'site.landWater', 'site.area', 'cost.business', 'cost.finance', 'infra.consultation',
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
