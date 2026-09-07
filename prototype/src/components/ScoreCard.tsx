import type { AppData, ConflictLevel, ScoreResult } from '../types';
import { GRADE_COLOR, fmtKrw } from '../lib/format';
import { CONFLICT_LEVEL_LABEL } from '../scoring/engine';
import { summarizeDisaster } from '../lib/disasterSummary';

// Soft tints only: solid red stays reserved for hard blockers (조례상 입지 불가, 급경사 산지).
const CONFLICT_BADGE: Record<ConflictLevel, string> = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
};

function Gauge({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 45 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className="font-semibold">{score}</span>
      </div>
      <div className="h-2 rounded bg-gray-200">
        <div className={`h-2 rounded ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function ScoreCard({
  result,
  data,
  onFlyTo,
}: {
  result: ScoreResult;
  data: AppData;
  /** pan the map to a related case — the drawer used to do this */
  onFlyTo?: (lat: number, lng: number) => void;
}) {
  const r = result;

  // Outside the bundled South Korean data every number would be borrowed from the nearest 읍면동
  // across the border or the sea, so say so instead of grading.
  if (r.site.status === 'outside') {
    return (
      <section className="border-b border-gray-200 p-4">
        <div className="rounded border border-gray-300 bg-gray-100 p-3">
          <div className="text-sm font-bold text-gray-800">판독 불가 — 남한 자료 범위 밖</div>
          <p className="mt-1 text-xs text-gray-700">{r.site.detail}</p>
          <p className="mt-2 text-[11px] text-gray-600">
            전력·인허가·지형 자료가 남한 육상 기준이라 이 지점은 평가하지 않습니다. 남한 내 지점을
            클릭하거나 읍면동·주소로 검색하세요.
          </p>
        </div>
      </section>
    );
  }

  // Open water is a hard blocker. Reclaimed land needs objective corroboration instead of a
  // manual escape hatch.
  if (r.site.status === 'sea') {
    return (
      <section className="border-b border-gray-200 p-4">
        <div className="rounded border border-sky-300 bg-sky-50 p-3">
          <div className="text-sm font-bold text-sky-900">판정 부적합 — 해상·수역</div>
          <p className="mt-1 text-xs text-sky-900">{r.site.detail}</p>
          <p className="mt-2 text-[11px] text-sky-800">
            해상·수역에는 종합점수와 등급을 부여하지 않습니다. 실제 매립·간척지라면 VWorld
            용도지역 또는 등재된 매립지 자료로 육지 여부가 확인되어야 평가할 수 있습니다.
          </p>
        </div>
        <div className="mt-2 text-[10px] leading-snug text-gray-400">
          {data.constants.disclaimer.terrain}
        </div>
      </section>
    );
  }

  if (!r.site.eligible) {
    return (
      <section className="border-b border-gray-200 p-4">
        <div className="rounded border border-amber-300 bg-amber-50 p-3">
          <div className="text-sm font-bold text-amber-900">{r.site.label}</div>
          <p className="mt-1 text-xs text-amber-900">{r.site.detail}</p>
          <p className="mt-2 text-[11px] text-amber-800">
            육지 여부가 확인되지 않아 종합점수와 등급을 표시하지 않습니다.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-gray-200 p-4">
      <div className="mb-1 flex items-center gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg text-2xl font-black text-white ${GRADE_COLOR[r.composite.grade]}`}
        >
          {r.composite.grade}
        </div>
        <div>
          <div className="text-sm font-bold">
            종합 {r.composite.score}점
            {r.composite.gradeCapped && (
              <span className="ml-1 text-xs font-normal text-red-600">
                (공급가능 변전소 미확인으로 {data.constants.scoring.composite.gateFailGradeCap}등급 이하로 제한)
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {r.emd
              ? `${r.emd.sido} ${r.emd.sigungu === r.emd.sido ? '' : r.emd.sigungu} ${r.emd.emd} 기준`.replace(/\s+/g, ' ')
              : '행정구역 미확인'}
            {r.emdUncertain && (
              <span className="ml-1 rounded bg-gray-200 px-1 text-gray-600">판정 불확실</span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">
          {r.project.profile.label} · {r.project.profile.targetMw}MW 기준
        </span>
        {r.gate.pass ? (
          <span className="rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">
            공급가능 변전소 {r.gate.substationCount}곳 (읍면동 기준)
          </span>
        ) : (
          <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
            공급가능 변전소 미확인
          </span>
        )}
        {r.permit.deductions.some((d) => d.label === '조례상 입지 불가') && (
          <span className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white">
            조례상 입지 불가
          </span>
        )}
        <span
          className={`rounded px-2 py-0.5 font-semibold ${CONFLICT_BADGE[r.permit.conflictRisk.level]}`}
          title={`사례 −${r.permit.conflictRisk.casePoints} · 인근 −${r.permit.conflictRisk.nearbyPoints} · 기사 −${r.permit.conflictRisk.newsPoints}`}
        >
          주민 갈등 가능성 {CONFLICT_LEVEL_LABEL[r.permit.conflictRisk.level]}
        </span>
        {r.site.status === 'coastal' && (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            연안 육지 확인 — 경계 검토 필요
          </span>
        )}
        {r.site.status === 'reclaimed' && (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            매립지·공유수면 가능성
          </span>
        )}
        {r.terrain?.unsuitable && (
          <span className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white">
            급경사 구간 — 정밀 검토 필요
          </span>
        )}
        {!r.project.requirementsMet && (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
            사업 규모별 전력 권장조건 미달
          </span>
        )}
      </div>

      {r.terrain?.unsuitable && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
          급경사 구간이 확인되어 토목공사비, 사면 안정성 및 산지전용 인허가 위험이 높으므로
          정밀측량 및 관할기관 검토가 필요합니다.
        </div>
      )}

      <div className={`mb-3 rounded border p-2 text-xs ${r.disaster.status === 'hit' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
        <div className="font-semibold">재해위험지구 {r.disaster.status === 'hit' ? `검토 필요 · 인허가 −${r.disaster.deduction}점` : ''}</div>
        <p className="mt-1">{summarizeDisaster(r.disaster)}</p>
        {r.disaster.status === 'hit' && <p className="mt-1">{data.constants.scoring.disaster.reviewNote}</p>}
      </div>

      <div className="mb-3 flex flex-col gap-2">
        <Gauge label="전력 수전 가능성" score={r.power.score} />
        <Gauge label="인허가 여건" score={r.permit.score} />
      </div>

      <div className="mb-3 rounded bg-gray-50 p-2 text-xs text-gray-700">
        <div>
          사업 기준: <b>{r.project.profile.label} {r.project.profile.targetMw}MW급</b> · 공급가능
          변전소 {r.project.profile.minSubstations}곳 이상, 최근접 변전소{' '}
          {r.project.profile.maxSubstationKm}km 이내 권장
          {r.project.powerDeduction > 0 && (
            <span className="font-semibold text-red-600"> · 전력 적합성 −{r.project.powerDeduction}</span>
          )}
        </div>
        <div>
          확보 전력 추정: <b>{r.power.capacityBand}</b>
        </div>
        {r.power.nearestSubstation && (
          <div>
            최근접 변전소: {r.power.nearestSubstation.name} (
            {r.power.nearestSubstation.distanceKm.toFixed(1)}km, OSM 참고치)
          </div>
        )}
        <div>반경 1km 인구: 약 {r.permit.popNearby.toLocaleString()}명</div>
        {r.terrain && (
          <div>
            지형: 중앙값 경사 {r.terrain.sample.slopeP50Deg}° ·{' '}
            {data.terrain?.steepThresholdDeg ?? 15}° 이상 {r.terrain.sample.steepPct}% · 표고 약{' '}
            {r.terrain.sample.elevM}m (1km 격자)
          </div>
        )}
        {r.permit.nearestSchool && (
          <div>
            최근접 학교: {r.permit.nearestSchool.name} (
            {(r.permit.nearestSchool.distanceKm * 1000).toFixed(0)}m)
          </div>
        )}
        {r.permit.newsSignal && (
          <div>
            뉴스 갈등 보도: {r.permit.newsSignal.areaLabel} 최근{' '}
            {data.newsSignal?.window.months ?? 24}개월 반대·갈등 기사{' '}
            <b>{r.permit.newsSignal.row.conflictArticles}건</b> (데이터센터 기사 전체{' '}
            {r.permit.newsSignal.row.articles}건)
            {r.permit.newsSignal.row.top[0] && (
              <>
                {' · '}
                <a
                  className="underline hover:text-blue-600"
                  href={r.permit.newsSignal.row.top[0].link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {r.permit.newsSignal.row.top[0].title}
                </a>
              </>
            )}
          </div>
        )}
        <div>
          주민 갈등 신호: 동일·인근 시군구 사례 {r.permit.matchedCases.length}건 · 반대·갈등 기사{' '}
          {r.permit.newsSignal?.row.conflictArticles ?? 0}건 → 감점 합 −{r.permit.conflictRisk.points}
        </div>
        {r.permit.delayStat && (
          <div>
            허가→착공 실적: {r.permit.delayStat.areaLabel} 대형 신축 {r.permit.delayStat.row.n}건
            {r.permit.delayStat.enough ? (
              <>
                , 허가→착공 중앙값 <b>{r.permit.delayStat.row.medianMonths}개월</b>
                {r.permit.delayStat.baselineMedianMonths !== null &&
                  ` (조사 시군구 전체 ${r.permit.delayStat.baselineMedianMonths}개월${
                    r.permit.delayStat.ratio !== null ? `, ${r.permit.delayStat.ratio.toFixed(1)}배` : ''
                  })`}
                {r.permit.delayStat.row.stalled12mShare !== null &&
                  ` · 12개월 이상 미착공 ${Math.round(r.permit.delayStat.row.stalled12mShare * 100)}%`}
              </>
            ) : (
              ' — 표본 부족으로 감점 미적용'
            )}
          </div>
        )}
      </div>

      <p className="mb-3 text-[10px] leading-snug text-gray-400">
        사업 유형별 전력 기준은 공개자료 기반 예비 적합성 기준이며 한국전력의 전력공급 가능 검토를
        대체하지 않습니다.
      </p>

      <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2">
        <div className="text-xs text-amber-900">
          예상 인허가 지연 <b>{r.delay.minMonths}~{r.delay.maxMonths}개월</b> (대표값{' '}
          {r.delay.pointMonths}개월)
        </div>
        <div className="text-lg font-bold text-amber-900">
          지연 금융비용 약 {fmtKrw(r.finance.delayCostKrw)}
        </div>
        <div className="text-[11px] text-amber-800">
          월 {fmtKrw(r.finance.monthlyCostKrw)} × {r.delay.pointMonths}개월 · 참조 사례: {r.delay.anchor}
        </div>
      </div>

      {r.permit.deductions.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-bold text-gray-700">감점 사유</h3>
          <ul className="flex flex-col gap-1">
            {r.permit.deductions.map((d, i) => (
              <li key={i} className="rounded border border-gray-200 p-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="font-semibold">{d.label}</span>
                  <span className="font-bold text-red-600">−{d.points}</span>
                </div>
                <div className="text-gray-600">{d.evidence}</div>
                {d.anchor && <div className="text-[11px] text-gray-400">사례: {d.anchor}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.permit.matchedCases.length > 0 && (
        <div className="mt-2 text-[11px] text-gray-500">
          관련 사례:{' '}
          {r.permit.matchedCases.map((c, i) => (
            <span key={c.id}>
              {i > 0 && ' · '}
              <a
                className="underline hover:text-blue-600"
                href={c.source_url}
                target="_blank"
                rel="noreferrer"
              >
                {c.name}
              </a>
              {onFlyTo && (
                <button
                  type="button"
                  onClick={() => onFlyTo(c.lat, c.lng)}
                  className="ml-0.5 rounded border border-gray-300 px-1 text-[10px] text-gray-500 hover:bg-gray-100"
                  title="지도에서 보기"
                >
                  지도
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
