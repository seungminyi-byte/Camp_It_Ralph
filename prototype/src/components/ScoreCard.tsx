import type { AppData, ScoreResult } from '../types';

const GRADE_COLOR: Record<string, string> = {
  A: 'bg-green-600',
  B: 'bg-green-500',
  C: 'bg-yellow-500',
  D: 'bg-orange-500',
  E: 'bg-red-600',
};

function fmtKrw(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조원`;
  if (n >= 1e8) return `${Math.round(n / 1e8).toLocaleString()}억원`;
  return `${Math.round(n / 1e4).toLocaleString()}만원`;
}

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
  onAssumeLand,
}: {
  result: ScoreResult;
  data: AppData;
  onAssumeLand: () => void;
}) {
  const r = result;

  // Open water is not a site: showing a grade for it invites the reader to trust a number that
  // only looks good because nobody lives there.
  if (r.site.status === 'sea') {
    return (
      <section className="border-b border-gray-200 p-4">
        <div className="rounded border border-sky-300 bg-sky-50 p-3">
          <div className="text-sm font-bold text-sky-900">해상·수역 — 평가 대상 아님</div>
          <p className="mt-1 text-xs text-sky-900">{r.site.detail}</p>
          <p className="mt-2 text-[11px] text-sky-800">
            매립·간척으로 조성된 부지라면 아래 버튼으로 평가할 수 있습니다. SRTM은 2000년 촬영
            기준이라 이후 매립지가 수역으로 남아 있습니다.
          </p>
          <button
            onClick={onAssumeLand}
            className="mt-2 rounded border border-sky-400 bg-white px-2 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
          >
            매립·간척 예정지로 간주하고 평가
          </button>
        </div>
        <div className="mt-2 text-[10px] leading-snug text-gray-400">
          {data.constants.disclaimer.terrain}
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
              <span className="ml-1 text-xs font-normal text-red-600">(전력 게이트로 등급 상한)</span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {r.emd
              ? `${r.emd.sido} ${r.emd.sigungu === r.emd.sido ? '' : r.emd.sigungu} ${r.emd.emd} 기준`.replace(/\s+/g, ' ')
              : '행정구역 매칭 실패'}
            {r.emdUncertain && (
              <span className="ml-1 rounded bg-gray-200 px-1 text-gray-600">판정 불확실</span>
            )}
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs">
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
        {r.site.status === 'coastal' && (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            연안 — 지형 판정 불확실
          </span>
        )}
        {r.site.status === 'reclaimed' && (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            매립지·공유수면 가능성
          </span>
        )}
        {r.terrain?.unsuitable && (
          <span className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white">
            급경사 산지 — 입지 부적합 가능
          </span>
        )}
      </div>

      <div className="mb-3 flex flex-col gap-2">
        <Gauge label="전력 축" score={r.power.score} />
        <Gauge label="인허가 축" score={r.permit.score} />
      </div>

      <div className="mb-3 rounded bg-gray-50 p-2 text-xs text-gray-700">
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
            뉴스 갈등 시그널: {r.permit.newsSignal.areaLabel} 최근{' '}
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
                  ` · 12개월+ 미착공 ${Math.round(r.permit.delayStat.row.stalled12mShare * 100)}%`}
              </>
            ) : (
              ' — 표본 부족으로 감점 미적용'
            )}
          </div>
        )}
      </div>

      <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2">
        <div className="text-xs text-amber-900">
          예상 인허가 지연 <b>{r.delay.minMonths}~{r.delay.maxMonths}개월</b> (점추정{' '}
          {r.delay.pointMonths}개월)
        </div>
        <div className="text-lg font-bold text-amber-900">
          지연 금융비용 약 {fmtKrw(r.finance.delayCostKrw)}
        </div>
        <div className="text-[11px] text-amber-800">
          월 {fmtKrw(r.finance.monthlyCostKrw)} × {r.delay.pointMonths}개월 · 앵커: {r.delay.anchor}
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
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 text-[10px] leading-snug text-gray-400">
        {data.constants.disclaimer.power}
        {r.terrain && ` ${data.constants.disclaimer.terrain}`}
      </div>
    </section>
  );
}
