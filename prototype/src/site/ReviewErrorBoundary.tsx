import { Component, type ReactNode } from 'react';

/** Keep navigation and the session owner alive when a lazy chunk or review render fails. */
export class ReviewErrorBoundary extends Component<{ children: ReactNode; onReload: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="review-load-error" role="alert">
      <h2>검토 화면을 불러오지 못했습니다</h2>
      <p>연결 상태를 확인한 뒤 새로고침해 주세요. 이 탭에 임시 보관된 입력과 담은 후보를 복원합니다. 임시 보관을 사용할 수 없는 환경에서는 복원되지 않을 수 있습니다.</p>
      <button onClick={this.props.onReload}>새로고침하여 다시 불러오기</button>
      <a href="/project">프로젝트 소개 보기</a>
    </section>;
  }
}
