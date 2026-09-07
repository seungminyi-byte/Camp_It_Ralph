import type { ReactNode } from 'react';
import type { ScoreResult } from '../types';
import { siteVerdict } from '../lib/verdict';
import { summarizeDisaster } from '../lib/disasterSummary';

export function ResultOverview({ result: r, loading, incomplete, children }: {
  result: ScoreResult; loading: boolean; incomplete: boolean; children: ReactNode;
}) {
  const verdict = siteVerdict(r, incomplete);
  return <section className="result-overview" aria-label="핵심 분석 요약" aria-busy={loading}>
    <div className="overview-location"><span>선택 부지 분석</span><span role="status">{loading ? '조회 중 · 잠정 결과' : '예비 스크리닝'}</span></div>
    <h2>{r.emd && r.site.status !== 'outside' ? `${r.emd.sigungu} ${r.emd.emd}` : '선택 지점'}</h2>
    <div className="overview-verdict">
      <div className={`grade-tile tone-${verdict.tone}`} aria-label={r.site.eligible ? `${r.composite.grade}등급` : '등급 없음'}>{r.site.eligible ? r.composite.grade : '—'}<span>GRADE</span></div>
      <div className="total-score"><span>종합 점수</span><strong>{r.site.eligible ? r.composite.score : '—'}<small> / 100</small></strong></div>
      <details className="data-confidence"><summary>데이터 신뢰도<b>미평가 ⓘ</b></summary><p>자료의 정확도·최신성을 종합하는 신뢰도 산식은 아직 정의되지 않았습니다.</p></details>
    </div>
    {children}
    <div className="key-verdict"><span className={`status-icon tone-${verdict.tone}`} aria-hidden="true">{verdict.tone === 'good' ? '✓' : '!'}</span><div><span>핵심 판단</span><strong>{verdict.label}</strong><p>{verdict.reason}</p></div></div>
    <div className="hazard-notice"><span className={`warning-icon tone-${r.disaster.status === 'hit' || r.terrain?.unsuitable ? 'risk' : r.disaster.status === 'none' ? 'good' : 'caution'}`} aria-hidden="true">△</span><div><strong>{r.disaster.status === 'hit' ? '재해위험지구 해당 · 관할기관 검토 필요' : r.terrain?.unsuitable ? '급경사 고위험 · 정밀 검토 필요' : r.disaster.status === 'none' ? '재해위험지구 해당 없음' : '재해위험지구 조회 중 또는 실패'}</strong><p>{summarizeDisaster(r.disaster)}{r.terrain?.unsuitable ? ' · 급경사 구간으로 사면 안정성 검토가 필요합니다.' : ''}</p></div></div>
    <details className="judgment-note"><summary>판단 기준과 자료 한계</summary><p>A·B등급 및 규모 권장조건 충족: 검토적합 / C등급·미확인 자료·규모 조건 미달: 조건부 검토 / D·E등급 또는 중대한 입지 제약: 부적합. 미확인 자료가 있으면 추가 검토를 우선합니다. 재해 안전을 포함한 최종 사업 승인이 아닙니다.</p></details>
  </section>;
}
