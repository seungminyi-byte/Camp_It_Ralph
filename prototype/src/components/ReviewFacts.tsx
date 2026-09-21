import { SafeExternalLink } from './SafeExternalLink';
import type { ScoreResult } from '../types';
import { fmtArea, fmtKrw } from '../lib/format';
import {
  CONSULTATION_LABELS,
  CONSULTATION_STATUS,
  COST_LABELS,
} from '../lib/reviewInputs';
export function AreaReview({ result: r }: { result: ScoreResult }) {
  return (
    <div className="review-facts">
      <strong>{r.area.label}</strong>
      <dl>
        <div>
          <dt>필요 연면적</dt>
          <dd>{fmtArea(r.area.requiredAreaM2)}</dd>
        </div>
        {r.area.racks !== null && (
          <div>
            <dt>필요 랙 수</dt>
            <dd>{r.area.racks.toLocaleString()}개</dd>
          </div>
        )}
        {r.project.assumptions.development === 'new' && (
          <div>
            <dt>이론상 최소 대지면적</dt>
            <dd>{fmtArea(r.area.minimumLandM2)}</dd>
          </div>
        )}
        {r.area.status === 'shortfall' && (
          <div className="shortfall">
            <dt>
              {r.project.assumptions.development === 'new'
                ? '대지면적 부족'
                : '건물면적 부족'}
            </dt>
            <dd>{fmtArea(r.area.shortfallM2)}</dd>
          </div>
        )}
      </dl>
      {r.area.missing.length > 0 && (
        <p>확인할 입력: {r.area.missing.join(' · ')}</p>
      )}
      <p className="fact-note">{r.area.note}</p>
    </div>
  );
}
export function CostReview({
  result: r,
  compact = false,
}: {
  result: ScoreResult;
  compact?: boolean;
}) {
  const p = r.project.assumptions;
  return (
    <div className="review-facts">
      <p>
        <strong>
          {r.businessCost.label}: {fmtKrw(r.businessCost.amountKrw)}
        </strong>
      </p>
      {r.businessCost.missing.length > 0 && (
        <p>미입력·유효값 확인 필요: {r.businessCost.missing.join(' · ')}</p>
      )}
      {!compact && r.conditions.costMode === 'items' && (
        <dl>
          {(Object.keys(COST_LABELS) as (keyof typeof COST_LABELS)[]).map(
            (k) => (
              <div key={k}>
                <dt>{COST_LABELS[k]}</dt>
                <dd>
                  {r.conditions.costs[k] === null
                    ? '미입력'
                    : fmtKrw(r.conditions.costs[k])}
                </dd>
              </div>
            ),
          )}
        </dl>
      )}
      <p>지연 중 평균 차입잔액: {fmtKrw(r.finance.debtKrw)}</p>
      <div className="sensitivity-scroll">
        <table className="sensitivity-table">
          <caption>지연 금융비용 — 시장 예측이 아닌 계산 가정</caption>
          <thead>
            <tr>
              <th scope="col">연 금리 / 지연</th>
              {p.delays.map((m, i) => (
                <th key={i} scope="col">
                  {Number.isFinite(m) && m >= 0 ? `${m}개월` : '미입력'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.rates.map((rate, i) => (
              <tr key={i}>
                <th scope="row">
                  {Number.isFinite(rate) && rate >= 0
                    ? `${Number((rate * 100).toFixed(4))}%`
                    : '미입력'}
                </th>
                {r.finance.cells.slice(i * 3, i * 3 + 3).map((c, j) => (
                  <td key={j}>{fmtKrw(c.costKrw)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.finance.missing.length > 0 && (
        <p>계산 보류 항목: {r.finance.missing.join(' · ')}</p>
      )}
      <p className="fact-note">
        평균 차입잔액 × 연 금리 × 지연개월 ÷ 12. 지연 금융비용은 사업비와 별도
        표시하며 점수로 지연기간을 예측하지 않습니다.
      </p>
    </div>
  );
}
export function ConsultationReview({ result: r }: { result: ScoreResult }) {
  return (
    <div className="review-facts">
      {(
        Object.keys(CONSULTATION_LABELS) as (keyof typeof CONSULTATION_LABELS)[]
      ).map((k) => {
        const c = r.conditions.consultations[k];
        return (
          <article key={k}>
            <strong>
              {CONSULTATION_LABELS[k]} · {CONSULTATION_STATUS[c.status]}
            </strong>
            <p>
              {c.note || '확인 내용 미입력'}
              {c.date ? ` (${c.date})` : ' · 날짜 미입력'}
            </p>
          </article>
        );
      })}
      <p className="fact-note">
        협의 내용은 사용자 기록입니다. 용수는 필요한 수질·일 공급량·첨두
        공급량과 관로 인입 조건을 공급기관에 확인해야 합니다. 통신은 경로
        이중화·인입비·공사기간을 확인하세요.
      </p>
    </div>
  );
}
export function EvidenceList({ result: r }: { result: ScoreResult }) {
  return (
    <div className="evidence-list">
      {r.evidence.map((e) => (
        <article key={e.key}>
          <strong>
            {e.title}{' '}
            <small>
              {e.status === 'available'
                ? '자료 확인'
                : e.status === 'partial'
                  ? '일부 미확인'
                  : '미확인'}
            </small>
          </strong>
          <p>
            <SafeExternalLink href={e.sourceUrl}>
              {e.source}
            </SafeExternalLink>{' '}
            · {e.period} · {e.spatialUnit}
          </p>
          <p>{e.detail}</p>
        </article>
      ))}
    </div>
  );
}
