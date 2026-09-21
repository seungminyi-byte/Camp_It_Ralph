import type { ReactNode } from 'react';
import type { ScoreResult } from '../types';
import { reviewGroups } from '../report/presentation';
import { EvidenceList } from './ReviewFacts';
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
  const groups = reviewGroups(r);
  const topDeductions = [...r.permit.deductions]
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  const { power: powerPart, permit: permitPart } = r.composite.breakdown;
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
      <h2 tabIndex={-1}>
        {r.emd && r.site.status !== 'outside'
          ? `${r.emd.sigungu} ${r.emd.emd}`
          : '선택 지점'}
      </h2>
      <div className="overview-score" aria-label="참고점수">
        <div className={`overview-grade tone-${scoreTone}`}>
          <strong>{grade ?? '—'}</strong>
          <span>등급</span>
        </div>
        <div className="overview-score-value">
          <span>공개자료 기반 참고점수</span>
          <strong>
            {score ?? (loading ? '조회 중' : '필수 자료 미확인')}
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
      {r.restriction.level === 'prohibited' && (
        <p className="restriction-alert" role="status">
          법정 보호·규제구역 해당으로 E등급으로 제한
        </p>
      )}
      {r.restriction.requiresLegalReview && (
        <p className="data-gap" role="status">
          국가유산 관련 법적 적용 확인 필요 · 인허가·종합 참고점수 미산정
          {r.restriction.level === 'prohibited' && ' · 다른 확인된 법적 입지 제한으로 E등급 상한 유지'}
        </p>
      )}
      <div className={`review-decision tone-${overview.tone}`}>
        <span>현재 검토 상태</span><strong>{overview.label}</strong><p>{overview.reason}</p>
      </div>
      <section className="overview-priorities" aria-label="주요 제약과 미확인">
        <h3>확인된 주요 제약·검토 신호</h3>
        {groups.constraints.length ? <ul>{groups.constraints.map((issue, i) => <li key={i}><strong>{issue.title}</strong><p>{issue.detail}</p></li>)}</ul>
          : <p>현재 확인한 자료에서 주요 제약을 찾지 못했습니다. 미확인 자료의 제약 없음은 뜻하지 않습니다.</p>}
        <h3>중요한 미확인 사항</h3>
        {groups.unknowns.length ? <><ul className="unknown-summary">{groups.unknowns.slice(0, 3).map((issue, i) => <li key={i}>{issue.title}</li>)}</ul><details className="all-unknowns"><summary>미확인 {groups.unknowns.length}개 전체와 상세 근거</summary><ul>{groups.unknowns.map((issue, i) => <li key={i}><strong>{issue.title}</strong><p>{issue.detail}</p></li>)}</ul></details></>
          : <p>기록된 추가 미확인 항목이 없습니다. 실제 공급·설계·인허가는 후속 확인이 필요합니다.</p>}
        <h3>다음 확인사항</h3>
        <ol>{r.review.actions.slice(0, 3).map((action, i) => <li key={i}>{action}</li>)}</ol>
        {r.review.actions.length > 3 && <details><summary>전체 확인사항 {r.review.actions.length}개</summary><ol>{r.review.actions.map((action, i) => <li key={i}>{action}</li>)}</ol></details>}
      </section>
      {children}
      <details className="overview-evidence"><summary>근거 출처·기준일·범위 확인</summary><EvidenceList result={r} /></details>
      <details className="overview-reference-score"><summary>점수 계산 근거</summary>
      <section className="score-explanation" aria-label="점수 계산 근거">
        <div className="score-explanation-heading">
          <div>
            <span>왜 이 점수인가요?</span>
            <strong>분야별 점수와 반영비율</strong>
          </div>
          {score !== null && <b>{score}점</b>}
        </div>
        {score !== null ? (
          <>
            <div className="score-formula">
              <div>
                <span>전력 여건</span>
                <strong>{powerPart.score}점</strong>
                <small>× {Math.round(powerPart.weight * 100)}%</small>
                <b>{powerPart.weightedPoints}점</b>
              </div>
              <i>+</i>
              <div>
                <span>인허가·부지</span>
                <strong>{permitPart.score}점</strong>
                <small>× {Math.round(permitPart.weight * 100)}%</small>
                <b>{permitPart.weightedPoints}점</b>
              </div>
            </div>
            <p className="score-waiting">가중점수 합계를 반올림한 참고점수입니다. 법적 입지 제한이 확인되면 등급은 E로 제한됩니다.</p>
            <div className="score-deductions">
              <span>주요 감점 요인</span>
              {topDeductions.length ? (
                topDeductions.map((item) => (
                  <div key={`${item.label}-${item.points}`}>
                    <strong>{item.label}</strong>
                    <b>−{item.points}점</b>
                  </div>
                ))
              ) : (
                <p>현재 확인된 인허가·부지 감점 항목이 없습니다.</p>
              )}
            </div>
          </>
        ) : (
          <p className="score-waiting">
            {loading ? '공공자료 조회 중입니다. 일시적으로 누락된 응답은 한 번 자동으로 다시 확인합니다.' : `필수 자료 미확인으로 참고점수를 산정하지 않았습니다. 필요한 확인사항: ${r.composite.unavailableReasons.join(' · ')}`}
          </p>
        )}
      </section>
      </details>
      <p className="score-disclaimer">
        자료가 없는 항목을 낮은 위험으로 해석하지 않으며, 점수만으로 사업 적합
        여부를 확정하지 않습니다.
      </p>
    </section>
  );
}
