import type { AppData, LandUseSource, ScoreInput, ScoreResult, SiteSelection } from '../types';
import { CONFLICT_LEVEL_LABEL, LAND_USE_LABEL } from '../scoring/engine';
import { VERDICT_GLYPH, VERDICT_LABEL, type ChecklistRow } from '../report/checklist';
import type { ParsedMemo } from '../genai/memoFormat';
import { fmtKrw } from '../lib/format';

const SOURCE_LABEL: Record<SiteSelection['source'], string> = {
  map: '지도 클릭',
  emd: '읍면동 검색',
  geocode: '주소 검색',
  coords: '좌표 입력',
};

function landUseText(input: ScoreInput, source: LandUseSource, zoningName: string | null): string {
  const label = LAND_USE_LABEL[input.landUse];
  if (source === 'auto') return `${label} · VWorld 자동 판정${zoningName ? ` (${zoningName})` : ''}`;
  if (source === 'manual') return `${label} · 수동 선택`;
  return `${label} · 미확인`;
}

export interface ReportProps {
  data: AppData;
  input: ScoreInput;
  result: ScoreResult;
  rows: ChecklistRow[];
  site: SiteSelection;
  landUseSource: LandUseSource;
  zoningName: string | null;
  memo: ParsedMemo | null;
  /** null until a run finishes; drives the footer provenance line */
  generatedBy: string | null;
  generatedAt: Date | null;
  variant: 'screen' | 'print';
}

