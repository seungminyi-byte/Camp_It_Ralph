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
  const detailedValues = [
    r.conditions.landAreaM2,
    r.conditions.plannedAreaM2,
    r.conditions.existingAreaM2,
    r.conditions.farPct,
    r.conditions.coveragePct,
    r.conditions.floors,
    r.project.assumptions.itMw,
    r.project.assumptions.rackKw,
    r.project.assumptions.rackAreaM2,
    r.project.assumptions.whiteSpacePct,
  ];
  const hasDetailedInputs = detailedValues.some((value) => value !== null);
  const availableArea =
    r.project.assumptions.development === 'conversion'
      ? r.conditions.existingAreaM2
      : r.conditions.landAreaM2;
  const requiredArea =
    r.project.assumptions.development === 'conversion'
      ? r.area.requiredAreaM2
      : r.area.minimumLandM2;
  const areaFitPct =
    r.area.status !== 'unknown' && availableArea && requiredArea
      ? Math.round((availableArea / requiredArea) * 100)
      : null;
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
      <div className="overview-score" aria-label="입지점수">
        <div className={`overview-grade tone-${scoreTone}`}>
          <strong>{grade ?? '—'}</strong>
          <span>등급</span>
        </div>
        <div className="overview-score-value">
          <span>공공데이터 기반 1차 입지점수</span>
          <strong>
            {score ?? '미산정'}
            {score !== null && <small> / 100</small>}
          </strong>
          <p>
            상세 설계조건이 없어도 산정되며, 입력값은 별도의 설계 적합성
            검토에 반영됩니다.
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
            필수 공공자료 조회가 완료되면 계산식과 감점 근거가 표시됩니다.
          </p>
        )}
      </section>
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
      <div className={`review-decision tone-${r.review.tone}`}>
        <span>입지 판단</span>
        <strong>{r.review.label}</strong>
        <p>{r.review.reason}</p>
      </div>
      {children}
      {r.review.issues.length > 0 && (
        <details className="verdict-reasons">
          <summary>
            확인할 사항 <small>{r.review.issues.length}개 · 펼쳐보기</small>
          </summary>
          <div>
            {r.review.issues.map((issue, i) => (
              <article key={i}>
                <span className={`reason-dot tone-${issue.tone}`} />
                <div>
                  <strong>{issue.title}</strong>
                  <p>{issue.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
      <p className="score-disclaimer">
        자료가 없는 항목을 낮은 위험으로 해석하지 않으며, 점수만으로 사업 적합
        여부를 확정하지 않습니다.
      </p>
    </section>
  );
}
