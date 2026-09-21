import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/independent-cases.json';
import { loadAppData, loadScenarios } from '../test/loadData';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { scoreSite } from '../scoring/engine';
import { buildChecklist, CHECKLIST_KEYS, type ChecklistKey } from '../report/checklist';
import { parseMemo } from './memoFormat';
import { buildMemoFacts, isMemoAppendixEligible, validateMemo, validateMemoItem } from './memoValidation';
const data = loadAppData(), scenario = loadScenarios()[2];
const conditions = { ...emptyConditions(), landAreaM2: 10000, plannedAreaM2: 30000, farPct: 200, coveragePct: 50, floors: 4, averageDebtKrw: 1e11 };
conditions.consultations.power = { status: 'confirmed', note: fixture.input.powerConsultationNote, date: '' };
const input = { lat: scenario.lat, lng: scenario.lng, landUse: scenario.landUse, conditions, project: { ...defaultProject(data.constants), rates: [0.06, 0.06, 0.06] as [number,number,number], delays: [12, 12, 12] as [number,number,number] } };
const result = scoreSite(input, data);
const rows = buildChecklist(result, data, { input, landUseSource: 'manual', zoningName: null });
const facts = buildMemoFacts(result, rows, data);
const full = ['## OVERALL\n추가 확인이 필요합니다.', ...CHECKLIST_KEYS.map(key => `## ITEM ${key}\n제공 근거를 확인하세요.`), '## ACTIONS\n- 관할기관에 확인하세요.', '## CAVEATS\n- 스크리닝 참고용입니다.'].join('\n');
describe('root-defined 18 independent cases (fixture expectations unchanged)', () => {
  it.each(fixture.cases)('$id: $expected', ({ id, item, text }) => {
    const parsed = parseMemo(`## ${item === 'OVERALL' ? item : `ITEM ${item}`}\n${text}`);
    const flags = validateMemoItem(item, text, facts[item as ChecklistKey] ?? []);
    if (['A01', 'A03', 'A04'].includes(id)) expect(flags.filter(flag => flag.kind === 'number')).toEqual([]);
    if (['A02', 'A05', 'A06', 'A07', 'A08', 'A16'].includes(id)) expect(flags.some(flag => flag.kind === 'number')).toBe(true);
    if (['A08', 'A10', 'A11', 'A13', 'A14', 'A15'].includes(id)) expect(flags.some(flag => flag.kind === 'claim')).toBe(true);
    if (['A09', 'A12'].includes(id)) expect(flags).toEqual([]);
    if (id === 'A16') expect(flags.some(flag => flag.kind === 'instruction')).toBe(true);
    if (id === 'A17') { expect(parsed.unmapped).toEqual([{ key: 'nonexistent.key', text }]); expect(parsed.items['power.gate']).toBeUndefined(); }
    if (id === 'A18') expect(parsed.items['cost.finance']).toBe(text);
  });
});
describe('meaning and eligibility boundaries', () => {
  it('does not let debt borrow a finance amount, or a missing component borrow zero', () => {
    expect(validateMemoItem('cost.finance', '차입잔액은 60억원입니다.', facts['cost.finance'])).not.toEqual([]);
    const changed = scoreSite({ ...input, conditions: { ...conditions, costs: { ...conditions.costs, land: 0 } } }, data);
    expect(validateMemoItem('cost.business', '전력 인입비는 0원입니다.', buildMemoFacts(changed, rows, data)['cost.business'])).not.toEqual([]);
  });
  it('ignores dates, legal articles, address identifiers and list ordinals', () => {
    expect(validateMemoItem('permit.restriction', '2026-09-21 기준 제35조 제1항 제2호를 확인하세요.\n1. 123번지 주소를 확인하세요.', [])).toEqual([]);
    expect(validateMemoItem('permit.restriction', '2024.12 기준 제35조의2를 확인하세요. 세종대로 110 주소입니다.', [])).toEqual([]);
    expect(validateMemoItem('permit.restriction', '500m 이내입니다.', [])).not.toEqual([]);
  });
  it('does not label complete structure as verification', () => {
    const parsed = parseMemo(full);
    expect(parsed.complete).toBe(true);
    const flags = validateMemo(parsed, facts);
    expect(flags).toEqual([]);
    expect(isMemoAppendixEligible(parsed, 'done', true, flags)).toBe(true);
    for (const status of ['streaming', 'stopped', 'error'] as const) expect(isMemoAppendixEligible(parsed, status, true, flags)).toBe(false);
    expect(isMemoAppendixEligible(parsed, 'done', false, [])).toBe(false);
    expect(isMemoAppendixEligible(parseMemo(full + '\n## ERROR\nUPSTREAM_INCOMPLETE'), 'done', true, [])).toBe(false);
    expect(isMemoAppendixEligible(parseMemo(full + '\n## ITEM missing.key\n확인'), 'done', true, [])).toBe(false);
    expect(isMemoAppendixEligible(parseMemo(full + '\n## ITEM power.gate\n확인'), 'done', true, [])).toBe(false);
    expect(isMemoAppendixEligible(parseMemo(''), 'done', true, [])).toBe(false);
  });
  it('blocks unreviewed narrative numbers even if they appear in a different item', () => {
    const parsed = parseMemo(full.replace('추가 확인이 필요합니다.', '금융비용은 60억원입니다.'));
    expect(validateMemo(parsed, facts).some(flag => flag.section === 'OVERALL')).toBe(true);
  });
});

