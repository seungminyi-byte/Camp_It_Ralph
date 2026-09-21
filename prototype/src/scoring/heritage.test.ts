import { describe, expect, it, vi } from 'vitest';
import type { AppData, ProjectAssumptions, RestrictionLookup, ScoreInput } from '../types';
import { loadAppData } from '../test/loadData';
import { buildChecklist } from '../report/checklist';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { buildMemoPrompt } from '../genai/prompts';
import { memoContextKey } from '../genai/memoContext';
import { pinId, toScoreInput, type PinnedSite } from '../compare/pins';
import { scoreSite } from './engine';
import { lookupRestrictions, summarizeRestriction } from './restriction';

// Expectations fixed from the independently reviewed 03L section 7, before implementation.
const data = loadAppData();
const emptyZones = { ...data, protectedZones: { ...data.protectedZones!, zones: [] } };
const heritage = (name: string | null = '등록문화재구역', buffered = false) => ({ layer: 'LT_C_UO301', name, buffered });
const prohibited = { layer: 'LT_C_UD801', name: '개발제한구역', buffered: false };
const conditional = { layer: 'LT_C_AGRIXUE101', name: '농업보호구역', buffered: false };
const lookup = (hits: RestrictionLookup['hits'] = [], failed: string[] = [], bufferM = 500): RestrictionLookup => ({
  hits, queried: ['LT_C_UD801', 'LT_C_UO301', ...(bufferM > 0 ? [`LT_C_UO301@${bufferM}`] : [])],
  failed, complete: failed.length === 0, bufferM,
});

