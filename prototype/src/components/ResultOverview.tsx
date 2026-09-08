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
  const score = r.composite.score;
  const grade = r.composite.grade;
  const scoreTone =
    grade === 'A' || grade === 'B'
      ? 'good'
      : grade === 'E'
        ? 'risk'
        : 'caution';
  const hasDetailedInputs = r.area.hasInputs;
  const areaFitPct = r.area.fitPct;
  const overview = r.review.overview;
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
      <div className="overview-score" aria-label="참고점수">
        <div className={`overview-grade tone-${scoreTone}`}>
          <strong>{grade ?? '—'}</strong>
          <span>등급</span>
        </div>
        <div className="overview-score-value">
          <span>공개자료 기반 참고점수</span>
          <strong>
            {score ?? '미산정'}
            {score !== null && <small> / 100</small>}
          </strong>
          <p>
            필요한 공개자료가 확인된 경우 산정합니다. 실제 공급과 사업 가능 여부는
            면적·비용·공급조건을 포함한 후속 검토가 필요합니다.
          </p>
        </div>
      </div>
      <div className="overview-score-breakdown">
        <div>
          <span>전력 여건</span>
          <strong>{r.power.score ?? '—'}</strong>
        </div>
        <div>
          <span>인허가·부지</span>
          <strong>{r.permit.score ?? '—'}</strong>
        </div>
        <div>
          <span>상세 설계 · 선택</span>
          <strong>
            {!hasDetailedInputs
              ? '선택 미입력'
              : r.area.status === 'unknown'
                ? '입력 중'
                : r.area.status === 'fits'
                  ? '충족'
                  : '부족'}
          </strong>
        </div>
      </div>
      {hasDetailedInputs && (
        <div className={`design-assessment is-${r.area.status}`}>
          <div>
            <span>상세 설계조건 반영</span>
            <strong>{r.area.label}</strong>
          </div>
          {areaFitPct !== null ? (
            <div className="design-fit">
              <span>면적 충족률</span>
              <strong>{areaFitPct}%</strong>
            </div>
          ) : (
            <small>{r.area.missing.join(' · ')} 확인 필요</small>
          )}
        </div>
      )}
      <div className={`review-decision tone-${overview.tone}`}>
        <span>우선 확인사항</span>
        <strong>{overview.label}</strong>
        <p>{overview.reason}</p>
      </div>
      {children}
      <div className="priority-issues">
        {overview.issues.slice(0, 4).map((issue, i) => (
          <article key={i}>
            <strong>{issue.title}</strong>
            <p>{issue.detail}</p>
          </article>
        ))}
      </div>
      {overview.issues.length > 4 && (
        <details className="verdict-reasons">
          <summary>추가 확인사항 {overview.issues.length - 4}개</summary>
          {overview.issues.slice(4).map((issue, i) => (
            <article key={i}>
              <strong>{issue.title}</strong>
              <p>{issue.detail}</p>
            </article>
          ))}
        </details>
      )}
      <p className="score-disclaimer">
        자료가 없는 항목을 낮은 위험으로 해석하지 않으며, 점수만으로 사업 적합
        여부를 확정하지 않습니다.
      </p>
    </section>
  );
}
