import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import HomePage from './pages/HomePage';

const ReviewWorkspace = lazy(() => import('./pages/ReviewWorkspace'));
const readRoute = () => window.location.hash === '#review' ? 'review' : 'home';

class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="entry-status" role="alert">
          <h1>검토 화면을 열지 못했습니다.</h1>
          <p>연결 상태를 확인하고 다시 불러와 주세요. 새로고침하면 현재 검토 입력은 초기화됩니다.</p>
          <div>
            <button className="entry-primary" onClick={() => window.location.reload()}>다시 불러오기</button>
            <a className="entry-secondary" href="#home">제품 소개로</a>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [hasOpenedReview, setHasOpenedReview] = useState(() => readRoute() === 'review');
  const active = route === 'review';
  const previousActive = useRef(active);

  useEffect(() => {
    const syncRoute = () => {
      const next = readRoute();
      if (next === 'review') setHasOpenedReview(true);
      setRoute(next);
    };
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  useEffect(() => {
    document.title = active
      ? '후보 부지 검토 | 여기 DC 돼요?'
      : '여기 DC 돼요? | 데이터센터 후보 부지 1차 검토';
    const returnedHome = previousActive.current && !active;
    previousActive.current = active;
    if (!returnedHome) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById('home-title')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className={`product-app route-${route}`}>
      <a className="skip-link" href={active ? '#review-main' : '#home-main'} onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById(active ? 'review-main' : 'home-main');
        main?.focus();
        main?.scrollIntoView({ block: 'start' });
      }}>본문으로 건너뛰기</a>
      <header className="product-header">
        <a className="product-brand" href="#home" aria-label="여기 DC 돼요? 제품 소개">
          <span className="product-symbol" aria-hidden="true">dc<span>↗</span></span>
          <span>여기 DC 돼요?<small>데이터센터 후보 부지 1차 검토</small></span>
        </a>
        <nav aria-label="주 메뉴">
          <a className="product-nav-home" href="#home" aria-current={!active ? 'page' : undefined}>제품 소개</a>
          <a className={active ? 'product-nav-active' : 'entry-primary'} href="#review" aria-current={active ? 'page' : undefined}>
            {active ? '검토 화면' : hasOpenedReview ? '검토 계속하기' : '검토 시작'}
            {!active && <span aria-hidden="true">→</span>}
          </a>
        </nav>
      </header>
      {!active && <HomePage hasOpenedReview={hasOpenedReview} />}
      {hasOpenedReview && (
        <div className="workspace-slot" hidden={!active} inert={!active}>
          <WorkspaceBoundary>
            <Suspense fallback={
              <main className="entry-status" aria-busy="true">
                <h1>검토 화면을 준비하고 있습니다.</h1>
                <p role="status">지도와 검토 도구를 불러오는 중입니다.</p>
                <a className="entry-secondary" href="#home">제품 소개로</a>
              </main>
            }>
              <ReviewWorkspace active={active} onHome={() => { window.location.hash = 'home'; }} />
            </Suspense>
          </WorkspaceBoundary>
        </div>
      )}
    </div>
  );
}
