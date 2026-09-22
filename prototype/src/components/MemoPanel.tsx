import { memoContextKey, memoContextSnapshot } from '../genai/memoContext';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppData, LandUseSource, ScoreInput, ScoreResult, SiteSelection } from '../types';
import { buildChecklist } from '../report/checklist';
import { buildMemoPrompt, promptSizeIssue } from '../genai/prompts';
import { parseMemo, type ParsedMemo } from '../genai/memoFormat';
import { generateMemo, type GenerateMeta, type LlmMode } from '../genai/llmClient';
import { buildMemoFacts, isMemoAppendixEligible, MEMO_CHECK_LIMIT, validateMemo, type MemoRunStatus } from '../genai/memoValidation';
import { printWithTitle, reportFileTitle } from '../lib/print';
import { ChecklistReport } from './ChecklistReport';
import { captureReport, type ReportSnapshot } from '../report/snapshot';
import { scoreSite } from '../scoring/engine';
import { toScoreInput, type CompareEntry } from '../compare/pins';
import { reportTime } from '../report/presentation';
import { PrintPortal } from './PrintPortal';
interface Run {
  id: number;
  revision: number;
  context: string;
  raw: string;
  parsed: ParsedMemo;
  mode: LlmMode | null;
  meta: GenerateMeta;
  status: MemoRunStatus;
  error?: string;
  at: Date;
}
interface Props {
  data: AppData;
  input: ScoreInput;
  result: ScoreResult;
  site: SiteSelection;
  landUseSource: LandUseSource;
  zoningName: string | null;
  entries?: CompareEntry[];
  currentPinId?: string | null;
  selectionRevision?: number;
  /** Includes query key, request revision and status, even when lookup remains null. */
  requestRevision?: string;
  onPreviewOpen?: () => void;
}
export function MemoPanel({ data, input, result, site, landUseSource, zoningName, entries = [], currentPinId = null, selectionRevision = 0, requestRevision = '', onPreviewOpen }: Props) {
  const [run, setRun] = useState<Run | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [printPending, setPrintPending] = useState(false);
  const reportButton = useRef<HTMLButtonElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [appendixRun, setAppendixRun] = useState<number | null>(null);
  const control = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const revision = useRef(0);
  const [contextRevision, setContextRevision] = useState(0);
  const mounted = useRef(false);
  const rows = useMemo(() => buildChecklist(result, data, { input, landUseSource, zoningName }), [result, data, input, landUseSource, zoningName]);
  const context = JSON.stringify([memoContextSnapshot(input, result, rows), site, landUseSource, zoningName, selectionRevision, requestRevision]);
  const latestContext = useRef(context);
  // Every committed context transition invalidates the run, including a later revert to the old value.
  useLayoutEffect(() => {
    if (latestContext.current !== context) {
      latestContext.current = context;
      revision.current++;
      setContextRevision(revision.current);
      generation.current++;
      control.current?.abort();
    }
  }, [context]);
  useLayoutEffect(() => {
    mounted.current = true;
    setContextRevision(revision.current);
    const cancel = () => { mounted.current = false; generation.current++; revision.current++; control.current?.abort(); };
    return cancel;
  }, []);
  const stale = run !== null && (run.context !== context || run.revision !== contextRevision);
  const busy = run?.status === 'streaming' && !stale;
  const facts = useMemo(() => buildMemoFacts(result, rows, data), [result, rows, data]);
  const flags = useMemo(() => run && !stale ? validateMemo(run.parsed, facts) : [], [run, stale, facts]);
  const eligible = !!run && isMemoAppendixEligible(run.parsed, run.status, !stale, flags);
  const includeAppendix = eligible && appendixRun === run?.id;
  const generatedBy = run && !stale && run.mode ? run.mode === 'proxy'
    ? `AI 생성${run.meta.model ? ` · ${run.meta.model}` : ''}`
    : '평가조건이 일치하는 사전 생성 의견' : null;
  const start = async () => {
    if (!result.site.eligible) return;
    control.current?.abort();
    const controller = new AbortController();
    control.current = controller;
    const id = ++generation.current, atRevision = revision.current, atContext = context;
    const current = () => mounted.current && !controller.signal.aborted && generation.current === id && revision.current === atRevision && latestContext.current === atContext;
    const update = (change: (previous: Run) => Run) => {
      if (!current()) return;
      setRun(previous => current() && previous?.id === id && previous.revision === atRevision && previous.context === atContext ? change(previous) : previous);
    };
    setAppendixRun(null);
    setRun({ id, revision: atRevision, context: atContext, raw: '', parsed: parseMemo(''), mode: null, meta: {}, status: 'streaming', at: new Date() });
    try {
      const prompt = buildMemoPrompt(data, input, result, rows, { site, landUseSource, zoningName });
      const sizeIssue = promptSizeIssue(prompt);
      if (sizeIssue) throw new Error(sizeIssue);
      const contextKey = await memoContextKey(input, result, rows);
      if (!current()) return;
      await generateMemo(prompt, {
        signal: controller.signal,
        fallbackAt: { lat: input.lat, lng: input.lng, contextKey },
        onText: text => update(previous => { const raw = previous.raw + text; return { ...previous, raw, parsed: parseMemo(raw) }; }),
        onReplace: raw => update(previous => ({ ...previous, raw, parsed: parseMemo(raw), meta: {} })),
        onMode: (mode, meta) => update(previous => ({ ...previous, mode, meta: meta ?? {} })),
      });
      update(previous => previous.parsed.visible.trim() && !previous.parsed.error
        ? { ...previous, status: 'done' }
        : { ...previous, status: 'error', error: 'AI 응답이 비어 있거나 오류로 종료되었습니다. 기본 보고서는 계속 사용할 수 있습니다.' });
    } catch (error) {
      update(previous => ({ ...previous, status: 'error', error: error instanceof Error ? error.message : 'AI 의견을 생성하지 못했습니다. 기본 보고서는 계속 사용할 수 있습니다.' }));
    }
  };
  const stop = () => {
    control.current?.abort();
    const oldId = generation.current++;
    const stoppedId = generation.current;
    // Preserve a stopped draft for inspection while giving it the new inert identity.
    setRun(previous => previous?.id === oldId ? { ...previous, id: stoppedId, status: 'stopped' } : previous);
    setAppendixRun(null);
  };
  const sourceRevision = JSON.stringify([context, contextRevision, entries, currentPinId]);
  const reportProps = { data, input, result, rows, site, landUseSource, zoningName, entries, currentPinId, evidenceRevision: requestRevision,
    memo: eligible ? run?.parsed ?? null : null, memoEligible: eligible, includeAiAppendix: includeAppendix,
    generatedBy, generatedAt: run && !stale ? run.at : null };
  const openReport = (print = false) => {
    if (!result.site.eligible) return;
    onPreviewOpen?.();
    // Re-evaluate TTL at the user's action, including a suspended/background tab.
    const currentResult = scoreSite(input, data);
    const currentRows = buildChecklist(currentResult, data, { input, landUseSource, zoningName });
    const currentEntries = entries.map(({ pin }) => ({ pin, result: scoreSite(toScoreInput(pin, currentResult.project.assumptions), data) }));
    const contextStillCurrent = memoContextSnapshot(input, currentResult, currentRows) === memoContextSnapshot(input, result, rows);
    setSnapshot(captureReport({ ...reportProps, result: currentResult, rows: currentRows, entries: currentEntries,
      memoEligible: eligible && contextStillCurrent, includeAiAppendix: includeAppendix && contextStillCurrent }, sourceRevision));
    setPrintPending(print);
    requestAnimationFrame(() => preview.current?.focus());
  };
  useEffect(() => {
    if (!snapshot || !printPending) return;
    let cancelled = false;
    const ready = async () => {
      await document.fonts?.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (!cancelled && document.querySelector('#print-root [data-snapshot-id]')?.getAttribute('data-snapshot-id') === snapshot.snapshotId) {
        setPrintPending(false);
        printWithTitle(reportFileTitle(snapshot.site.label ?? (snapshot.result.emd ? `${snapshot.result.emd.sigungu}${snapshot.result.emd.emd}` : null), new Date(snapshot.capturedAt)));
      }
    };
    void ready();
    return () => { cancelled = true; };
  }, [snapshot, printPending]);

  return <section className="memo-panel">
    <header className="report-tools-header"><div><span>보고서 미리보기</span><h2>부지 검토 보고서</h2></div>{generatedBy && <span className="report-generation-badge">{generatedBy}</span>}</header>
    <div className="report-actions">
      <button disabled={!result.site.eligible} onClick={busy ? stop : () => void start()} className={`report-ai-button${busy ? ' is-stop' : ''}`}><span aria-hidden="true">{busy ? '■' : '✦'}</span>{busy ? '생성 중지' : run ? 'AI 검토 의견 다시 생성' : 'AI 검토 의견 생성'}</button>
      <button ref={reportButton} disabled={!result.site.eligible} onClick={() => openReport()} className="report-open-button">{snapshot ? '최신 조건으로 다시 열기' : '보고서 열기'}</button>
      <button onClick={() => snapshot ? setPrintPending(true) : openReport(true)} disabled={printPending || (!snapshot && !result.site.eligible)} className="report-pdf-button">{printPending ? '인쇄 준비 중' : 'PDF 저장'} <span aria-hidden="true">↗</span></button>
    </div>
    <p className="mt-2 text-xs">기본 보고서는 AI 없이 출력됩니다. AI 의견은 별도 대조 후 선택한 경우에만 부록에 포함됩니다.</p>
    {!result.site.eligible && <p role="status">현재 지점은 {result.site.label}입니다. 새 보고서·AI 의견을 생성할 수 없습니다. 이미 연 보고서는 열기 시점 내용으로 유지됩니다.</p>}
    {stale && <p role="status" className="mt-2 text-xs text-amber-900">입력 또는 근거 자료가 변경되어 이전 AI 의견을 해제했습니다. 새 보고서를 열면 현재 조건이 반영됩니다.</p>}
    {run && !stale && <div className="mt-2 text-xs" aria-live="polite">
      {busy && <p>AI 의견 생성 중 · 아직 보고서에 포함할 수 없습니다.</p>}
      {run.status === 'stopped' && <p>생성을 중단했습니다. 작성 중인 의견은 보고서에 포함되지 않습니다.</p>}
      {run.status === 'error' && <p role="alert" className="text-red-600">{run.error}</p>}
      {run.status === 'done' && !run.parsed.complete && <p>필수 항목이 모두 작성되지 않았습니다. AI 의견은 부록에 포함할 수 없습니다.</p>}
      {flags.length > 0 && <div role="status"><p>제공 근거와 대조할 내용 {flags.length}개 · AI 부록 제외</p><ul>{flags.map((flag, index) => <li key={index}>{flag.section}: {flag.message} ({flag.excerpt})</li>)}</ul></div>}
      <p>{MEMO_CHECK_LIMIT}</p>
      {eligible && <label><input type="checkbox" checked={includeAppendix} onChange={event => setAppendixRun(event.target.checked ? run.id : null)} /> 현재 AI 의견을 확인했으며 새로 여는 보고서의 PDF 부록에 포함합니다</label>}
    </div>}
    {snapshot ? <div ref={preview} tabIndex={-1} className="report-frozen-preview" aria-label="열기 시점의 보고서">
      <p role="status">{reportTime(snapshot.capturedAt)}에 연 보고서 · {snapshot.includeAiAppendix && snapshot.memoEligible ? '선택 AI 부록 포함' : 'AI 부록 미포함'}</p>
      {snapshot.sourceRevision !== sourceRevision && <p role="status" className="report-changed-notice">열기 이후 입력 또는 근거가 변경되었습니다. 이 보고서는 열기 시점 내용을 유지합니다. 최신 보고서는 다시 열어 주세요.</p>}
      <button className="report-close-button" onClick={() => { setSnapshot(null); setPrintPending(false); if (reportButton.current?.disabled) reportButton.current.closest('details')?.querySelector('summary')?.focus(); else reportButton.current?.focus(); }}>보고서 닫기</button>
      <div className="report-preview-shell"><ChecklistReport {...snapshot} variant="screen" /></div>
    </div> : <p className="report-start-note">보고서를 열면 현재 후보·담은 후보·근거를 한 시점으로 고정합니다. 이후 변경사항은 다시 열 때 반영됩니다.</p>}
    {run && !stale && run.raw.length > 0 && <details className="mt-2" open={showRaw} onToggle={event => setShowRaw(event.currentTarget.open)}>
      <summary className="cursor-pointer text-[11px] text-gray-500">AI 초안 원문 보기 · 직접 검토 필요</summary>
      <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px]">{run.parsed.visible}</pre>
      <button className="mt-1 text-[11px] text-gray-500 underline" onClick={() => void navigator.clipboard.writeText(run.parsed.visible)}>복사</button>
    </details>}
    {snapshot && <PrintPortal><ChecklistReport {...snapshot} variant="print" /></PrintPortal>}
  </section>;
}
