import { describe, expect, it } from 'vitest';
import { findEmdPower } from './powerMatch';
import type { EmdCentroid, EmdPower } from '../types';
const at = (sido: string, sigungu: string, emd: string, src?: string): EmdCentroid => ({ sido, sigungu, emd, src, lat: 35, lng: 127, n: 1 });
const row = (sido: string, sigungu: string, emd: string): EmdPower => ({ sido, sigungu, emd, count: 1, subs: ['공개목록 변전소'] });
describe('source preserving power list matches', () => {
  it('preserves exact and existing unique same-province matches', () => {
    const p = row('경기도', '고양시', '덕이동');
    expect(findEmdPower(at('경기도', '고양시', '덕이동'), [p])).toBe(p);
    expect(findEmdPower(at('경기도', '고양시일산서구', '덕이동'), [p])).toBe(p);
  });
  it('connects the merged province only by exact district and emd', () => {
    const p = row('전라남도', '나주시', '빛가람동');
    expect(findEmdPower(at('전남광주통합특별시', '나주시', '빛가람동'), [p])).toBe(p);
    expect(findEmdPower(at('전남광주통합특별시', '다른시', '빛가람동'), [p])).toBeUndefined();
    expect(findEmdPower(at('전남광주통합특별시', '나주시', '빛가람동'), [p, row('광주광역시', '나주시', '빛가람동')])).toBeUndefined();
  });
  it('repairs only the documented Sejong school address field offset', () => {
    const p = row('세종특별자치시', '', '조치원읍');
    expect(findEmdPower(at('세종특별자치시', '조치원읍', '교리', 'school'), [p])).toBe(p);
    expect(findEmdPower(at('세종특별자치시', '조치원읍', '교리', 'sgis'), [p])).toBeUndefined();
    expect(findEmdPower(at('세종특별자치시', '조치원읍', '다른동', 'school'), [p])).toBeUndefined();
    expect(findEmdPower(at('세종특별자치시', '조치원읍', '교리', 'school'), [p, p])).toBeUndefined();
  });
  it('does not borrow a neighboring province or invent missing Jeju supply', () => {
    expect(findEmdPower(at('제주특별자치도', '제주시', '삼도동'), [row('전라남도', '제주시', '삼도동')])).toBeUndefined();
    expect(findEmdPower(null, [])).toBeUndefined();
  });
  it.each([
    ['충청북도', '진천군', '덕산읍', '덕산면'],
    ['경상북도', '구미시', '산동읍', '산동면'],
    ['경상북도', '예천군', '호명읍', '호명면'],
    ['경기도', '용인시처인구', '양지읍', '양지면'],
    ['충청북도', '음성군', '대소읍', '대소면'],
    ['강원특별자치도', '홍천군', '영귀미면', '동면'],
    ['강원특별자치도', '양구군', '국토정중앙면', '남면'],
    ['경상북도', '성주군', '금수강산면', '금수면'],
    ['전라남도', '화순군', '사평면', '남면'],
  ])('connects a verified rename only within %s %s', (sido, sigungu, current, source) => {
    const p = row(sido, sigungu, source);
    expect(findEmdPower(at(sido, sigungu, current), [p])).toBe(p);
    expect(findEmdPower(at(sido, '다른군', current), [p])).toBeUndefined();
    expect(findEmdPower(at(sido, sigungu, current), [p, p])).toBeUndefined();
  });
  it('combines verified province and emd renames without accepting an unverified name', () => {
    expect(findEmdPower(at('전남광주통합특별시', '화순군', '사평면'), [row('전라남도', '화순군', '남면')])?.emd).toBe('남면');
    expect(findEmdPower(at('전라남도', '화순군', '백아면'), [row('전라남도', '화순군', '북면')])).toBeUndefined();
  });
});
