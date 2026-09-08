import type { ReactNode } from 'react';
import type { ScoreResult } from '../types';
export function ResultOverview({
  result: r,
  loading,
  children,
}: {
  result: ScoreResult;
  loading: boolean;
  incomplete: boolean;
  missingEvidence: string[];
  children: ReactNode;
}) {
  return (
    <section
      className="result-overview"
      aria-label="핵심 분석 요약"
      aria-busy={loading}
    >
      <div className="overview-location">
        <span>후보 부지 1차 사업검토</span>
        <span role="status">
          {loading ? '공공자료 조회 중' : '현재 입력 기준'}
        </span>
      </div>
      <h2>
        {r.emd && r.site.status !== 'outside'
          ? `${r.emd.sigungu} ${r.emd.emd}`
          : '선택 지점'}
      </h2>
      {r.restriction.level === 'prohibited' && (
        <p className="restriction-alert" role="status">
          법정 보호·규제구역 해당으로 E등급으로 제한
        </p>
      )}
      <div className={`review-decision tone-${r.review.tone}`}>
        <span>우선 검토사항</span>
        <strong>{r.review.label}</strong>
        <p>{r.review.reason}</p>
      </div>
      {children}
      <div className="priority-issues">
        {r.review.issues.slice(0, 4).map((issue, i) => (
          <article key={i}>
            <strong>{issue.title}</strong>
            <p>{issue.detail}</p>
          </article>
        ))}
      </div>
      {r.review.issues.length > 4 && (
        <details className="verdict-reasons">
          <summary>추가 확인사항 {r.review.issues.length - 4}개</summary>
          {r.review.issues.slice(4).map((issue, i) => (
            <article key={i}>
              <strong>{issue.title}</strong>
              <p>{issue.detail}</p>
            </article>
          ))}
        </details>
      )}
      <details className="reference-score">
        <summary>
          참고점수{' '}
          <b>
            {r.composite.score === null
              ? '미산정'
              : `${r.composite.score}점 · ${r.composite.grade}등급`}
          </b>
        </summary>
        <p>
          전력 {r.power.score ?? '미산정'} / 인허가 {r.permit.score ?? '미산정'}
          . 자료가 없는 항목을 낮은 위험으로 해석하지 않습니다. 점수만으로 사업
          적합·부적합을 결정하지 않습니다.
        </p>
        {r.composite.score === null && (
          <p>
            계산에 필요한 자료를 확인한 뒤 산정합니다. 확인된 법적 입지 제한과
            E등급 상한은 계속 표시합니다.
          </p>
        )}
      </details>
    </section>
  );
}