describe('independent review counterexamples', () => {
  it('keeps finance costs tied to the explicitly stated rate and months', () => {
    const changed = scoreSite({ ...input, project: { ...input.project, rates: [0.04, 0.06, 0.08], delays: [6, 12, 24] } }, data);
    const finance = buildMemoFacts(changed, rows, data)['cost.finance'];
    expect(validateMemoItem('cost.finance', '연 6%·12개월 금융비용은 60억원입니다.', finance)).toEqual([]);
    expect(validateMemoItem('cost.finance', '연 6%·12개월 금융비용은 80억원입니다.', finance).some(flag => flag.kind === 'number')).toBe(true);
    expect(validateMemoItem('cost.finance', '연 6% 금융비용은 60억원입니다.', finance).some(flag => flag.kind === 'number')).toBe(true);
    expect(validateMemoItem('cost.finance', '연 6% 또는 8%·12개월 금융비용은 60억원입니다.', finance).some(flag => flag.kind === 'number')).toBe(true);
  });
  it('uses the most specific cost name and preserves a missing telecom cost', () => {
    const changed = scoreSite({ ...input, conditions: { ...conditions, costs: { ...conditions.costs, power: 0 } } }, data);
    const business = buildMemoFacts(changed, rows, data)['cost.business'];
    expect(validateMemoItem('cost.business', '전력 인입비는 0원입니다.', business)).toEqual([]);
    expect(validateMemoItem('cost.business', '통신 인입비는 0원입니다.', business).some(flag => flag.kind === 'number')).toBe(true);
  });
  it('does not let a negative approval clause hide a positive supply assertion', () => {
    for (const text of ['한전 승인이 없지만 공급은 보장됩니다.', '한전 승인 없이도 공급이 보장됩니다.', '한전 승인이 없으나 공급은 보장됩니다.']) {
      expect(validateMemoItem('power.gate', text, facts['power.gate']).some(flag => flag.kind === 'claim')).toBe(true);
    }
  });
});

describe('display label and unit meaning', () => {
  it('distinguishes the displayed minimum-land label from required building area', () => {
    expect(validateMemoItem('site.area', '이론상 최소 대지면적은 15,000㎡입니다.', facts['site.area'])).toEqual([]);
    expect(validateMemoItem('site.area', '이론상 최소 대지면적은 30,000㎡입니다.', facts['site.area'])).not.toEqual([]);
  });
  it('does not substitute household totals for people counts', () => {
    expect(validateMemoItem('permit.population', '4,496명입니다.', facts['permit.population'])).not.toEqual([]);
    expect(validateMemoItem('permit.population', '4,496가구입니다.', facts['permit.population'])).toEqual([]);
  });
});
