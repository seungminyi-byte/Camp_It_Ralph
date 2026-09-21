import type { EmdCentroid, EmdPower } from '../types';

const unique = (rows: EmdPower[]) => rows.length === 1 ? rows[0] : undefined;
// Narrow, municipality-specific renames confirmed by the official histories in power-matching.md.
const renames = [
  ['충청북도', '진천군', '덕산읍', '덕산면'],
  ['경상북도', '구미시', '산동읍', '산동면'],
  ['경상북도', '예천군', '호명읍', '호명면'],
  ['경기도', '용인시처인구', '양지읍', '양지면'],
  ['충청북도', '음성군', '대소읍', '대소면'],
  ['강원특별자치도', '홍천군', '영귀미면', '동면'],
  ['강원특별자치도', '양구군', '국토정중앙면', '남면'],
  ['경상북도', '성주군', '금수강산면', '금수면'],
  ['전라남도', '화순군', '사평면', '남면'],
] as const;

/** Match the published list without rewriting its source or borrowing another district.
 * Administrative/source-parser evidence: data-pack/curated/power-matching.md.
 */
export function findEmdPower(at: EmdCentroid | null, rows: EmdPower[]): EmdPower | undefined {
  if (!at) return undefined;
  const exact = rows.filter(p => p.sido === at.sido && p.sigungu === at.sigungu && p.emd === at.emd);
  if (exact.length) return unique(exact);
  const sourceProvinces = at.sido === '전남광주통합특별시' ? ['광주광역시', '전라남도'] : [at.sido];
  const rename = renames.find(([sido, sigungu, current]) => sourceProvinces.includes(sido) && at.sigungu === sigungu && at.emd === current);
  if (rename) {
    const candidates = rows.filter(p => p.sido === rename[0] && p.sigungu === rename[1] && p.emd === rename[3]);
    if (candidates.length) return unique(candidates);
  }
  if (at.sido === '전남광주통합특별시') {
    return unique(rows.filter(p => (p.sido === '광주광역시' || p.sido === '전라남도') && p.sigungu === at.sigungu && p.emd === at.emd));
  }
  if (at.sido === '세종특별자치시' && at.src === 'school' && /[읍면]$/.test(at.sigungu) && /리$/.test(at.emd)) {
    return unique(rows.filter(p => p.sido === at.sido && p.sigungu === '' && p.emd === at.sigungu));
  }
  return unique(rows.filter(p => p.sido === at.sido && p.emd === at.emd));
}
