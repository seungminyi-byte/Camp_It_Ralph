import type { AppData, LandUseSource, ScoreInput, ScoreResult, SiteSelection } from '../types';
import { CONFLICT_LEVEL_LABEL, LAND_USE_LABEL } from '../scoring/engine';
import { VERDICT_GLYPH, VERDICT_LABEL, type ChecklistRow } from '../report/checklist';
import type { ParsedMemo } from '../genai/memoFormat';
import { fmtKrw, gradeCapNote } from '../lib/format';
import { summarizeRestriction } from '../scoring/restriction';
import { siteVerdict } from '../lib/verdict';
import { summarizeDisaster } from '../lib/disasterSummary';

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
    : '행정구역 미확인';
  const today = props.generatedAt ?? new Date();

  const caveats = [
    ...(memo?.caveats ?? []),
    d.main,
    d.power,
    d.substation,
    d.stats,
    d.terrain,
    d.restriction,
    d.disaster,
    ...(data.permitDelay ? [d.permits] : []),
    ...(data.newsSignal ? [d.news] : []),
  ].filter(Boolean);

  const sources = Array.from(new Set(rows.flatMap((r) => r.sources).filter(Boolean)));
  const small = variant === 'print' ? 'text-[9pt]' : 'text-[11px]';
  const verdict = siteVerdict(result, input.landUse === 'unknown');
  const gradeTone = verdict.tone;
  const decision = verdict.label;
  const capNote = gradeCapNote(result, data.constants.scoring.composite);
  const riskRows = rows.filter((row) => row.verdict === 'risk' || row.verdict === 'caution');

  return (
    <article className={`report report-${variant} ${variant === 'print' ? 'p-0 text-[10pt]' : 'text-xs'}`}>
      <header className="report-masthead avoid-break">
        <div className="report-brand-line" />
        <div className="report-title-row">
          <div>
            <p className="report-kicker">데이터센터팀 · 부지 실사 담당</p>
            <h1>데이터센터 부지 사전검토 보고서</h1>
          </div>
          <div className="report-document-state">
            <span>사전 검토</span>
            <b>{today.toLocaleDateString('ko-KR')}</b>
          </div>
        </div>
        <div className="report-site-heading">
          <div>
            <span>검토 대상지</span>
            <h2>{area}</h2>
            <p>{site.lat.toFixed(5)}, {site.lng.toFixed(5)} · {SOURCE_LABEL[site.source]}{site.label ? ` · ${site.label}` : ''}</p>
          </div>
          <div className="report-project-tag">{result.project.profile.targetMw}<small>MW</small></div>
        </div>
      </header>

      <section className="report-summary avoid-break">
        <div className={`report-grade report-tone-${gradeTone}`}>
          <span>종합 등급</span><strong>{result.composite.grade}</strong><small>{result.composite.score} / 100</small>
        </div>
        <div className="report-summary-copy">
          <div><span>핵심 판단</span><b className={`report-decision report-tone-${gradeTone}`}>{decision}</b></div>
          <p>{result.site.label} · {result.site.detail}</p>
          {capNote && <p>{capNote}</p>}
        </div>
      </section>

      <section className="report-kpis avoid-break">
        <div><span>전력 여건</span><strong>{result.power.score}<small>점</small></strong><p>{result.power.capacityBand}</p></div>
        <div><span>인허가·부지</span><strong>{result.permit.score}<small>점</small></strong><p>갈등 {CONFLICT_LEVEL_LABEL[result.permit.conflictRisk.level]}</p></div>
        <div><span>예상 지연</span><strong>{result.delay.pointMonths}<small>개월</small></strong><p>{result.delay.minMonths}~{result.delay.maxMonths}개월</p></div>
        <div><span>지연 금융비용</span><strong>{fmtKrw(result.finance.delayCostKrw)}</strong><p>월 {fmtKrw(result.finance.monthlyCostKrw)}</p></div>
      </section>

      <section className="report-facts avoid-break">
        <div><span>사업 가정</span><b>{result.project.profile.label} {result.project.profile.targetMw}MW · {(input.capexKrw / 1e8).toLocaleString()}억원 · 연 {(input.annualRate * 100).toFixed(1)}%</b></div>
        <div><span>용도지역</span><b>{landUseText(input, landUseSource, zoningName)}</b></div>
        <div><span>보호·규제구역</span><b>{summarizeRestriction(result.restriction)}</b></div>
        <div><span>재해위험지구</span><b>{summarizeDisaster(result.disaster)}</b></div>
        <div><span>핵심 리스크</span><b>{riskRows.length}개 항목 주의·부적합</b></div>
        <div><span>전력 접점</span><b>공급가능 변전소 {result.gate.substationCount}곳</b></div>
      </section>

      {memo?.error && (
        <p className="mt-2 text-red-700">검토 의견 생성 오류: {memo.error}</p>
      )}

      <section className="report-opinion avoid-break">
        <div className="report-section-title"><span>01</span><h2>종합 검토 의견</h2></div>
        <p className="whitespace-pre-wrap">
          {memo?.overall || <span className="text-gray-400">미작성 — AI 검토 의견을 생성하세요.</span>}
        </p>
      </section>

      <section className="report-checklist">
        <div className="report-section-title"><span>02</span><h2>분야별 검토 항목</h2><small>총 {rows.length}개 항목</small></div>
        {variant === 'screen' ? (
          <div className="report-checklist-list">
            {rows.map((row, i) => {
              const opinion = memo?.items[row.key];
              const writing = memo?.openSection?.includes(row.key) && !opinion;
              return <article key={row.key} className="report-check-row">
                <header><span>{String(i + 1).padStart(2, '0')} · {row.group}</span><b className={`report-verdict verdict-${row.verdict}`}>{VERDICT_GLYPH[row.verdict]} {VERDICT_LABEL[row.verdict]}{row.points ? ` −${row.points}` : ''}</b></header>
                <h3>{row.title}</h3>
                <p>{row.evidence}</p>
                {row.anchor && <small>참조 · {row.anchor}</small>}
                <div className="report-row-opinion"><span>검토 의견</span>{opinion ?? <i>{writing ? '작성 중…' : 'AI 의견 미작성'}</i>}</div>
              </article>;
            })}
          </div>
        ) : <div>
        <table
          className={`w-full border-collapse ${small} mt-1`}
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
        </div>}
      </section>

      {(memo?.actions.length ?? 0) > 0 && (
        <section className="report-actions-list avoid-break">
          <div className="report-section-title"><span>03</span><h2>우선 권고 조치</h2></div>
          <ul className="mt-1 list-disc pl-5">
            {memo?.actions.map((a, i) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      <section className="report-notes avoid-break">
        <h2>검토 한계 및 유의사항</h2>
        <ul className={`mt-1 list-disc pl-5 ${small} text-gray-700`}>
          {caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>

      <section className="report-sources sources avoid-break">
        <h2>데이터 출처</h2>
        <ul className={`mt-1 list-disc pl-5 ${small} text-gray-600`}>
          {sources.map((u) => (
            <li key={u}>{u}</li>
          ))}
          <li>한국전력공사 지역별 공급가능 변전소 정보 · 데이터센터 전기공급 현황 (공공데이터포털)</li>
          <li>변전소 좌표: OpenStreetMap (참고치) · 용도지역: 국토교통부 VWorld</li>
          <li>
            법정 보호·규제구역: 국립공원공단 국립공원 공원경계 · 한국보호지역 데이터(KDPA, 2016.12 기준) (공공데이터포털) ·
            개발제한구역·상수원보호구역·국가유산 보호구역·농업진흥지역·도시자연공원구역: 국토교통부 VWorld
          </li>
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
