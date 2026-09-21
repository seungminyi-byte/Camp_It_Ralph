// @vitest-environment jsdom
import { act, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReviewSession } from '../review/ReviewSession';
import { SESSION_KEY, restoreSession } from '../review/session';
import { canonicalPath, shouldNavigate } from './routes';
const lifetimes = vi.hoisted(() => ({ mount: 0, cleanup: 0 }));
vi.mock('../review/ReviewApp', () => ({ default: function ReviewFixture() {
  const { inputs, store } = useReviewSession();
  useEffect(() => { lifetimes.mount++; return () => { lifetimes.cleanup++; }; }, []);
  return <><output>{inputs.site?.label ?? 'empty'}|{inputs.conditions.averageDebtKrw ?? 'null'}</output><button onClick={() => store.update(s => ({ ...s, site: { lat: 37.5, lng: 127, label: 'synthetic retained', source: 'coords' }, conditions: { ...s.conditions, averageDebtKrw: 0 } }))}>fixture input</button></>;
} }));
import App from '../App';
let root: Root, box: HTMLDivElement;
async function render() { await act(async () => { await import('../review/ReviewApp'); root.render(<StrictMode><App /></StrictMode>); }); }
async function click(text: string) { await act(async () => [...box.querySelectorAll<HTMLAnchorElement>('a')].find(a => a.textContent === text)!.click()); }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); sessionStorage.clear(); history.replaceState(null, '', '/'); box = document.createElement('div'); document.body.append(box); root = createRoot(box); lifetimes.mount = lifetimes.cleanup = 0; });
afterEach(async () => { await act(async () => root.unmount()); box.remove(); vi.unstubAllGlobals(); });
describe('N01-N03 shell routes and session ownership', () => {
  it('keeps review unmounted on intro, uses anchors and focuses each route heading', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); await render();
    expect(lifetimes.mount).toBe(0); expect(fetcher).not.toHaveBeenCalled();
    for (const [label, path] of [['프로젝트 소개', '/project'], ['팀 소개', '/team'], ['부지 검토', '/review']]) {
      const link = [...box.querySelectorAll('a')].find(a => a.textContent === label)!; expect(link.getAttribute('href')).toBe(path);
      await click(label); expect(location.pathname).toBe(path); expect(document.activeElement?.id).toBe('page-title'); expect(box.querySelectorAll('main')).toHaveLength(1);
    }
    expect(lifetimes.mount).toBeGreaterThan(0);
  });
  it('flushes latest on navigation and pagehide, preserves 0/null over back/forward and reload', async () => {
    history.replaceState(null, '', '/review'); await render();
    await act(async () => [...box.querySelectorAll('button')].find(b => b.textContent === 'fixture input')!.click());
    await click('팀 소개'); const saved = restoreSession(sessionStorage.getItem(SESSION_KEY));
    expect(saved.inputs.conditions.averageDebtKrw).toBe(0); expect(saved.inputs.conditions.costs.telecom).toBeNull(); expect(lifetimes.cleanup).toBe(lifetimes.mount);
    await act(async () => { history.back(); await new Promise(resolve => window.addEventListener('popstate', resolve, { once: true })); });
    expect(box.querySelector('output')?.textContent).toBe('synthetic retained|0');
    await act(async () => { history.forward(); await new Promise(resolve => window.addEventListener('popstate', resolve, { once: true })); }); expect(location.pathname).toBe('/team');
    await click('부지 검토'); await act(async () => window.dispatchEvent(new Event('pagehide')));
    await act(async () => root.unmount()); root = createRoot(box); await render();
    expect(box.querySelector('output')?.textContent).toBe('synthetic retained|0');
    await act(async () => [...box.querySelectorAll('button')].find(b => b.textContent === '검토 내용 지우기')!.click());
    expect(box.querySelector('output')?.textContent).toBe('empty|null'); expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
  it('closes the mobile navigation on Escape and returns focus, and closes it after navigation', async () => {
    await render();
    const menu = box.querySelector<HTMLButtonElement>('.site-menu-button')!;
    await act(async () => menu.click());
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    const nav = box.querySelector('nav')!;
    await act(async () => nav.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
    await act(async () => menu.click()); await click('팀 소개');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement?.id).toBe('page-title');
  });
  it('focuses the requested project section on direct fragment links', async () => {
    history.replaceState(null, '', '/project#sources'); await render();
    expect(document.activeElement?.tagName).toBe('H2');
    expect(document.activeElement?.closest('section')?.id).toBe('sources');
  });
  it('canonicalizes known trailing slashes and supplies unknown-page return', async () => {
    history.replaceState(null, '', '/team/'); await render(); expect(location.pathname).toBe('/team');
    await act(async () => { history.pushState(null, '', '/does-not-exist'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(box.textContent).toContain('페이지를 찾을 수 없습니다'); await click('메인으로 돌아가기'); expect(location.pathname).toBe('/');
    expect(canonicalPath('/data/missing/')).toBe('/data/missing/');
  });
  it('preserves native modified, middle, download, target and external clicks', () => {
    const anchor = document.createElement('a'); anchor.href = '/review';
    const base = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
    expect(shouldNavigate(base, anchor)).toBe(true);
    for (const key of ['metaKey', 'ctrlKey', 'altKey', 'shiftKey', 'defaultPrevented']) expect(shouldNavigate({ ...base, [key]: true }, anchor)).toBe(false);
    expect(shouldNavigate({ ...base, button: 1 }, anchor)).toBe(false);
    anchor.target = '_blank'; expect(shouldNavigate(base, anchor)).toBe(false); anchor.target = ''; anchor.download = 'file'; expect(shouldNavigate(base, anchor)).toBe(false);
    anchor.removeAttribute('download'); anchor.href = 'https://example.com/'; expect(shouldNavigate(base, anchor)).toBe(false);
  });
});