describe('heritage provenance and consumer boundaries', () => {
  it('normalizes only whitespace and provincial punctuation, preserving raw names', () => {
    const r = evaluate([heritage(' 시ㆍ도 등록 문화유산 구역 ')]);
    expectReview(r);
    expect(r.restriction.hits[0].type).toBe('시·도등록문화유산 관련 구역');
    expect(r.restriction.hits[0].rawName).toBe(' 시ㆍ도 등록 문화유산 구역 ');
    for (const name of ['임시등록문화유산구역', '임시지정문화재구역']) {
      expect(evaluate([heritage(name)]).restriction.hits[0].type).toBe('국가유산 임시 유형 확인 필요');
    }
  });
  it('holds legal review apart from transport completeness and distinct dates', () => {
    const at = input({ ...lookup([heritage()]), fetchedAt: '2026-09-21T09:10:00Z' });
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-21T09:11:00Z'));
    const r = scoreSite(at, emptyZones);
    now.mockRestore();
    expect(r.restriction.checked.vworld).toBe('ok');
    expect(r.evidence.find(e => e.key === 'restrictions')?.status).toBe('partial');
    const evidence = row(r).evidence;
    expect(evidence).toContain('법령 검토 기준일 2026-09-21');
    expect(evidence).toContain('시행 2026-08-28');
    expect(evidence).toContain('API 조회 2026-09-21T09:10:00Z');
    expect(evidence).toContain('VWorld 문서 갱신 2026-09-17');
    expect(summarizeRestriction(r.restriction)).not.toContain('시행 2026-08-28');
  });
  it('uses queried radius as fallback and explicit zero before all fallbacks', () => {
    const cfg = data.constants.scoring.restriction;
    const withoutBufferField = { ...lookup([heritage(undefined, true)], [], 1000), bufferM: undefined };
    expect(summarizeRestriction(lookupRestrictions(emptyZones.protectedZones, withoutBufferField, 36.5, 127.3, cfg))).toContain('1000m');
    expect(lookupRestrictions(emptyZones.protectedZones, { ...withoutBufferField, bufferM: 0 }, 36.5, 127.3, cfg).hits).toEqual([]);
  });
  it('retains an incomplete flag even when the failed array is empty', () => {
    const r = scoreSite(input({ ...lookup([prohibited]), complete: false }), emptyZones);
    expect(r.restriction.checked.vworld).toBe('partial');
    expect(r.composite).toMatchObject({ score: null, grade: 'E', capReason: 'restriction' });
  });
  it('comparison, report and AI keep review and preserve area, finance and null versus zero', async () => {
    const at = input(lookup([heritage(), heritage(undefined, true)]));
    const project: ProjectAssumptions = { ...defaultProject(data.constants), rates: [0.06, 0.06, 0.06], delays: [12, 12, 12] };
    const conditions = { ...emptyConditions(), landAreaM2: 10000, plannedAreaM2: 30000, farPct: 200, coveragePct: 50, floors: 4, averageDebtKrw: 1e11 };
    const pinBase = { selection: { lat: at.lat, lng: at.lng, source: 'map' as const }, landUse: at.landUse };
    const pin: PinnedSite = { ...pinBase, id: pinId(pinBase), conditions, manualLandUse: at.landUse, zoning: null, disaster: at.disaster!, restrictions: at.restrictions! };
    const compared = scoreSite(toScoreInput(pin, project), emptyZones);
    expect(compared.restriction.hits).toHaveLength(2); expect(compared.composite.score).toBeNull();
    expect(compared.area.minimumLandM2).toBe(15000); expect(compared.area.shortfallM2).toBe(5000);
    expect(compared.finance.cells.find(c => c.annualRate === 0.06 && c.months === 12)?.costKrw).toBe(6e9);
    expect(scoreSite({ ...at, project, conditions: { ...conditions, averageDebtKrw: null } }, emptyZones).finance.cells.every(c => c.costKrw === null)).toBe(true);
    expect(scoreSite({ ...at, project, conditions: { ...conditions, averageDebtKrw: 0 } }, emptyZones).finance.cells.every(c => c.costKrw === 0)).toBe(true);
    const rows = buildChecklist(compared, emptyZones, { input: at, landUseSource: 'manual', zoningName: null });
    const prompt = buildMemoPrompt(emptyZones, at, compared, rows, { site: null, landUseSource: 'manual', zoningName: null });
    expect(prompt).toContain('"requiresLegalReview":true'); expect(prompt).toContain('"relation":"nearby"');
    expect(prompt).toContain('"scoringHits":[]');
    const before = await memoContextKey(at, compared, rows);
    const mappingChanged = { ...compared, restriction: { ...compared.restriction, mapping: { ...compared.restriction.mapping!, mappingVersion: 'test-next-mapping' } } };
    expect(await memoContextKey(at, mappingChanged, rows)).not.toBe(before);
    const relationChanged = input(lookup([heritage(undefined, true)]));
    const changed = scoreSite(relationChanged, emptyZones);
    expect(await memoContextKey(relationChanged, changed, rows)).not.toBe(before);
  });
});
const input = (restrictions: RestrictionLookup | null = lookup()): ScoreInput => ({
  lat: 36.4916, lng: 127.3046, landUse: 'industrial', restrictions,
  disaster: { found: false, layer: 'LT_C_UP201', coordinate: { lat: 36.4916, lng: 127.3046 }, hits: [] },
});
const evaluate = (hits: RestrictionLookup['hits'] = [], failed: string[] = [], dataset: AppData = emptyZones) => scoreSite(input(lookup(hits, failed)), dataset);
const restrictionDeductions = (r: ReturnType<typeof evaluate>) => r.permit.deductions.filter(d => ['법적 입지 제한 구역', '규제구역 검토 필요'].includes(d.label));
const row = (r: ReturnType<typeof evaluate>) => buildChecklist(r, data, { input: input(), landUseSource: 'manual', zoningName: null }).find(r => r.key === 'permit.restriction')!;
function expectReview(r: ReturnType<typeof evaluate>) {
  expect(r.restriction.requiresLegalReview).toBe(true);
  expect(r.permit.score).toBeNull();
  expect(r.composite.score).toBeNull();
  expect(r.composite.grade).toBeNull();
  expect(r.composite.capReason).toBeNull();
  expect(restrictionDeductions(r)).toEqual([]);
  expect(row(r).verdict).toBe('caution');
  expect(r.review.actions.join(' ')).toContain('국가유산');
}
describe('03L independent heritage mapping cases with production constants', () => {
  it('L01 direct registered heritage requires legal review without a penalty', () => {
    const r = evaluate([heritage()]); expectReview(r);
    expect(r.restriction.hits[0].type).toBe('등록문화유산 관련 구역');
    expect(r.restriction.hits[0].law).not.toContain('제35조');
    expect(r.restriction.mapping?.mappingVersion).toBe('heritage-mapping-20260921-v1');
    expect(row(r).evidence).toContain('2026-09-21');
    expect(row(r).sources.some(s => s.includes('law.go.kr'))).toBe(true);
  });
  it('L02 nearby registration preserves the baseline score', () => {
    const r = evaluate([heritage(undefined, true)]);
    expect(r.restriction.level).toBe('reference');
    expect(r.restriction.hits[0].relation).toBe('nearby');
    expect(r.restriction.hits[0].name).toBe('등록문화재구역');
    expect(r.restriction.requiresLegalReview).toBe(false);
    expect(r.composite).toEqual(evaluate().composite);
    expect(restrictionDeductions(r)).toEqual([]);
    expect(row(r).verdict).toBe('caution');
  });
  it('L03 explicit cultural designation refers to article 35 without a penalty', () => {
    const r = evaluate([heritage('국가지정문화유산구역')]); expectReview(r);
    expect(r.restriction.hits[0].law).toContain('문화유산'); expect(r.restriction.hits[0].law).toContain('제35조');
  });
  it('L04 legacy designation keeps cultural or natural law uncertain', () => {
    const r = evaluate([heritage('국가지정문화재구역')]); expectReview(r);
    expect(r.restriction.hits[0].law).toContain('자연유산');
    expect(r.restriction.hits[0].reviewNote).toContain('현행 문화유산·자연유산 구분');
  });
  it('L05 provincial designation includes article 74 and local ordinance', () => {
    const r = evaluate([heritage('시·도지정문화유산구역')]); expectReview(r);
    expect(r.restriction.hits[0].law).toContain('제74조'); expect(r.restriction.hits[0].law).toContain('조례');
  });
  it('L06 provincial registration uses modern heritage article 43', () => {
    const r = evaluate([heritage('시·도등록문화유산구역')]); expectReview(r);
    expect(r.restriction.hits[0].law).toContain('제43조'); expect(r.restriction.hits[0].law).not.toContain('제35조');
  });
  it('L07 natural monument and scenic designation use natural heritage law', () => {
    for (const name of ['천연기념물구역', '명승구역', '자연유산보호구역']) {
      const r = evaluate([heritage(name)]); expectReview(r);
      expect(r.restriction.hits[0].law).toContain('자연유산'); expect(r.restriction.hits[0].law).not.toContain('제35조');
    }
  });
  it('L08 all 323 bundled natural heritage shapes share review, not prohibition', () => {
    const zones = data.protectedZones!.zones.filter(z => z.type === '천연기념물·명승 지정구역');
    expect(zones).toHaveLength(323);
    expect(data.constants.scoring.restriction.types['천연기념물·명승 지정구역'].level).toBe('review');
    const r = evaluate([], [], { ...emptyZones, protectedZones: { ...data.protectedZones!, zones: [{ ...zones[0], bbox: [36, 127, 37, 128], rings: [[[36, 127], [36, 128], [37, 128], [37, 127], [36, 127]]] }] } });
    expectReview(r); expect(r.restriction.hits[0].relation).toBe('direct');
  });
  it('L09 null, blank and unknown raw names are preserved as unknown heritage types', () => {
    for (const name of [null, '', '새로운유형']) {
      const r = evaluate([heritage(name)]); expectReview(r);
      expect(r.restriction.hits[0].rawName).toBe(name);
      expect(r.restriction.hits[0].type).toBe('국가유산 유형 확인 필요');
      expect(r.restriction.hits[0].law).not.toContain('제35조');
    }
  });
  it('L10 named historic environment polygon still needs boundary review', () => {
    const r = evaluate([heritage('역사문화환경 보존지역')]); expectReview(r);
    expect(r.restriction.hits[0].law).toContain('제13조'); expect(r.restriction.hits[0].law).toContain('제10조');
  });
  it('L11 nearby named historic environment and designated polygons remain references', () => {
    for (const name of ['역사문화환경 보존지역', '국가지정문화유산구역']) {
      const r = evaluate([heritage(name, true)]); expect(r.restriction.level).toBe('reference');
      expect(r.composite).toEqual(evaluate().composite); expect(row(r).verdict).not.toBe('good');
    }
  });
  it('L12 direct registration does not suppress nearby designation in the same layer', () => {
    const r = evaluate([heritage(), heritage('국가지정문화재구역', true)]); expectReview(r);
    expect(r.restriction.hits.map(h => h.level)).toEqual(['review', 'reference']);
  });
  it('L13 same name keeps both relations and explains possible duplicate observations', () => {
    const r = evaluate([heritage(), heritage(undefined, true)]);
    expect(r.restriction.hits.map(h => h.relation)).toEqual(['direct', 'nearby']);
    expect(summarizeRestriction(r.restriction)).toContain('동일 대상이 중복 포함될 수');
  });
  it('L14 other prohibition alone supplies the 40 point penalty and E cap', () => {
    const r = evaluate([heritage(), prohibited]);
    expect(r.restriction.level).toBe('prohibited'); expect(r.restriction.requiresLegalReview).toBe(true);
    expect(restrictionDeductions(r).map(d => d.points)).toEqual([40]);
    expect(restrictionDeductions(r)[0].evidence).not.toContain('등록문화');
    expect(r.restriction.scoringHits.map(h => h.name)).toEqual(['개발제한구역']);
    expect(r.composite).toMatchObject({ score: null, grade: 'E', capReason: 'restriction' });
  });
  it('L15 nearby heritage leaves other prohibition scores unchanged', () => {
    const r = evaluate([heritage(undefined, true), prohibited]);
    expect(r.composite).toEqual(evaluate([prohibited]).composite);
    expect(restrictionDeductions(r).map(d => d.points)).toEqual([40]);
    expect(restrictionDeductions(r)[0].evidence).not.toContain('등록문화');
  });
  it('L16 conditional penalty remains 15 while direct heritage suspends scores', () => {
    const r = evaluate([heritage(), conditional]);
    expect(restrictionDeductions(r).map(d => d.points)).toEqual([15]);
    expect(r.restriction.requiresLegalReview).toBe(true);
    expect(r.composite).toMatchObject({ score: null, grade: null, capReason: null });
  });
  it('L17 known prohibition survives partial lookup', () => {
    const r = evaluate([prohibited], ['LT_C_UO301']);
    expect(r.restriction.checked.vworld).toBe('partial');
    expect(r.composite).toMatchObject({ score: null, grade: 'E', capReason: 'restriction' });
    expect(restrictionDeductions(r).map(d => d.points)).toEqual([40]);
  });
  it('L18 supplied same-candidate stale prohibition survives complete retry failure', () => {
    const r = evaluate([prohibited], ['LT_C_UD801', 'LT_C_UO301', 'LT_C_UO301@500']);
    expect(r.composite.grade).toBe('E'); expect(r.restriction.hits).toHaveLength(1);
    expect(evaluate().restriction.hits).toEqual([]);
  });
  it('L19 direct review survives partial lookup as review, never a zero', () => {
    const r = evaluate([heritage()], ['LT_C_UD801']); expectReview(r);
    expect(r.restriction.checked.vworld).toBe('partial');
  });
  it('L20 nearby reference survives partial lookup but is not the cause of withholding', () => {
    const r = evaluate([heritage(undefined, true)], ['LT_C_UD801']);
    expect(r.restriction.level).toBe('reference'); expect(r.restriction.requiresLegalReview).toBe(false);
    expect(r.composite.score).toBeNull(); expect(r.review.actions.join(' ')).not.toContain('국가유산 관련 법적 적용 확인 필요');
  });
  it('L21 valid empty results preserve baseline and limit absence claims', () => {
    const r = evaluate(); expect(r.restriction.level).toBe('none'); expect(r.composite.score).not.toBeNull();
    expect(summarizeRestriction(r.restriction)).toContain('조회한 자료');
  });
  it('L22 no lookup or all failed without bundle stays unknown', () => {
    const cfg = data.constants.scoring.restriction;
    expect(lookupRestrictions(null, null, 36.5, 127.3, cfg).level).toBe('unknown');
    expect(lookupRestrictions(null, lookup([], ['LT_C_UD801', 'LT_C_UO301', 'LT_C_UO301@500']), 36.5, 127.3, cfg).level).toBe('unknown');
    expect(scoreSite(input(null), { ...data, protectedZones: null }).composite.score).toBeNull();
  });
  it('L23 mixed review, reference, prohibition and failure preserve all evidence', () => {
    const r = evaluate([heritage(), heritage('국가지정문화재구역', true), prohibited], ['other']);
    expect(r.restriction.hits).toHaveLength(3); expect(r.restriction.requiresLegalReview).toBe(true);
    expect(restrictionDeductions(r).map(d => d.points)).toEqual([40]);
    expect(restrictionDeductions(r)[0].evidence).not.toContain('문화재');
    expect(r.composite).toMatchObject({ score: null, grade: 'E', capReason: 'restriction' });
  });
  it('L24 actual buffer is shown and zero disables nearby observations', () => {
    const cfg = data.constants.scoring.restriction;
    const r = lookupRestrictions(emptyZones.protectedZones, lookup([heritage(undefined, true)], [], 1000), 36.5, 127.3, cfg);
    expect(summarizeRestriction(r)).toContain('1000m'); expect(summarizeRestriction(r)).not.toContain('500m');
    const zero = lookup([], [], 0); expect(zero.queried).not.toContain('LT_C_UO301@0');
    expect(lookupRestrictions(emptyZones.protectedZones, { ...zero, hits: [heritage(undefined, true)] }, 36.5, 127.3, cfg).hits).toEqual([]);
  });
  it('L25 nonregistration and withdrawn names cannot match by substring', () => {
    for (const name of ['비등록문화재구역', '지정해제국가지정문화유산구역']) {
      const r = evaluate([heritage(name)]); expectReview(r);
      expect(r.restriction.hits[0].type).toBe('국가유산 유형 확인 필요');
    }
  });
});
