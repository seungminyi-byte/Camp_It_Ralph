import { describe, expect, it } from 'vitest';
import { loadAppData, loadScenarios } from '../test/loadData';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { scoreSite } from '../scoring/engine';
import { buildChecklist } from '../report/checklist';
import { buildMemoPrompt, promptSizeIssue } from './prompts';
import { memoContextKey } from './memoContext';
import type { ScoreInput } from '../types';
const data = loadAppData();
function build(input: ScoreInput) {
  const result = scoreSite(input, data), context = { site: { lat: input.lat, lng: input.lng, source: 'coords' as const }, landUseSource: 'manual' as const, zoningName: null };
  const rows = buildChecklist(result, data, { input, ...context });
  return { result, rows, prompt: buildMemoPrompt(data, input, result, rows, context) };
}
describe('compact, complete source payloads', () => {
  it.each(loadScenarios())('keeps allowed notes exactly once for $id', scenario => {
    for (const maximum of [false, true]) {
      const conditions = emptyConditions();
      if (maximum) for (const key of ['power', 'water', 'telecom'] as const) conditions.consultations[key].note = key + '가'.repeat(2000 - key.length);
      const { prompt } = build({ lat: scenario.lat, lng: scenario.lng, landUse: scenario.landUse, conditions, project: defaultProject(data.constants) });
      expect(promptSizeIssue(prompt)).toBeNull();
      if (maximum) for (const entry of Object.values(conditions.consultations)) expect(prompt.split(entry.note)).toHaveLength(2);
    }
  });
  it('retains max notes, mixed direct/nearby heritage and partial provenance below the server cap', async () => {
    const scenario = loadScenarios()[2], conditions = emptyConditions();
    for (const key of ['power', 'water', 'telecom'] as const) conditions.consultations[key].note = key + '가'.repeat(2000 - key.length);
    const input: ScoreInput = { lat: scenario.lat, lng: scenario.lng, landUse: scenario.landUse, conditions, project: defaultProject(data.constants),
      restrictions: { hits: [{ layer: 'LT_C_UO301', name: '등록문화재구역', buffered: false }, { layer: 'LT_C_UO301', name: '국가지정문화유산구역', buffered: true }], queried: ['LT_C_UO301', 'LT_C_UO301@500', 'LT_C_UD801'], failed: ['LT_C_UD801'], complete: false, bufferM: 500, fetchedAt: '2026-09-21T10:00:00Z', stale: true, previousFetchedAt: '2026-09-21T09:00:00Z' } };
    const { prompt, result, rows } = build(input);
    expect(promptSizeIssue(prompt)).toBeNull();
    for (const text of ['"level":"review"', '"level":"reference"', '"relation":"direct"', '"relation":"nearby"', '"complete":false', '"stale":true', '"previousFetchedAt":"2026-09-21T09:00:00Z"', '"mappingVersion":"heritage-mapping-20260921-v1"', '"legalReviewedAt":"2026-09-21"', '"effectiveAt":', 'www.law.go.kr']) expect(prompt).toContain(text);
    const before = await memoContextKey(input, result, rows);
    for (const change of [
      { ...result, restriction: { ...result.restriction, mapping: { ...result.restriction.mapping!, mappingVersion: 'changed' } } },
      { ...result, restriction: { ...result.restriction, mapping: { ...result.restriction.mapping!, legalReviewedAt: '2026-09-22' } } },
      { ...result, restriction: { ...result.restriction, hits: result.restriction.hits.map(hit => ({ ...hit, relation: 'nearby' as const })) } },
    ]) expect(await memoContextKey(input, change, rows)).not.toBe(before);
  });
  it('preflights extreme data without truncating or editing the original notes', () => {
    const scenario = loadScenarios()[2], conditions = emptyConditions(); conditions.consultations.power.note = '원문유지'.repeat(6000);
    const { prompt } = build({ lat: scenario.lat, lng: scenario.lng, landUse: scenario.landUse, conditions });
    expect(prompt).toContain(conditions.consultations.power.note); expect(promptSizeIssue(prompt)).toContain('입력은 보존');
  });
});
