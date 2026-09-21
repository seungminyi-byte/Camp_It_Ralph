// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntroPage } from './IntroPage';
import { ResultOverview } from '../components/ResultOverview';
import { scoreSite } from '../scoring/engine';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { loadAppData } from '../test/loadData';

const data = loadAppData();
describe('07 source-bound content and progressive result disclosure', () => {
  it('keeps all unknown details and next actions in engine order while showing three summary titles', () => {
    const result = scoreSite({ lat: 36.4967, lng: 127.3007, landUse: 'unknown', project: defaultProject(data.constants), conditions: emptyConditions() }, data);
    const box = document.createElement('div');
    box.innerHTML = renderToStaticMarkup(<ResultOverview result={result} loading={false} incomplete missingEvidence={['공식 용도지역']}>{<div data-testid="optional-inputs" />}</ResultOverview>);
    const unknowns = result.review.issues.filter(issue => issue.tone !== 'risk');
    expect(unknowns.length).toBeGreaterThan(3);
    expect([...box.querySelectorAll('.unknown-summary li')].map(n => n.textContent)).toEqual(unknowns.slice(0, 3).map(i => i.title));
    expect([...box.querySelectorAll('.all-unknowns li')].map(n => n.textContent)).toEqual(unknowns.map(i => i.title + i.detail));
    expect(box.querySelector('.all-unknowns')?.hasAttribute('open')).toBe(false);
    expect(box.querySelector('.all-unknowns summary')?.textContent).toContain(String(unknowns.length));
    const html = box.innerHTML;
    for (const action of result.review.actions) expect(box.textContent).toContain(action);
    expect(html.indexOf('다음 확인사항')).toBeLessThan(html.indexOf('optional-inputs'));
    expect(html.indexOf('optional-inputs')).toBeLessThan(html.indexOf('overview-reference-score'));
  });
  it('provides a local actual-result image with synthetic response disclosure instead of loading review data', () => {
    const html = renderToStaticMarkup(<IntroPage path="/" />);
    expect(html).toContain('공개자료·합성 검증 예시 · 실제 부지 판정 아님');
    expect(html).toContain('고정 조회 응답과 합성 사업조건');
    expect(html).toContain('review-example-mobile.webp');
    expect(html).toContain('반곡동');
    expect(html).not.toContain('/data/');
    expect(html).not.toContain('종촌동');
  });
  it('retains supplied team experience and separates ongoing development from use', () => {
    const box = document.createElement('div'); box.innerHTML = renderToStaticMarkup(<IntroPage path="/team" />);
    expect(box.querySelector('h1')?.textContent).toBe('우리가 계약서를 덮고 지도를 편 이유');
    expect(box.textContent).toContain('사내 법무관리시스템을 대체할');
    expect(box.textContent).toContain('개발하고 있습니다');
    expect(box.textContent).toContain('플러그인과 스킬을 직접 만들어 업무에 활용');
    expect(box.querySelector('.team-back source')?.getAttribute('media')).toBe('(max-width: 600px)');
    expect(box.querySelector('.team-front img')?.getAttribute('width')).toBe('1200');
  });
});
