import type { AppData, ScoreResult } from '../types';
import { fmtCount } from '../lib/format';
import { summarizeRestriction } from '../scoring/restriction';
import { summarizeDisaster } from '../lib/disasterSummary';
import {
  AreaReview,
  CostReview,
  ConsultationReview,
  EvidenceList,
} from './ReviewFacts';
export function AnalysisDetails({
  result: r,
  data,
  onFlyTo,
}: {
  result: ScoreResult;
  data: AppData;
  onFlyTo: (lat: number, lng: number) => void;
}) {
  const permitDeduction = r.permit.deductions.reduce(
    (sum, item) => sum + item.points,
    0,
  );
  if (!r.site.eligible)
    return (
      <section className="analysis-details">
        <p>{r.site.detail}</p>
        <EvidenceList result={r} />
      </section>
    );
  return (
    <section className="analysis-details" aria-label="분야별 상세 분석">
      <div className="section-heading">
        <h3>점수 상세 근거</h3>
        <span>필요한 항목만 펼쳐보기</span>
      </div>
      <details className="detail-row">
        <summary>
          <span>면적 검토</span>
          <b>{r.area.status === 'unknown' ? '선택 입력' : r.area.label}</b>
        </summary>
        <div className="detail-body">
          <AreaReview result={r} />
        </div>
      </details>
      <details className="detail-row">
        <summary>
          <span>전력</span>
          <b>{r.power.score === null ? '자료 미확인' : `공개지표 ${r.power.score}점`}</b>
        </summary>
        <div className="detail-body">
          <p>
            읍면동 공개 목록 등재: {fmtCount(r.power.listedCount, '곳')}
            {r.gate.substations.length > 0 &&
              ` (${r.gate.substations.join(', ')})`}
          </p>
          <p>
            OSM 최근접 변전소:{' '}
            {r.power.nearestSubstation
              ? `${r.power.nearestSubstation.name} · 직선 ${r.power.nearestSubstation.distanceKm.toFixed(2)}km`
              : '위치자료 미확인'}
          </p>
          <p>
            목록과 위치자료는 서로 다른 자료입니다. 개수·거리로 공급 용량, 연결
            변전소나 전력계통영향평가 결과를 예측하지 않습니다. 실제 경로·주거지
            통과·공사비는 공급기관 협의와 별도 검토가 필요합니다.
          </p>
        </div>
      </details>
      <details className="detail-row">
        <summary>
          <span>주변 주거·학교 현황</span>
          <b>인허가 점수 반영</b>
        </summary>
        <div className="detail-body">
          <div className="surrounding-stats">
            <div>
              <span>인구</span>
              <strong>{fmtCount(r.permit.popNearby, '명')}</strong>
            </div>
            <div>
              <span>가구 수</span>
              <strong>{fmtCount(r.permit.householdsNearby, '가구')}</strong>
            </div>
          </div>
          <p>
            반경 {data.constants.scoring.permit.popRadiusKm}km 안의 1km 격자
            중심점 기준 합계입니다. 가구 수는 주민등록 세대수와 다릅니다.
          </p>
          {r.permit.householdMissingCells > 0 && (
            <p className="data-gap">
              가구 결측 격자 {r.permit.householdMissingCells}개 · 확인된 값만
              합산한 부분 통계입니다.
            </p>
          )}
          <p>
            학교:{' '}
            {r.permit.nearestSchool
              ? `${r.permit.nearestSchool.name} · 등록 지점까지 직선 ${r.permit.nearestSchool.distanceKm.toFixed(2)}km`
              : '미확인'}
          </p>
          <p className="fact-note">
            비밀보호를 위한 값 조정이 있는 참고 통계입니다. 인구·가구가 적어도
            수용성이 좋다는 뜻이 아니며 학교 지점 거리는 법정 보호구역
            경계거리가 아닙니다. 가구 수는 추가 감점하지 않습니다.
          </p>
        </div>
      </details>
      <details className="detail-row">
        <summary>
          <span>인허가·규제·재해</span>
          <b>
            {r.restriction.level === 'prohibited'
              ? '입지 제한 · E등급 상한'
              : r.restriction.requiresLegalReview
                ? '국가유산 관련 확인 필요 · 미산정'
                : r.disaster.status === 'hit'
                ? '재해 검토 필요'
                : `감점 ${permitDeduction}점`}
          </b>
        </summary>
        <div className="detail-body">
          <p>{summarizeRestriction(r.restriction, true)}</p>
          <p>{summarizeDisaster(r.disaster)}</p>
          {r.disaster.status === 'hit' && (
            <p>{data.constants.scoring.disaster.reviewNote}</p>
          )}
          <p>
            {r.site.label} · {r.site.detail}
          </p>
          {r.terrain && (
            <p>
              격자 중앙값 경사 {r.terrain.sample.slopeP50Deg}° · 표고 약{' '}
              {r.terrain.sample.elevM}m
            </p>
          )}
          {r.permit.deductions.map((d, i) => (
            <div className="deduction-item" key={i}>
              <strong>
                {d.label}
                <span>참고점수 −{d.points}</span>
              </strong>
              <p>{d.evidence}</p>
            </div>
          ))}
        </div>
      </details>
      <details className="detail-row">
        <summary>
          <span>전력·용수·통신 협의 기록</span>
          <b>선택 기록</b>
        </summary>
        <div className="detail-body">
          <ConsultationReview result={r} />
        </div>
      </details>
      <details className="detail-row">
        <summary>
          <span>사업비·지연 금융비용</span>
          <b>선택 입력</b>
        </summary>
        <div className="detail-body">
          <CostReview result={r} />
        </div>
      </details>
      <details className="detail-row">
        <summary>
          <span>뉴스·사례 참고 목록</span>
          <b>감점 제외</b>
        </summary>
        <div className="detail-body">
          <p>
            {r.permit.newsSignal
              ? `${r.permit.newsSignal.areaLabel} · 수집 범위 내 갈등 보도 ${r.permit.newsSignal.row.conflictArticles}건`
              : '이 지역 뉴스 자료 미수집·미확인'}
          </p>
          {data.newsSignal && (
            <p>
              대상 기간 {data.newsSignal.window.from}~
              {data.newsSignal.window.to} · 수집일 {data.newsSignal.fetchedAt}
            </p>
          )}
          <p>
            기사 0건은 갈등이 없다는 뜻이 아닙니다. 보도량으로 주민수용성을
            평가하지 않습니다.
          </p>
          {r.permit.newsSignal?.row.top.map((a, i) => (
            <p key={i}>
              <a href={a.link} target="_blank" rel="noreferrer">
                {a.title}
              </a>{' '}
              ({a.date})
            </p>
          ))}
          {r.permit.matchedCases.map((c) => (
            <article className="case-reference" key={c.id}>
              <a href={c.source_url} target="_blank" rel="noreferrer">
                {c.name}
              </a>
              <p>{c.summary}</p>
              <button
                type="button"
                className="text-button"
                onClick={() => onFlyTo(c.lat, c.lng)}
              >
                사례 위치 보기
              </button>
            </article>
          ))}
          {r.permit.matchedCases.length === 0 && (
            <p>등록된 인근 참조 사례 없음</p>
          )}
        </div>
      </details>
      <details className="detail-row">
        <summary>
          <span>자료 출처·기준일·조회 상태</span>
        </summary>
        <div className="detail-body">
          <EvidenceList result={r} />
        </div>
      </details>
    </section>
  );
}
