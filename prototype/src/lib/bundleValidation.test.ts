import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUNDLE_LIMITS } from './bundleLoader';
import { parseBundleCsv, parseBundleJson } from './bundleValidation';
const read = (name: string) => readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8');
describe('consumed bundle shapes', () => {
  it.each(Object.keys(BUNDLE_LIMITS))('accepts current %s, rejects missing shape', name => {
    const parse = name.endsWith('.csv') ? parseBundleCsv : parseBundleJson;
    expect(() => parse(name, read(name))).not.toThrow(); expect(() => parse(name, '{}')).toThrow();
  });
  it.each(['review', 'power', 'restriction', 'coverage', 'evidence', 'composite'])('rejects missing constants.%s before successful cache', key => {
    const value = JSON.parse(read('constants.json')); delete value.scoring[key];
    expect(() => parseBundleJson('constants.json', JSON.stringify(value))).toThrow();
  });
  it('rejects nested wrong types and malformed CSV numbers', () => {
    const value = JSON.parse(read('constants.json')); value.scoring.review.rates = null;
    expect(() => parseBundleJson('constants.json', JSON.stringify(value))).toThrow();
    expect(() => parseBundleCsv('cases.csv', read('cases.csv').replace('37.4664', 'not-a-number'))).toThrow();
  });
});
