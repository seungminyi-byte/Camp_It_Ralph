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
  it('shows fictional area examples without an actual-region score image', () => {
    const box = document.createElement('div'); box.innerHTML = renderToStaticMarkup(<IntroPage path="/" />);
    expect(box.textContent).toContain('가상부지 A · 계산 체험 예시');
    expect(box.textContent).toContain('5,000㎡ 부족');
    expect(box.textContent).toContain('면적 충족');
    expect(box.querySelector('.product-example img')).toBeNull();
    expect(box.innerHTML).not.toMatch(/반곡동|77점|B등급|review-score-example/);
    expect(box.querySelector('a[href="/review?example=area"]')).not.toBeNull();
    expect(box.querySelector('a[href="/review?example=compare"]')).not.toBeNull();
    const project = renderToStaticMarkup(<IntroPage path="/project" />);
    expect(project).toContain('추가로 확인할 사항');
    expect(project).not.toContain('남겨 두는 확인');
    expect(project).not.toMatch(/반곡동|77점|36\.4967/);
  });
  it('puts engine findings before the score and distinguishes point selection from a locality', () => {
    const result = scoreSite({ lat: 36.4967, lng: 127.3007, landUse: 'unknown' }, data);
    const box = document.createElement('div');
    box.innerHTML = renderToStaticMarkup(<ResultOverview result={result} loading={false} incomplete missingEvidence={[]} site={{ lat: 36.4967, lng: 127.3007, source: 'emd' }}>{null}</ResultOverview>);
    expect(box.querySelector('h2')?.textContent).toBe(`${result.emd?.emd} 내 선택 지점`);
    expect(box.querySelector('.centroid-note')?.textContent).toBe('읍면동 중심점 · 실제 후보 필지 미지정');
    expect(box.querySelectorAll('.overview-key-findings dd')).toHaveLength(3);
    expect(box.innerHTML.indexOf('overview-key-findings')).toBeLessThan(box.innerHTML.indexOf('overview-score"'));
    expect(box.querySelector('.overview-full-findings')?.hasAttribute('open')).toBe(false);
    expect(box.querySelector('.overview-key-findings dd:last-child')?.textContent).toBeTruthy();
    box.innerHTML = renderToStaticMarkup(<ResultOverview result={result} loading={false} incomplete missingEvidence={[]} site={{ lat: 36.4967, lng: 127.3007, source: 'coords', label: '가상부지 A' }}>{null}</ResultOverview>);
    expect(box.querySelector('h2')?.textContent).toBe('가상부지 A');
    expect(box.querySelector('.centroid-note')).toBeNull();
    expect(box.querySelector('.score-type-context')).toBeNull();
  });
  it('keeps legal restrictions and withheld scores outside collapsed detail', () => {
    const result = scoreSite({ lat: 36.4967, lng: 127.3007, landUse: 'unknown' }, data);
    result.restriction.level = 'prohibited'; result.restriction.requiresLegalReview = true;
    result.composite.grade = 'E'; result.composite.score = null;
    const box = document.createElement('div');
    box.innerHTML = renderToStaticMarkup(<ResultOverview result={result} loading={false} incomplete missingEvidence={[]}>{null}</ResultOverview>);
    expect(box.querySelector('.restriction-alert')?.textContent).toContain('E등급');
    expect(box.querySelector('.restriction-alert')?.closest('details')).toBeNull();
    expect(box.querySelector('.data-gap')?.closest('details')).toBeNull();
    expect(box.querySelector('.overview-score-hold')?.textContent).toContain('미산정');
    expect(box.querySelector('.overview-score-hold')?.closest('details')).toBeNull();
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
