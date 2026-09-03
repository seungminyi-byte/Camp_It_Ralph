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

export function ScoreCard({ result, data }: { result: ScoreResult; data: AppData }) {
  const r = result;
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
        {r.permit.nearestSchool && (
          <div>
            최근접 학교: {r.permit.nearestSchool.name} (
            {(r.permit.nearestSchool.distanceKm * 1000).toFixed(0)}m)
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
      </div>
    </section>
  );
}