export function ChecklistReport(props: ReportProps) {
  const { data, input, result, rows, site, landUseSource, zoningName, memo, variant } = props;
  const d = data.constants.disclaimer;
  const area = result.emd
    ? `${result.emd.sido} ${result.emd.sigungu === result.emd.sido ? '' : result.emd.sigungu} ${result.emd.emd}`.replace(/\s+/g, ' ')
    : '행정구역 매칭 실패';
  const today = props.generatedAt ?? new Date();

  const caveats = [
    ...(memo?.caveats ?? []),
    d.main,
    d.power,
    d.substation,
    d.stats,
    d.terrain,
    ...(data.permitDelay ? [d.permits] : []),
    ...(data.newsSignal ? [d.news] : []),
  ].filter(Boolean);

  const sources = Array.from(new Set(rows.flatMap((r) => r.sources).filter(Boolean)));
  const small = variant === 'print' ? 'text-[9pt]' : 'text-[11px]';

  return (
    <article className={`report ${variant === 'print' ? 'p-0 text-[10pt]' : 'text-xs'} text-gray-900`}>
      <header className="avoid-break border-b border-gray-400 pb-2">
        <h1 className={variant === 'print' ? 'text-[16pt] font-bold' : 'text-base font-bold'}>
          데이터센터 부지 실사 체크리스트
        </h1>
        <dl className={`mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 ${small}`}>
          <dt className="text-gray-500">작성</dt>
          <dd>데이터센터팀 부지 실사 담당</dd>
          <dt className="text-gray-500">작성일</dt>
          <dd>{today.toLocaleDateString('ko-KR')}</dd>
          <dt className="text-gray-500">위치</dt>
          <dd>
            {area} · {site.lat.toFixed(5)}, {site.lng.toFixed(5)} ({SOURCE_LABEL[site.source]})
            {site.label ? ` · ${site.label}` : ''}
          </dd>
          <dt className="text-gray-500">용도지역</dt>
          <dd>{landUseText(input, landUseSource, zoningName)}</dd>
          <dt className="text-gray-500">부지 판정</dt>
          <dd>{result.site.label} — {result.site.detail}</dd>
          <dt className="text-gray-500">사업 가정</dt>
          <dd>
            총사업비 {(input.capexKrw / 1e8).toLocaleString()}억원 · 연 금리{' '}
            {(input.annualRate * 100).toFixed(1)}%
          </dd>
        </dl>
      </header>

      <section className="avoid-break mt-3 border border-gray-300 p-2">
        <h2 className="text-sm font-bold">종합 판정</h2>
        <p className="mt-1">
          <b className="text-base">{result.composite.grade}</b> 등급 · {result.composite.score}점
          {result.composite.gradeCapped && ' (전력 게이트로 등급 상한 적용)'} · 전력 축{' '}
          {result.power.score}점 · 인허가 축 {result.permit.score}점
        </p>
        <p className={`mt-0.5 ${small}`}>
          공급가능 변전소 {result.gate.substationCount}곳 · 확보 전력 추정 {result.power.capacityBand}
        </p>
        <p className={`mt-0.5 ${small}`}>
          주민 갈등 가능성 <b>{CONFLICT_LEVEL_LABEL[result.permit.conflictRisk.level]}</b> · 갈등 사례·뉴스
          감점 합 −{result.permit.conflictRisk.points} (사례 {result.permit.matchedCases.length}건 · 기사{' '}
          {result.permit.newsSignal?.row.conflictArticles ?? 0}건)
        </p>
        <p className="mt-1">
          예상 인허가 지연 <b>{result.delay.minMonths}~{result.delay.maxMonths}개월</b> (점추정{' '}
          {result.delay.pointMonths}개월) · 지연 금융비용 약{' '}
          <b>{fmtKrw(result.finance.delayCostKrw)}</b> (월 {fmtKrw(result.finance.monthlyCostKrw)})
        </p>
        <p className={`mt-0.5 text-gray-500 ${small}`}>앵커 사례: {result.delay.anchor}</p>
      </section>

      {memo?.error && (
        <p className="mt-2 text-red-700">검토 의견 생성 오류: {memo.error}</p>
      )}

      <section className="mt-3">
        <h2 className="text-sm font-bold">종합 의견</h2>
        <p className="mt-1 whitespace-pre-wrap">
          {memo?.overall || <span className="text-gray-400">미작성 — AI 검토 의견을 생성하세요.</span>}
        </p>
      </section>

      <section className="mt-3">
        <h2 className="text-sm font-bold">점검 항목</h2>
        <div className={variant === 'screen' ? 'mt-1 overflow-x-auto' : ''}>
        <table
          className={`w-full border-collapse ${small} ${variant === 'screen' ? 'min-w-[560px]' : 'mt-1'}`}
        >
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '30%' }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 p-1 text-left">No</th>
              <th className="border border-gray-400 p-1 text-left">구분</th>
              <th className="border border-gray-400 p-1 text-left">항목</th>
              <th className="border border-gray-400 p-1 text-left">판정</th>
              <th className="border border-gray-400 p-1 text-left">근거</th>
              <th className="border border-gray-400 p-1 text-left">검토 의견</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const opinion = memo?.items[row.key];
              const writing = memo?.openSection?.includes(row.key) && !opinion;
              return (
                <tr key={row.key} className="align-top">
                  <td className="border border-gray-400 p-1">{i + 1}</td>
                  <td className="border border-gray-400 p-1">{row.group}</td>
                  <td className="border border-gray-400 p-1">{row.title}</td>
                  <td className="verdict border border-gray-400 p-1">
                    {VERDICT_GLYPH[row.verdict]} {VERDICT_LABEL[row.verdict]}
                    {row.points ? ` (−${row.points})` : ''}
                  </td>
                  <td className="border border-gray-400 p-1">
                    {row.evidence}
                    {row.anchor && <div className="text-gray-500">사례: {row.anchor}</div>}
                  </td>
                  <td className="border border-gray-400 p-1 whitespace-pre-wrap">
                    {opinion ?? (
                      <span className="text-gray-400">{writing ? '작성 중…' : '미작성'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      {(memo?.actions.length ?? 0) > 0 && (
        <section className="avoid-break mt-3">
          <h2 className="text-sm font-bold">권고 조치</h2>
          <ul className="mt-1 list-disc pl-5">
            {memo?.actions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      <section className="avoid-break mt-3">
        <h2 className="text-sm font-bold">한계 고지</h2>
        <ul className={`mt-1 list-disc pl-5 ${small} text-gray-700`}>
          {caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>

      <section className="sources avoid-break mt-3">
        <h2 className="text-sm font-bold">출처</h2>
        <ul className={`mt-1 list-disc pl-5 ${small} text-gray-600`}>
          {sources.map((u) => (
            <li key={u}>{u}</li>
          ))}
          <li>한국전력공사 지역별 공급가능 변전소 정보 · 데이터센터 전기공급 현황 (공공데이터포털)</li>
          <li>변전소 좌표: OpenStreetMap (참고치) · 용도지역: 국토교통부 VWorld</li>
          {data.permitDelay && <li>허가→착공 통계: {data.permitDelay.source}</li>}
          {data.terrain && <li>지형: {data.terrain.attribution}</li>}
        </ul>
      </section>

      <footer className={`mt-3 border-t border-gray-300 pt-1 ${small} text-gray-500`}>
        생성: {props.generatedBy ?? '검토 의견 미생성'} · {today.toLocaleString('ko-KR')} · 검토 의견은
        생성형 AI 초안이며 담당자 검토 전 문서입니다.
      </footer>
    </article>
  );
}
