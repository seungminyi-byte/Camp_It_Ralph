import { describe, expect, it } from 'vitest';
import { scoreSite } from '../scoring/engine';
import { loadAppData } from '../test/loadData';
import { siteVerdict, verdictReasons } from './verdict';
const data = loadAppData();
describe('engine-owned review conclusions', () => {
  it('does not translate a reference score into suitability', () => {
    const r = scoreSite(
      { lat: 36.4916, lng: 127.3046, landUse: 'industrial' },
      data,
    );
    expect(siteVerdict(r)).toBe(r.review);
    expect(verdictReasons(r)).toBe(r.review.issues);
    expect(siteVerdict(r).label).toBe('추가 확인 필요');
  });
  it('preserves restrictions and unknown data at the same time', () => {
    const r = scoreSite({ lat: 37.66, lng: 126.98, landUse: 'green' }, data);
    expect(r.composite.grade).toBe('E');
    expect(siteVerdict(r).tone).toBe('risk');
    expect(r.composite.score).toBeNull();
  });
});
