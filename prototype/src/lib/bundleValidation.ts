import { parseCsv } from './csv';
import { validDataCenters } from './dataCenters';
import { decodeTerrain } from '../scoring/terrain';
import { decodeProtectedZones } from '../scoring/restriction';
import type { ProtectedZonesFile, TerrainGridFile } from '../types';

type Check = (value: unknown) => boolean;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str: Check = v => typeof v === 'string';
const num: Check = v => typeof v === 'number' && Number.isFinite(v);
const positive: Check = v => num(v) && (v as number) > 0;
const nullable: Check = v => v === null || num(v);
const optional = (check: Check): Check => v => v === undefined || check(v);
const literal = (...choices: unknown[]): Check => v => choices.includes(v);
const shape = (fields: Record<string, Check>): Check => v => obj(v) && Object.entries(fields).every(([k, check]) => check(v[k]));
const list = (check: Check, min = 0): Check => v => Array.isArray(v) && v.length >= min && v.every(check);
const dict = (check: Check): Check => v => obj(v) && Object.values(v).every(check);
const tuple = (...checks: Check[]): Check => v => Array.isArray(v) && v.length === checks.length && checks.every((check, i) => check(v[i]));
const pair = tuple(num, num), bbox = tuple(num, num, num, num), triple = tuple(num, num, num);
const strings = list(str);
const numeric = (...keys: string[]) => Object.fromEntries(keys.map(k => [k, num]));
const textual = (...keys: string[]) => Object.fromEntries(keys.map(k => [k, str]));
const profile = shape(textual('label', 'description'));
const evidence = shape(textual('source', 'sourceUrl', 'period', 'spatialUnit', 'detail'));
const band = (...keys: string[]) => list(shape(numeric(...keys)), 1);
const rule = shape({ type: str, includes: optional(str), equals: optional(strings) });
const constants = shape({
  stats: dict(shape({ label: str, value: optional(num), source: optional(str), sourceUrl: optional(str) })),
  disclaimer: dict(str),
  scoring: shape({
    coverage: shape({ bbox, northernBoundary: list(pair, 2), emdOutsideKm: positive }),
    projectProfiles: shape({ small: profile, standard: profile, hyperscale: profile }),
    review: shape({ rates: triple, delays: triple, m2PerPyeong: positive }),
    evidence: shape(Object.fromEntries(['power', 'substations', 'population', 'households', 'schools', 'zoning', 'restrictions', 'disaster', 'terrain', 'news', 'permits'].map(k => [k, evidence]))),
    disaster: shape({ deduction: num, ...textual('label', 'law', 'sourceUrl', 'reviewNote') }),
    power: shape({ ...numeric('weightSupply', 'weightRegion', 'weightDistance', 'emdMatchUncertainKm'), supplyScoreBySubstationCount: shape(numeric('0', '1', '2', '3plus')), regionPrior: v => dict(num)(v) && obj(v) && num(v.default), distanceScoreKm: band('maxKm', 'score') }),
    permit: shape({ ...numeric('popRadiusKm', 'incheonResidentialExtraDeduction', 'caseNearbyKm'), populationDeduction: band('maxPop', 'deduction'), schoolDeduction: band('maxKm', 'deduction'), landUseDeduction: shape(numeric('industrial', 'semiIndustrial', 'commercial', 'green', 'residential', 'unknown')), delayStat: shape({ ...numeric('minPermits', 'cap'), relativeBands: band('maxRatio', 'deduction'), stalledExtra: shape(numeric('minExcessShare', 'deduction')) }) }),
    terrain: shape({ ...numeric('seaMaxLandPct', 'coastalMaxLandPct'), slopeDeduction: list(shape({ ...numeric('maxP50Deg', 'deduction'), label: str }), 1), unsuitable: shape(numeric('minP50Deg', 'minSteepPct', 'minDeduction')), reclaimedOverrides: list(shape({ name: str, bbox })) }),
    restriction: shape({ ...numeric('prohibitedDeduction', 'conditionalDeduction'), heritageBufferM: v => num(v) && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000, types: dict(shape({ level: literal('prohibited', 'conditional', 'review', 'reference'), law: str, reviewNote: optional(str), sourceIds: optional(strings) })), vworldLayers: dict(shape({ type: str, buffered: optional(str), nameRules: optional(list(rule)) })), heritageMapping: optional(shape({ ...textual('mappingVersion', 'legalReviewedAt', 'vworldDocumentUpdatedAt', 'vworldDocumentUrl'), sources: dict(shape(textual('title', 'url', 'effectiveAt'))) })) }),
    composite: shape({ ...numeric('weightPower', 'weightPermit'), grades: list(shape({ min: num, grade: str }), 1), restrictionGradeCap: str }),
  }),
});
const permitStat = { ...numeric('n', 'started', 'stalled12mN', 'eligible12mN'), medianMonths: nullable, p75Months: nullable, stalled12mShare: nullable, topPurposes: list(shape({ purpose: str, n: num })) };
const validators: Record<string, Check> = {
  'constants.json': constants,
  'emd_power.json': list(shape({ ...textual('sido', 'sigungu', 'emd'), subs: strings, count: num }), 1),
  'emd_centroids.json': list(shape({ ...textual('sido', 'sigungu', 'emd'), ...numeric('lat', 'lng', 'n') }), 1),
  'substations_osm.json': list(shape({ ...textual('name', 'voltage', 'operator'), ...numeric('lat', 'lng') })),
  'schools.json': list(tuple(str, str, num, num)),
  'pop_grid.json': list(tuple(num, num, num), 1),
  'dc_stats.json': list(shape({ region: str, ...numeric('customers', 'contractMw') })),
  'data_centers.json': validDataCenters,
  'households_grid.json': shape({ version: literal(1), year: literal(2024), ...textual('source', 'sourceUrl', 'spatialUnit', 'note'), rows: list(tuple(num, num, v => v === null || num(v) && Number.isInteger(v) && (v as number) >= 0), 1) }),
  'permit_delay.json': shape({ ...textual('source', 'fetchedAt'), window: shape(textual('from', 'to')), sample: shape({ archGb: str, ...numeric('minTotAreaM2', 'stallMonths') }), baseline: shape(permitStat), rows: list(shape({ ...permitStat, ...textual('sido', 'sigungu'), level: literal('sigungu', 'city'), codes: strings })) }),
  'news_signal.json': shape({ ...textual('source', 'fetchedAt', 'note'), window: shape({ months: num, ...textual('from', 'to') }), queries: strings, conflictKeywords: strings, baseline: shape(numeric('areas', 'articles', 'conflictArticles', 'medianConflict', 'maxConflict')), rows: list(shape({ ...textual('sido', 'sigungu', 'query'), level: literal('sigungu', 'city', 'sido'), ...numeric('articles', 'conflictArticles'), top: list(shape(textual('title', 'link', 'date'))) })) }),
  'terrain_grid.json': shape({ ...textual('source', 'attribution', 'fetchedAt'), method: shape({ slope: str, ...numeric('sampleArcsec', 'samplesPerCell', 'steepThresholdDeg') }), grid: shape({ ...numeric('lat0', 'lng0'), step: positive, rows: positive, cols: positive, origin: literal('sw') }), encoding: shape({ type: literal('base64-uint8'), nodata: num }), planes: shape(textual('landPct', 'slopeP50Deg', 'steepPct', 'elevMean10m')) }),
  'protected_zones.json': shape({ source: str, sourceUrls: strings, asOf: dict(str), zones: list(shape({ ...textual('id', 'type', 'name'), marine: optional(num), bbox, rings: list(list(pair, 3), 1) })) }),
};
/** Validation checks consumed shape and finite scalars; it does not certify source accuracy or topology. */
export function parseBundleJson<T>(name: string, text: string): T {
  const value: unknown = JSON.parse(text);
  if (!validators[name]?.(value)) throw new Error(`${name}: 자료 형식을 확인할 수 없습니다.`);
  if (name === 'terrain_grid.json') decodeTerrain(value as TerrainGridFile);
  if (name === 'protected_zones.json') decodeProtectedZones(value as ProtectedZonesFile);
  return value as T;
}
const csvFields: Record<string, string[]> = {
  'cases.csv': ['id', 'name', 'sido', 'sigungu', 'lat', 'lng', 'cause', 'delay_months', 'delay_estimated', 'status', 'source_url', 'summary'],
  'regulations.csv': ['sido', 'sigungu', 'reg_type', 'detail', 'deduction', 'effective', 'source_url'],
};
export function parseBundleCsv(name: string, text: string): Record<string, string>[] {
  const fields = csvFields[name];
  const header = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].split(',');
  if (!fields || header.length !== fields.length || !fields.every(k => header.includes(k))) throw new Error(`${name}: 자료 열을 확인할 수 없습니다.`);
  const rows = parseCsv(text);
  const numbers = name === 'cases.csv' ? ['lat', 'lng', 'delay_months'] : ['deduction'];
  if (rows.some(row => numbers.some(k => !row[k]?.trim() || !Number.isFinite(Number(row[k]))) || fields.some(k => typeof row[k] !== 'string'))) throw new Error(`${name}: 자료 값을 확인할 수 없습니다.`);
  return rows;
}
