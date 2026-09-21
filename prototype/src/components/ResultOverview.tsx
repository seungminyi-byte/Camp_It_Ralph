import { useId, type ReactNode } from 'react';
import type { ReviewIssue, ScoreResult } from '../types';
import { EvidenceList } from './ReviewFacts';

const BASIS_LABEL: Record<ReviewIssue['basis'], string> = {
  public_data: '공개자료',
  public_estimate: '공개자료 · 추정 포함',
  user_input: '사용자 입력·기록',
  calculation: '입력조건 계산',
  unverified: '출처 미확인',
};

function IssueRows({ issues }: { issues: ReviewIssue[] }) {
  return (
    <ul className="review-issue-list">
      {issues.map(issue => (
        <li key={issue.id}>
          <details>
            <summary>
              <span>{issue.title}</span>
              <small>{BASIS_LABEL[issue.basis]}</small>
            </summary>
            <p>{issue.detail}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}
export function ResultOverview({
  result: r,
  loading,
  incomplete,
  missingEvidence,
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
  const hasUnknownEvidence = incomplete || r.evidence.some(item => item.status !== 'available');
  const summaryId = useId();
  const constraints = overview.issues.filter(issue => issue.category === 'confirmed_constraint');
  const unknowns = overview.issues.filter(issue => issue.category === 'unknown');
  const inputConditions = overview.issues.filter(issue => issue.category === 'input_condition');
  const topDeductions = [...r.permit.deductions]
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  const { power: powerPart, permit: permitPart } = r.composite.breakdown;
  return (
    <section
      className="result-overview"
      aria-label="제약과 다음 확인사항"
      aria-busy={loading}
    >
      <div className="overview-location">
        <span>후보 부지 1차 사업검토</span>
        <span role="status">
          {loading ? '공공자료 조회 중' : hasUnknownEvidence ? '일부 자료 미확인' : '현재 입력 기준'}
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
      <div className={`review-decision tone-${overview.tone}`}>
        <span>현재 검토 상태</span>
        <strong>{overview.label}</strong>
      </div>
      <section className="review-summary-section" aria-labelledby={`${summaryId}-constraints`}>
        <h3 id={`${summaryId}-constraints`}>확인된 제약 <small>공개자료의 해당·검토 대상</small></h3>
        {constraints.length ? <IssueRows issues={constraints} /> : (
          <p>현재 확인된 자료에서 제약 항목이 없습니다. 미확인 조건은 별도 확인하세요.</p>
        )}
        <p className="review-limit">공개자료의 해당 사실은 실제 인허가 결과가 아닙니다. 제약 항목이 없어도 사업 가능·안전 판정은 아닙니다.</p>
      </section>
      <section className="review-summary-section" aria-labelledby={`${summaryId}-unknowns`}>
        <h3 id={`${summaryId}-unknowns`}>미확인 조건 <small>자료와 실제 공급조건</small></h3>
        {unknowns.length ? <IssueRows issues={unknowns} /> : <p>현재 요약의 미확인 항목이 없습니다. 실제 공급·설계·인허가는 별도로 확인하세요.</p>}
        <p className="review-limit">협의 기록의 ‘사용자 확인’은 공급기관 확약을 서비스가 검증했다는 뜻이 아닙니다.</p>
      </section>
      {inputConditions.length > 0 && (
        <section className="review-summary-section" aria-labelledby={`${summaryId}-inputs`}>
          <h3 id={`${summaryId}-inputs`}>입력조건 검토 <small>적용값과 계산 가정</small></h3>
          <IssueRows issues={inputConditions} />
        </section>
      )}
      <section className="review-summary-section review-next-actions" aria-labelledby={`${summaryId}-actions`}>
        <h3 id={`${summaryId}-actions`}>다음 확인사항</h3>
        <ol>{overview.actions.slice(0, 3).map(action => <li key={action}>{action}</li>)}</ol>
        <details className="review-all-actions">
          <summary>전체 확인사항과 선택 상세조건</summary>
          <ul>{r.review.actions.map(action => <li key={action}>{action}</li>)}</ul>
        </details>
      </section>
      {!hasDetailedInputs && <p className="review-optional-note">상세조건을 입력하면 면적·비용을 추가 검토합니다. 입력 없이도 기본 검토와 보고서를 사용할 수 있습니다.</p>}
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
      {children}
      <details className="review-reference-score">
        <summary>참고점수와 산정 근거 <small>{score === null ? '미산정' : `${score}점 · ${grade}등급`}</small></summary>
        <div className="overview-score" aria-label="참고점수">
          <div className={`overview-grade tone-${scoreTone}`}>
            <strong>{grade ?? '—'}</strong>
            <span>등급</span>
          </div>
          <div className="overview-score-value">
            <span>공개자료·입력값 기반 참고점수</span>
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
              {loading ? '공공자료 조회 중입니다.' : `필수 자료 미확인으로 참고점수를 산정하지 않았습니다. ${missingEvidence.join(' · ')}`}
            </p>
          )}
        </section>
      </details>
      <details className="review-sources">
        <summary>출처·자료 상태 <small>기준일·자료 범위·한계</small></summary>
        <EvidenceList result={r} />
      </details>
      <p className="score-disclaimer">
        자료가 없는 항목을 낮은 위험으로 해석하지 않으며, 점수만으로 사업 적합
        여부를 확정하지 않습니다.
      </p>
    </section>
  );
}
