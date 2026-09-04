import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EmdCentroid } from '../types';
import { buildEmdIndex, displayName, parseLatLng, searchEmd } from './emdSearch';

const rows = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'public', 'data', 'emd_centroids.json'), 'utf-8'),
) as EmdCentroid[];
const index = buildEmdIndex(rows);

describe('searchEmd', () => {
  it('finds a unique 읍면동 by name alone', () => {
    const hits = searchEmd(index, '덕이동');
    expect(hits.length).toBe(1);
    expect(hits[0].exact).toBe(true);
    expect(hits[0].entry.row.sigungu).toBe('고양시일산서구');
  });

  it('keeps every homonym when the name is ambiguous', () => {
    const hits = searchEmd(index, '반곡동');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.map((h) => h.entry.row.sido)).toContain('세종특별자치시');
  });

  it('narrows a homonym with a 시도 prefix', () => {
    const hits = searchEmd(index, '세종 반곡동');
    expect(hits.length).toBe(1);
    expect(hits[0].entry.row.sido).toBe('세종특별자치시');
  });

  it('ranks exact names above names that merely contain the query', () => {
    const hits = searchEmd(index, '교동', 8);
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every((h) => h.entry.row.emd === '교동')).toBe(true);
  });

  it('accepts short 시도 aliases', () => {
    expect(searchEmd(index, '경기 덕이동')[0]?.entry.row.sido).toBe('경기도');
    expect(searchEmd(index, '인천 청천동')[0]?.entry.row.sido).toBe('인천광역시');
  });

  it('drops duplicate rows that share a name and location', () => {
    const hits = searchEmd(index, '광주 송정동', 8);
    for (let i = 0; i < hits.length; i += 1) {
      for (let j = i + 1; j < hits.length; j += 1) {
        const a = hits[i].entry.row;
        const b = hits[j].entry.row;
        expect(a.sigungu === b.sigungu && a.emd === b.emd).toBe(false);
      }
    }
  });

  it('returns nothing for empty or unmatched input', () => {
    expect(searchEmd(index, '   ')).toEqual([]);
    expect(searchEmd(index, '존재하지않는동네')).toEqual([]);
  });

  it('omits the repeated 시도 in 세종 labels', () => {
    const sejong = rows.find((r) => r.sido === r.sigungu);
    if (sejong) expect(displayName(sejong)).toBe(`${sejong.sido} ${sejong.emd}`);
  });
});

describe('parseLatLng', () => {
  it('reads a lat,lng pair', () => {
    expect(parseLatLng('37.68, 126.74')).toEqual({ lat: 37.68, lng: 126.74 });
    expect(parseLatLng('37.6851 126.7482')).toEqual({ lat: 37.6851, lng: 126.7482 });
  });

  it('swaps a lng,lat pair back into order', () => {
    expect(parseLatLng('126.7482, 37.6851')).toEqual({ lat: 37.6851, lng: 126.7482 });
  });

  it('rejects pairs outside Korea and non-coordinate text', () => {
    expect(parseLatLng('1, 2')).toBeNull();
    expect(parseLatLng('덕이동')).toBeNull();
    expect(parseLatLng('37.68')).toBeNull();
  });
});
