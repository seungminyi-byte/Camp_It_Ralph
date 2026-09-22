import { SafeExternalLink } from './SafeExternalLink';
import { isEvidenceFresh } from '../lib/lookupContract';
import type { AppData, LandUseSource, OnlineEvidence, ScoreInput, ScoreResult, SiteSelection } from '../types';
import { LAND_USE_LABEL } from '../scoring/engine';
import { VERDICT_LABEL, type ChecklistRow } from '../report/checklist';
import type { ParsedMemo } from '../genai/memoFormat';
import { fmtArea, fmtKrw } from '../lib/format';
import { compareSummary, type CompareEntry } from '../compare/pins';
import { currentComparisonMessage, excerpt, reportTime, reviewGroups, SELECTION_LABELS } from '../report/presentation';
import { AreaReview, ConsultationReview, CostReview, EvidenceList } from './ReviewFacts';
export interface ReportProps {
  data: Pick<AppData, 'constants'>;
  input: ScoreInput;
  result: ScoreResult;
  rows: ChecklistRow[];
  site: SiteSelection;
  landUseSource: LandUseSource;
  zoningName: string | null;
  entries?: CompareEntry[];
  currentPinId?: string | null;
  snapshotId?: string;
  capturedAt?: string;
  evidenceRevision?: string;
  memo: ParsedMemo | null;
  memoEligible?: boolean;
  includeAiAppendix?: boolean;
  generatedBy: string | null;
  generatedAt: Date | null;
  variant: 'screen' | 'print';
}
function OnlineStatus({ input, at }: { input: Pick<ScoreInput, 'zoning' | 'restrictions' | 'disaster'>; at?: string }) {
  const values: [string, OnlineEvidence | null | undefined][] = [['용도지역', input.zoning], ['규제구역', input.restrictions], ['재해위험지구', input.disaster]];
  return <ul className="report-online-status">{values.map(([label, value]) => <li key={label}>
    <b>{label}</b>: {!value ? '조회 미확인' : value.stale || (value.fetchedAt && !isEvidenceFresh({ ...value, complete: true }, at ? Date.parse(at) : Number.POSITIVE_INFINITY)) ? '이전 조회 결과 · 재확인 필요' : value.complete ? '조회 완료' : '일부 조회 미완료'}
    {value?.fetchedAt && ` · API 조회 ${reportTime(value.fetchedAt)}`}
    {value?.previousFetchedAt && ` · 이전 조회 ${reportTime(value.previousFetchedAt)}`}
    {!!value?.failed?.length && ` · 미완료 레이어 ${value.failed.join(', ')}`}
  </li>)}</ul>;
}
function RestrictionDetails({ result }: { result: ScoreResult }) {
  return result.restriction.hits.length > 0 && <section className="report-restrictions"><h3>보호·규제구역 조회 결과 전체</h3>
    {result.restriction.hits.map((hit, i) => <article key={i}>
      <h4>{hit.name} · {hit.relation === 'nearby' ? `주변 조회 ${hit.bufferM ?? '범위 미확인'}m · 참고` : '선택 지점 직접 조회'}</h4>
      <p>원문 명칭: {hit.rawName ?? hit.name} · {hit.source === 'vworld' ? `VWorld ${hit.layer ?? ''}` : '번들 자료'}</p>
      <p>법령·적용 근거: {hit.law}</p>{hit.reviewNote && <p>{hit.reviewNote}</p>}
      {hit.sourceIds?.map(id => { const source = result.restriction.mapping?.sources[id]; return source ? <p key={id}>{source.title} · 시행일 {source.effectiveAt}<br /><SafeExternalLink href={source.url}>{source.url}</SafeExternalLink></p> : null; })}
    </article>)}
  </section>;
}
function IssueDetails({ result }: { result: ScoreResult }) {
  return <><h3>주요 제약과 미확인 사항 상세</h3><ul>{result.review.issues.map((issue, i) => <li key={i}><b>{issue.title}</b>: {issue.detail}</li>)}</ul><h3>추가로 확인할 사항 전체</h3><ol>{result.review.actions.map((action, i) => <li key={i}>{action}</li>)}</ol></>;
}
export function ChecklistReport({ data, input, result: r, rows, site, landUseSource, zoningName, entries = [], currentPinId = null, snapshotId = '미리보기', capturedAt, memo: candidateMemo, memoEligible = false, includeAiAppendix = false, generatedBy, generatedAt, variant }: ReportProps) {
  const p = r.project.assumptions;
  const groups = reviewGroups(r);
  const comparison = compareSummary(entries);
  const memo = memoEligible && includeAiAppendix && candidateMemo?.complete && !candidateMemo.error && !candidateMemo.unmapped.length && !candidateMemo.duplicates.length ? candidateMemo : null;
  const label = site.label ?? `${r.emd?.sigungu ?? ''} ${r.emd?.emd ?? '선택 지점'}`;
  const leadIssues = (issues: typeof groups.constraints, empty: string) => issues.length ? <><ul>{issues.slice(0, 3).map((issue, i) => <li key={i}>{excerpt(issue.title, 48)}</li>)}</ul>{issues.length > 3 && <p>외 {issues.length - 3}건 · 자세한 내용은 다음 쪽에서 확인</p>}</> : <p>{empty}</p>;
  const financeCell = r.finance.cells[4];
  return <article className={`business-report report-${variant}`} data-snapshot-id={snapshotId}>
    <section className="report-first-page">
      <header className="business-report-title"><span>여기 DC 돼요? · 스크리닝 참고용</span><h1>후보 부지 검토 보고서</h1><p>{capturedAt ? `보고서 기준시각 ${reportTime(capturedAt)}` : '현재 조건 미리보기'} · {snapshotId}</p></header>
      <section className="report-location"><h2>후보 위치</h2><p><b>{excerpt(label, 82)}</b><br />{site.lat.toFixed(5)}, {site.lng.toFixed(5)} · {SELECTION_LABELS[site.source]}</p></section>
      <div className={`report-decision tone-${r.review.tone}`}><strong>{r.review.label}</strong>{r.restriction.level === 'prohibited' && <p>확인된 법적 입지 제한 · E등급 상한 유지</p>}{r.restriction.requiresLegalReview && <p>국가유산 법적 적용 확인 필요 · 인허가·종합 참고점수 미산정</p>}</div>
      <div className="report-priority-columns"><section><h2>확인된 주요 제약</h2>{leadIssues(groups.constraints, '현재 확인한 자료에서 주요 제약을 찾지 못함. 미확인 자료는 별도 확인.')}</section><section><h2>중요한 미확인 사항</h2>{leadIssues(groups.unknowns, '기록된 추가 미확인 없음. 실제 공급·설계·인허가는 후속 확인.')}</section></div>
      <section className="report-brief-inputs"><h2>입력 조건·계산 요약</h2><p>수전 {p.targetMw === null ? '미입력' : `${p.targetMw}MW`} · {p.development === 'new' ? '신축' : '기존 건물 전환'}</p><p>필요 연면적 {fmtArea(r.area.requiredAreaM2)} · {p.development === 'new' ? `최소 대지 ${fmtArea(r.area.minimumLandM2)} · 확보 ${fmtArea(r.conditions.landAreaM2)}` : `확보 건물 ${fmtArea(r.conditions.existingAreaM2)}`}{r.area.status === 'shortfall' && ` · 부족 ${fmtArea(r.area.shortfallM2)}`}</p><p>{r.area.status === 'unknown' && '면적 계산 보류 · '}{r.businessCost.label} {fmtKrw(r.businessCost.amountKrw)}{!r.businessCost.complete && ' · 비용 범위 미완료'}</p><p>평균 차입잔액 {fmtKrw(r.finance.debtKrw)} · 금융비용 {financeCell ? `${Number.isFinite(financeCell.annualRate) ? Number((financeCell.annualRate * 100).toFixed(4)) + '%' : '금리 미확인'} / ${financeCell.months}개월: ${fmtKrw(financeCell.costKrw)}` : '계산 보류'} <span>(가운데 가정, 전체 표는 상세)</span></p></section>
      <section className="report-comparison"><h2>담은 후보 비교 요약 · {entries.length}곳</h2><p>{currentComparisonMessage(entries, currentPinId)}{entries.length === 1 && ' · 2곳 이상에서 후보 간 비교 가능'}</p>
        {entries.length > 0 && <table><thead><tr><th scope="col">담은 순서·후보</th><th scope="col">주요 제약 / 미확인</th><th scope="col">면적 검토</th><th scope="col">입력 사업비</th></tr></thead><tbody>{entries.map(({ pin, result }, i) => { const group = reviewGroups(result); return <tr key={pin.id}><th scope="row">{i + 1}. {excerpt(pin.selection.label ?? `${pin.selection.lat.toFixed(4)}, ${pin.selection.lng.toFixed(4)}`, 25)}{pin.id === currentPinId && ' (현재)'}</th><td>{group.constraints[0] ? excerpt(group.constraints[0].title, 22) : '확인 제약 없음'}{group.constraints.length > 1 && ` 외 ${group.constraints.length - 1}건`}<br />확인할 사항 {group.unknowns.length}건</td><td>{result.area.status === 'shortfall' ? `부족 ${fmtArea(result.area.shortfallM2)}` : result.area.label}</td><td>{fmtKrw(result.businessCost.amountKrw)}{!result.businessCost.complete && ' (부분·미완료)'}</td></tr>; })}</tbody></table>}
        {entries.length > 1 && <p>{comparison ? `입력 사업비 차이 ${fmtKrw(comparison.diffKrw)} (최대 - 최소). 동일 가격 기준인지 확인하세요.` : '사업비 차액 계산 보류 · 비용 방식·범위가 같고 모든 입력이 완전해야 합니다.'}</p>}
        {!!entries.length && <p>설계·금리 가정은 공통입니다. 각 후보의 입력 조건과 근거는 다음 쪽에서 확인할 수 있습니다.</p>}
      </section>
      <section className="report-next"><h2>다음 확인사항</h2><ol>{r.review.actions.slice(0, 3).map((action, i) => <li key={i}>{excerpt(action, 112)}</li>)}</ol>{r.review.actions.length > 3 && <p>외 {r.review.actions.length - 3}건 · 전체 목록은 다음 쪽에서 확인</p>}</section>
      <p className="report-source-note">한전 목록 {r.evidence.find(e => e.key === 'power')?.period ?? r.evidence[0]?.period ?? '기준일 미확인'} · 인구 {r.evidence.find(e => e.key === 'population')?.period ?? '기준일 상세 참조'}. 공개자료·사용자 입력·계산 가정의 요약입니다. 자료별 기준일·API 조회시각·부분 조회·출처 URL은 상세에 구분합니다. 보고서 기준시각은 자료 기준일이 아닙니다.</p>
      <footer>스크리닝 참고용, 한전 공식 검토·법률 판단 대체 불가. 요약 1쪽 · 다음 쪽부터 상세 내용</footer>
    </section>
    <section className="report-detail-page">
      <h2>현재 후보 상세 · {label}</h2><p>{site.lat.toFixed(5)}, {site.lng.toFixed(5)} · {SELECTION_LABELS[site.source]} · 보고서 {snapshotId}</p>
      <h3>입력 조건과 면적 가정</h3><p>용도지역: {LAND_USE_LABEL[input.landUse]} · {landUseSource === 'manual' ? '사용자 선택' : zoningName ?? '조회 미확인'}</p><p>용적률 {r.conditions.farPct ?? '미입력'}% · 건폐율 {r.conditions.coveragePct ?? '미입력'}% · 지상 {r.conditions.floors ?? '미입력'}층 · 대지 {fmtArea(r.conditions.landAreaM2)} · 확보 건물 {fmtArea(r.conditions.existingAreaM2)}</p><p>IT부하 {p.itMw ?? '미입력'}MW · 랙당 전력 {p.rackKw ?? '미입력'}kW · 통로 포함 랙당 면적 {p.rackAreaM2 ?? '미입력'}㎡ · 전산실 비중 {p.whiteSpacePct ?? '미입력'}%</p>
      <AreaReview result={r} /><h3>공급 협의 기록 · 사용자 입력</h3><ConsultationReview result={r} /><h3>사업비·지연 금융비용 상세</h3><CostReview result={r} /><IssueDetails result={r} /><RestrictionDetails result={r} />
      <h2>온라인 조회 상태</h2><p>API 조회시각은 원자료 기준일이 아닙니다. 실패·부분 조회는 미해당을 뜻하지 않습니다.</p><OnlineStatus input={input} at={capturedAt} />
      <h2>항목별 근거</h2><table className="business-checklist"><thead><tr><th scope="col">항목</th><th scope="col">자료 상태와 근거</th></tr></thead><tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.group}<br />{row.title}</th><td><b>{VERDICT_LABEL[row.verdict]}</b><p>{row.evidence}</p>{row.sources.map((source, i) => <p className="report-source-url" key={i}><SafeExternalLink href={source}>출처 {i + 1}: {source}</SafeExternalLink></p>)}</td></tr>)}</tbody></table>
      <h2>자료 출처·기준일·공간 단위·한계</h2><EvidenceList result={r} /><h3>참고점수 · 보조 정보</h3><p>{r.composite.score === null ? '미산정' : `${r.composite.score}점 · ${r.composite.grade}등급`}{r.composite.grade === 'E' && ' · 확인된 법적 입지 제한 E등급 상한'}. 전력 {r.power.score ?? '미산정'}, 인허가 {r.permit.score ?? '미산정'}. 점수만으로 사업 적합·부적합을 결정하지 않습니다.</p>
      {r.composite.score === null && <p>참고점수 산정에 필요한 확인사항: {r.composite.unavailableReasons.join(' · ')}</p>}
    <footer>{data.constants.disclaimer.main}<br />{data.constants.disclaimer.review}<br />보고서 {snapshotId} · {capturedAt ? reportTime(capturedAt) : '미리보기'}</footer>
    </section>
    {entries.length > 0 && <section className="report-comparison-detail"><h2>담은 후보 상세 · 실제 저장 순서</h2>{entries.map(({ pin, result }, i) => <section key={pin.id} className="report-pin-detail"><h2>{i + 1}. {pin.selection.label ?? `${pin.selection.lat.toFixed(5)}, ${pin.selection.lng.toFixed(5)}`}{pin.id === currentPinId && ' (현재 후보)'}</h2><p>{pin.selection.lat.toFixed(5)}, {pin.selection.lng.toFixed(5)} · {SELECTION_LABELS[pin.selection.source]} · 용도지역 {LAND_USE_LABEL[pin.landUse]} ({pin.manualLandUse === null ? '자동 조회 기준' : '사용자 선택'})</p><AreaReview result={result} /><CostReview result={result} /><ConsultationReview result={result} /><IssueDetails result={result} /><RestrictionDetails result={result} /><OnlineStatus input={pin} at={capturedAt} /><EvidenceList result={result} /></section>)}</section>}
    {memo && <section className="report-ai"><h2>선택 부록 · AI 검토 의견</h2><p>이 보고서의 입력·근거와 일치하여 열기 시점에 적격했던 의견을 사용자가 선택했습니다. 수치·단위와 대표 확정 표현을 대조했으나 모든 자연어 의미나 원자료를 검증한 것은 아닙니다. 담당자 확인이 필요합니다.</p><p>{generatedBy} · {generatedAt && reportTime(generatedAt.toISOString())}</p><p>{memo.overall}</p>{rows.map(row => <p key={row.key}><b>{row.title}</b>: {memo.items[row.key]}</p>)}<ul>{memo.actions.map((action, i) => <li key={i}>{action}</li>)}</ul>{memo.caveats.map((caveat, i) => <p key={i}>{caveat}</p>)}</section>}
  </article>;
}
