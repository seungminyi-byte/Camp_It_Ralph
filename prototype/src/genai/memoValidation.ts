import type { AppData, ScoreResult } from '../types';
import type { ChecklistKey, ChecklistRow } from '../report/checklist';
import type { ParsedMemo } from './memoFormat';

export type FactUnit = 'krw' | 'm2' | 'm' | '%' | 'month' | 'mw' | 'kw' | 'degree' | 'count' | 'person' | 'household' | 'point' | 'floor';
export interface NumericFact { name: string; value: number | null; unit: FactUnit; aliases?: string[]; financeCondition?: { annualRatePct: number; months: number } }
export type MemoFacts = Record<ChecklistKey, NumericFact[]>;
export interface MemoFlag { section: string; kind: 'number' | 'claim' | 'instruction' | 'structure'; message: string; excerpt: string }
export const MEMO_CHECK_LIMIT = '항목별 수치·단위와 대표적인 무근거 확정 표현을 대조합니다. 모든 자연어 의미나 원자료의 정확성을 검증한 것은 아닙니다. 최종 사용 전 원문을 확인하세요.';

/** Values come from the single scoring result. Unit conversion is display normalization only. */
export function buildMemoFacts(result: ScoreResult, rows: ChecklistRow[], data: AppData): MemoFacts {
  const facts = Object.fromEntries(rows.map(row => [row.key, []])) as unknown as MemoFacts;
  const add = (key: ChecklistKey, name: string, value: number | null | undefined, unit: FactUnit, aliases?: string[]) => {
    if (value === null || value === undefined || typeof value === 'number' && Number.isFinite(value)) facts[key].push({ name, value: value ?? null, unit, aliases });
  };
  add('power.gate', 'listed', result.power.listedCount, 'count');
  add('power.distance', 'distance', result.power.nearestSubstation?.distanceKm !== undefined ? Math.round(result.power.nearestSubstation.distanceKm * 100) / 100 * 1000 : null, 'm');
  add('power.region', 'region', result.power.regionScore, 'point');
  add('permit.population', 'radius', data.constants.scoring.permit.popRadiusKm * 1000, 'm');
  add('permit.population', 'grid', 1000, 'm');
  add('permit.population', 'population', result.permit.popNearby, 'person', ['인구']);
  add('permit.population', 'households', result.permit.householdsNearby, 'household', ['가구']);
  add('permit.population', 'missingCells', result.permit.householdMissingCells, 'count', ['결측']);
  add('permit.school', 'distance', result.permit.nearestSchool?.distanceKm !== undefined ? Math.round(result.permit.nearestSchool.distanceKm * 100) / 100 * 1000 : null, 'm');
  add('permit.news', 'articles', result.permit.newsSignal?.row.conflictArticles, 'count');
  add('permit.delayStat', 'samples', result.permit.delayStat?.row.n, 'count');
  add('permit.delayStat', 'median', result.permit.delayStat?.row.medianMonths, 'month');
  add('site.terrain', 'slope', result.terrain?.sample.slopeP50Deg, 'degree');
  add('site.terrain', 'elevation', result.terrain?.sample.elevM, 'm');
  const a = result.area, c = result.conditions;
  add('site.area', 'minimumLand', a.minimumLandM2, 'm2', ['최소 대지면적', '최소대지면적', '최소 부지면적', '최소 대지', '최소대지', '필요 대지면적']);
  add('site.area', 'shortfall', a.shortfallM2, 'm2', ['부족', '부족 면적', '부족분', '대지면적 부족']);
  add('site.area', 'requiredArea', a.requiredAreaM2, 'm2', ['계획 연면적', '필요 연면적', '연면적', '필요 면적', '필요면적']);
  add('site.area', 'landArea', c.landAreaM2, 'm2', ['입력 대지', '확보 대지', '입력 대지면적', '확보 대지면적', '대지면적']);
  add('site.area', 'existingArea', c.existingAreaM2, 'm2', ['확보 건물']);
  add('site.area', 'far', c.farPct, '%', ['용적률']);
  add('site.area', 'coverage', c.coveragePct, '%', ['건폐율']);
  add('site.area', 'floors', c.floors, 'floor');
  add('site.area', 'racks', a.racks, 'count');
  add('cost.business', 'amount', result.businessCost.amountKrw, 'krw', ['합계', '총사업비', '사업비']);
  const costAliases = { land: ['토지비', '부지비'], building: ['건축비', '공사비', '건축·설비비'], civil: ['토목비'], power: ['전력 인입비', '전력인입비', '인입비'], telecom: ['통신 인입비', '통신인입비'], other: ['기타비', '기타비용'] };
  for (const key of Object.keys(costAliases) as (keyof typeof costAliases)[]) add('cost.business', key, c.costs[key], 'krw', costAliases[key]);
  add('cost.business', 'total', c.totalCostKrw, 'krw', ['총액']);
  add('cost.finance', 'debt', result.finance.debtKrw, 'krw', ['차입잔액', '잔액']);
  for (const cell of result.finance.cells) {
    add('cost.finance', 'rate', cell.annualRate * 100, '%', ['금리', '연']);
    add('cost.finance', 'delay', cell.months, 'month', ['기간', '지연']);
    facts['cost.finance'].push({ name: 'financeCost', value: cell.costKrw, unit: 'krw', aliases: ['금융비용', '금융 비용'], financeCondition: { annualRatePct: cell.annualRate * 100, months: cell.months } });
  }
  // Only published numerical row evidence is trusted here; consultation notes are never fact authorities.
  for (const key of ['permit.regulation', 'permit.restriction', 'permit.disaster', 'permit.cases', 'site.landWater'] as const) {
    for (const number of quantities(rows.find(row => row.key === key)?.evidence ?? '')) if (number.unit) add(key, 'providedEvidence', number.value, number.unit);
  }
  return facts;
}
interface Quantity { value: number; unit: FactUnit | null; raw: string; index: number; end: number }
const units: Record<string, [FactUnit, number]> = {
  '억원': ['krw', 1e8], '억 원': ['krw', 1e8], '조원': ['krw', 1e12], '조 원': ['krw', 1e12], '만원': ['krw', 1e4], '만 원': ['krw', 1e4], '원': ['krw', 1],
  '㎡': ['m2', 1], 'm²': ['m2', 1], 'm2': ['m2', 1], '제곱미터': ['m2', 1], 'km': ['m', 1000], 'm': ['m', 1], '%': ['%', 1], '퍼센트': ['%', 1],
  '개월': ['month', 1], 'MW': ['mw', 1], 'kW': ['kw', 1], '°': ['degree', 1], '도': ['degree', 1], '명': ['person', 1], '가구': ['household', 1], '개': ['count', 1], '곳': ['count', 1], '건': ['count', 1], '점': ['point', 1], '층': ['floor', 1],
};
function quantities(text: string): Quantity[] {
  // Mask non-quantitative identifiers without changing offsets.
  const masked = text.replace(/https?:\/\/\S+|\d{4}[-./]\d{1,2}(?:[-./]\d{1,2})?|\d{4}년(?:\s*\d{1,2}월(?:\s*\d{1,2}일)?)?|제\s*\d+\s*(?:조|항|호)(?:의\s*\d+)?|(?:^|\n)\s*\d+[.)]\s|(?:주소\s*[:：]?\s*[가-힣]+(?:대로|로|길)\s*\d+(?:-\d+)?|[가-힣]+(?:대로|로|길)\s*\d+(?:-\d+)?(?=\s*주소))|\d+(?:-\d+)?(?:번지|번길|동|호)/g, match => ' '.repeat(match.length));
  const re = /(-?\d[\d,]*(?:\.\d+)?)\s*(억 원|억원|조 원|조원|만 원|만원|원|제곱미터|m²|m2|㎡|km|MW|kW|개월|퍼센트|가구|%|m|°|도|명|개|곳|건|점|층)?/g;
  return [...masked.matchAll(re)].map(match => {
    const unit = match[2] ? units[match[2]] : null;
    return { value: Number(match[1].replaceAll(',', '')) * (unit?.[1] ?? 1), unit: unit?.[0] ?? null, raw: match[0], index: match.index, end: match.index + match[0].length };
  });
}
function numberFlags(section: string, text: string, facts: NumericFact[]): MemoFlag[] {
  const measured = quantities(text);
  const rates = [...new Set(measured.filter(quantity => quantity.unit === '%').map(quantity => quantity.value))];
  const months = [...new Set(measured.filter(quantity => quantity.unit === 'month').map(quantity => quantity.value))];
  return measured.flatMap(quantity => {
    const preceding = text.slice(Math.max(0, quantity.index - 32), quantity.index);
    const aliasMatches = facts.map(fact => ({ fact, length: Math.max(0, ...(fact.aliases ?? []).filter(alias => preceding.trimEnd().endsWith(alias) || new RegExp(`${alias}(?:은|는|이|가|에서|으로|을|를)?\\s*$`).test(preceding)).map(alias => alias.length)) }));
    const longest = Math.max(0, ...aliasMatches.map(match => match.length));
    const namedBefore = aliasMatches.filter(match => longest > 0 && match.length === longest).map(match => match.fact);
    const following = text.slice(quantity.end, quantity.end + 12);
    const named = /^(?:이|가)?\s*부족/.test(following) ? facts.filter(fact => fact.name === 'shortfall') : namedBefore;
    let candidates = named.length ? named : facts;
    if (section === 'cost.finance' && quantity.unit === 'krw' && !named.some(fact => fact.name === 'debt') && (rates.length || months.length)) {
      // A displayed scenario must keep its rate/month/cost relationship from the engine cell.
      candidates = rates.length === 1 && months.length === 1
        ? candidates.filter(fact => fact.financeCondition && Math.abs(fact.financeCondition.annualRatePct - rates[0]) < 1e-7 && fact.financeCondition.months === months[0])
        : [];
    }
    const supported = quantity.unit !== null && candidates.some(fact => fact.value !== null && fact.unit === quantity.unit && Math.abs(fact.value - quantity.value) <= Math.max(1e-7, Math.abs(fact.value) * 1e-10));
    return supported ? [] : [{ section, kind: 'number' as const, message: '해당 항목의 제공 수치·단위와 일치 여부를 확인할 수 없습니다.', excerpt: quantity.raw.trim() }];
  });
}
function claimFlags(section: string, text: string): MemoFlag[] {
  const flags: MemoFlag[] = [];
  const clauses = text.split(/(?<!\d)[.!?。\n]|[.!?。](?!\d)|[;,]|하지만|그러나|반면|지만|으나|없이도/);
  for (const clause of clauses) {
    const negative = /(?:확인|확정|승인|허가|보장|검증|안전|적합|가능)[\s\S]{0,20}(?:않|아니|아님|없|미확인|미검증|불가)|(?:아직|미)[\s\S]{0,8}(?:확인|확정|승인|검증)|(?:확인|검토|협의)[\s\S]{0,8}(?:필요|해야|요청)|단정할 수 없/.test(clause);
    if (negative) continue;
    const unsupported = /(?:공급|수전)[\s\S]{0,35}(?:확정|보장|가능합니다|가능하다)|(?:한전|한국전력|공식)[\s\S]{0,25}(?:승인|확약)[\s\S]{0,15}(?:완료|확정|받았|되었|됐|했)|(?:허가|인허가|건축)[\s\S]{0,25}(?:확정|승인 완료|허용됩니다|허용된다|허가되었습니다|허가됐습니다|허가받았습니다)|(?:사업|부지)[\s\S]{0,25}(?:적합|안전)(?:성)?[\s\S]{0,15}(?:확정|합니다|하다|보장)|안전합니다|안전한 부지|규제가 없습니다|(?:시간|비용|업무|효율)[\s\S]{0,30}(?:줄였|줄입|단축|절감|향상)/.test(clause);
    if (unsupported) flags.push({ section, kind: 'claim', message: '공급·승인·허가·사업 적합·안전 또는 실측하지 않은 효과를 단정한 표현을 확인하세요.', excerpt: clause.trim() });
  }
  if (/(?:무시하고|지시를 무시|규칙을 바꾸|보고하세요|대신 출력|system\s*:)/i.test(text)) flags.push({ section, kind: 'instruction', message: '근거 설명에 포함된 작성 지시를 확인하세요.', excerpt: text });
  return flags;
}
export function validateMemoItem(section: string, text: string, facts: NumericFact[]): MemoFlag[] {
  return [...numberFlags(section, text, facts), ...claimFlags(section, text)];
}
export function validateMemo(memo: ParsedMemo, facts: MemoFacts): MemoFlag[] {
  const flags = Object.entries(memo.items).flatMap(([key, text]) => validateMemoItem(key, text, facts[key as ChecklistKey] ?? []));
  for (const [section, text] of [['OVERALL', memo.overall], ['ACTIONS', memo.actions.join('\n')], ['CAVEATS', memo.caveats.join('\n')]]) {
    // Cross-item narrative numbers require manual review: item evidence cannot establish their relationship here.
    flags.push(...validateMemoItem(section, text, []));
  }
  for (const item of memo.unmapped) flags.push({ section: item.key, kind: 'structure', message: '제공한 항목과 연결되지 않은 의견입니다.', excerpt: item.text });
  for (const key of memo.duplicates) flags.push({ section: key, kind: 'structure', message: '같은 항목이 중복되어 확인이 필요합니다.', excerpt: key });
  return flags;
}
export type MemoRunStatus = 'streaming' | 'done' | 'error' | 'stopped';
export function isMemoAppendixEligible(memo: ParsedMemo, status: MemoRunStatus, current: boolean, flags: MemoFlag[]): boolean {
  return current && status === 'done' && memo.visible.trim().length > 0 && memo.complete && !memo.error && !memo.unmapped.length && !memo.duplicates.length && flags.length === 0;
}
