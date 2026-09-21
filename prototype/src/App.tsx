import { lazy, Suspense, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { ReviewSessionStore } from './review/session';
import { ReviewSessionContext } from './review/ReviewSession';
import { canonicalPath, shouldNavigate } from './site/routes';
import { IntroPage } from './site/IntroPage';
import { pageTitles } from './site/pageTitles';
import './site/shell.css';
const ReviewApp = lazy(() => import('./review/ReviewApp'));
export default function App() {
  const [store] = useState(() => new ReviewSessionStore(() => window.sessionStorage));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [path, setPath] = useState(() => canonicalPath(window.location.pathname));
  useEffect(() => {
    const update = () => { store.flush(); setPath(canonicalPath(window.location.pathname)); };
    window.addEventListener('popstate', update);
    window.addEventListener('pagehide', store.flush);
    return () => { store.flush(); window.removeEventListener('popstate', update); window.removeEventListener('pagehide', store.flush); };
  }, [store]);
  useLayoutEffect(() => {
    if (window.location.pathname !== path) window.history.replaceState(null, '', path + window.location.search + window.location.hash);
    document.title = `${pageTitles[path] ?? '페이지를 찾을 수 없습니다'} | 여기 DC 돼요?`;
    document.getElementById('page-title')?.focus();
  }, [path]);
  const review = path === '/review';
  return <ReviewSessionContext value={store}><div className={`site-shell ${review ? 'is-review' : ''}`} onClick={event => {
    const anchor = (event.target as Element).closest('a');
    if (!anchor || !shouldNavigate(event, anchor)) return;
    event.preventDefault(); store.flush();
    const next = canonicalPath(anchor.pathname);
    if (window.location.pathname !== next) window.history.pushState(null, '', next + anchor.search + anchor.hash);
    setPath(next);
  }}>
    <a className="skip-link" href="#main-content">본문으로 바로가기</a>
    <header className="site-header"><a href="/" className="site-brand">여기 DC 돼요?</a><nav aria-label="주 메뉴">{[['/', '메인'], ['/project', '프로젝트 소개'], ['/team', '팀 소개'], ['/review', '부지 검토']].map(([href, label]) => <a key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</a>)}</nav></header>
    <main id="main-content" className="site-main" tabIndex={-1}>
      {review ? <><div className="review-session-bar"><h1 id="page-title" tabIndex={-1}>후보 부지 검토</h1><p>이 탭에서 입력과 담은 후보를 임시 보관합니다. 공개·가상 데이터로 사용하세요.</p><button onClick={store.reset}>검토 내용 지우기</button></div>{state.notice && <p className="session-notice" role="status">{state.notice}</p>}<Suspense fallback={<p role="status">검토 화면 불러오는 중…</p>}><ReviewApp key={state.resetRevision} /></Suspense></> : <IntroPage path={path} />}
    </main>
    <footer className="site-footer">캠핑왕 랄프 · 스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가 <a href="/project">자료와 활용 범위</a></footer>
  </div></ReviewSessionContext>;
}
