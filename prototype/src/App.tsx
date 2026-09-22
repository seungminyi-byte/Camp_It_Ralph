import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ReviewSessionStore } from './review/session';
import { ReviewSessionContext } from './review/ReviewSession';
import { canonicalPath, shouldNavigate } from './site/routes';
import { IntroPage } from './site/IntroPage';
import { pageTitles } from './site/pageTitles';
import { ReviewErrorBoundary } from './site/ReviewErrorBoundary';
import './site/shell.css';
const ReviewApp = lazy(() => import('./review/ReviewApp'));
export default function App() {
  const [store] = useState(() => new ReviewSessionStore(() => window.sessionStorage));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [menuOpen, setMenuOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const usageButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [path, setPath] = useState(() => canonicalPath(window.location.pathname));
  useEffect(() => {
    const update = () => { store.flush(); setMenuOpen(false); setPath(canonicalPath(window.location.pathname)); };
    window.addEventListener('popstate', update);
    window.addEventListener('pagehide', store.flush);
    return () => { store.flush(); window.removeEventListener('popstate', update); window.removeEventListener('pagehide', store.flush); };
  }, [store]);
  useLayoutEffect(() => {
    if (window.location.pathname !== path) window.history.replaceState(null, '', path + window.location.search + window.location.hash);
    document.title = `${pageTitles[path] ?? '페이지를 찾을 수 없습니다'} | 여기 DC 돼요?`;
    const section = path === '/project' && ['#sources', '#example'].includes(window.location.hash) ? document.getElementById(window.location.hash.slice(1)) : null;
    if (section) {
      const heading = section.querySelector<HTMLElement>('h2');
      if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
      section.scrollIntoView?.({ block: 'start' });
    } else document.getElementById('page-title')?.focus();
  }, [path]);
  const review = path === '/review';
  return <ReviewSessionContext value={store}><div className={`site-shell ${review ? 'is-review' : ''}`} onClick={event => {
    const anchor = (event.target as Element).closest('a');
    if (!anchor || !shouldNavigate(event, anchor)) return;
    event.preventDefault(); store.flush();
    const next = canonicalPath(anchor.pathname);
    const destination = next + anchor.search + anchor.hash;
    if (window.location.pathname + window.location.search + window.location.hash !== destination) {
      window.history.pushState(null, '', destination);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
    setMenuOpen(false); setPath(next);
  }}>
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <header className="site-header" onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus(); } }}><a href="/" className="site-brand"><img className="site-brand-mark" src="/brand-mark.svg" alt="" aria-hidden="true" width="34" height="34" />여기 DC 돼요?</a><button ref={menuButton} className="site-menu-button" aria-expanded={menuOpen} aria-controls="site-navigation" onClick={() => setMenuOpen(value => !value)}>메뉴 {menuOpen ? '닫기' : '열기'}</button><nav id="site-navigation" className={menuOpen ? 'is-open' : ''} aria-label="주 메뉴">{[['/', '메인'], ['/project', '프로젝트 소개'], ['/team', '팀 소개'], ['/review', '부지 검토']].map(([href, label]) => <a key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</a>)}</nav></header>
    <main id="main-content" className="site-main" tabIndex={-1}>
      {review ? <><div className="review-session-bar"><h1 id="page-title" tabIndex={-1}>후보 부지 검토</h1><p>이 탭에서 입력과 담은 후보를 임시 보관합니다. 공개·가상 데이터로 사용하세요.</p><button onClick={store.reset}>검토 내용 지우기</button></div>{state.notice && <p className="session-notice" role="status">{state.notice}</p>}<ReviewErrorBoundary onReload={() => { store.flush(); window.location.reload(); }}><Suspense fallback={<p role="status">검토 화면 불러오는 중…</p>}><ReviewApp key={state.resetRevision} /></Suspense></ReviewErrorBoundary></> : <IntroPage path={path} />}
    </main>
    <footer className="site-footer" onKeyDown={event => { if (event.key === 'Escape' && usageOpen) { setUsageOpen(false); usageButton.current?.focus(); } }}>
      <div><strong>여기 DC 돼요?</strong>캠핑왕 랄프</div>
      <div className="site-footer-actions"><button ref={usageButton} type="button" aria-expanded={usageOpen} aria-controls="service-usage-note" onClick={() => setUsageOpen(value => !value)}>ⓘ 서비스 이용 안내 {usageOpen ? '닫기' : '보기'}</button><a href="/project#sources">자료와 활용 범위 ↗</a></div>
      <div id="service-usage-note" className="site-usage-detail" hidden={!usageOpen} role="region" aria-label="서비스 이용 안내 전문"><strong>스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가</strong><p>공개자료와 입력 조건에 따른 1차 참고 검토입니다. 실제 전력 공급·인허가·사업 적합성은 담당 기관과 전문가의 후속 확인이 필요합니다.</p><a href="/project#sources">자료 출처와 활용 범위 확인 ↗</a></div>
    </footer>
  </div></ReviewSessionContext>;
}
