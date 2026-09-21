import { memoContextKey, memoContextSnapshot } from '../genai/memoContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppData,
  LandUseSource,
  ScoreInput,
  ScoreResult,
  SiteSelection,
} from '../types';
import { buildChecklist, type ChecklistRow } from '../report/checklist';
import { buildMemoPrompt } from '../genai/prompts';
import { parseMemo, type ParsedMemo } from '../genai/memoFormat';
import {
  generateMemo,
  type GenerateMeta,
  type LlmMode,
} from '../genai/llmClient';
import { printWithTitle, reportFileTitle } from '../lib/print';
import { ChecklistReport } from './ChecklistReport';
import { PrintPortal } from './PrintPortal';

interface Snapshot {
  input: ScoreInput;
  result: ScoreResult;
  rows: ChecklistRow[];
  landUseSource: LandUseSource;
  zoningName: string | null;
  site: SiteSelection;
}

interface Run {
  snapshot: Snapshot;
  raw: string;
  parsed: ParsedMemo;
  mode: LlmMode | null;
  meta: GenerateMeta;
  status: 'streaming' | 'done' | 'error' | 'stopped';
  error?: string;
  invalidated?: boolean;
  at: Date;
}

interface Props {
  active: boolean;
  data: AppData;
  input: ScoreInput;
  result: ScoreResult;
  site: SiteSelection;
  landUseSource: LandUseSource;
  zoningName: string | null;
}

/** Keyed by the workspace site; route changes preserve valid completed opinions. */
export function MemoPanel({
  active,
  data,
  input,
  result,
  site,
  landUseSource,
  zoningName,
}: Props) {
  const [run, setRun] = useState<Run | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const rows = useMemo(
    () => buildChecklist(result, data, { input, landUseSource, zoningName }),
    [result, data, input, landUseSource, zoningName],
  );

  const currentContext = memoContextSnapshot(input, result, rows);
  const stale =
    run !== null &&
    (run.invalidated === true ||
      memoContextSnapshot(
        run.snapshot.input,
        run.snapshot.result,
        run.snapshot.rows,
      ) !== currentContext);
  if (stale && run && !run.invalidated) {
    setRun({ ...run, invalidated: true, status: 'done' });
  } else if (!active && run?.status === 'streaming') {
    // Record cancellation in state before a late stream callback can mark it complete.
    setRun({ ...run, status: 'stopped' });
  }
  const busy = active && run?.status === 'streaming' && !stale;
  const completed = !stale && run?.status === 'done' && run.parsed.complete && !run.parsed.error;
  const reportMemo = completed ? run.parsed : null;
  const shown = { input, result, rows, landUseSource, zoningName, site };
  useEffect(() => {
    if (stale || !active) {
      ctrl.current?.abort();
    }
  }, [active, stale, currentContext]);
  const generatedBy =
    completed && run.mode
      ? run.mode === 'proxy'
        ? `AI 생성${run.meta.model ? ` · ${run.meta.model}` : ''}`
        : `사전 생성 의견 (오프라인${run.meta.distanceKm !== undefined ? ` · 등록 지점에서 ${Math.round(run.meta.distanceKm * 1000)}m` : ''})`
      : null;

  const start = async () => {
    if (!active) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const snapshot: Snapshot = {
      input,
      result,
      rows,
      landUseSource,
      zoningName,
      site,
    };
    const prompt = buildMemoPrompt(data, input, result, rows, {
      site,
      landUseSource,
      zoningName,
    });

    setRun({
      snapshot,
      raw: '',
      parsed: parseMemo(''),
      mode: null,
      meta: {},
      status: 'streaming',
      at: new Date(),
    });

    try {
      await generateMemo(prompt, {
        signal: c.signal,
        fallbackAt: {
          lat: input.lat,
          lng: input.lng,
          contextKey: await memoContextKey(input, result, rows),
        },
        onText: (t) =>
          setRun((prev) => {
            if (!prev || c.signal.aborted || prev.invalidated || prev.status !== 'streaming' || ctrl.current !== c) return prev;
            const raw = prev.raw + t;
            return { ...prev, raw, parsed: parseMemo(raw) };
          }),
        onMode: (mode, meta) =>
          setRun((prev) =>
            prev && !c.signal.aborted && !prev.invalidated && prev.status === 'streaming' && ctrl.current === c
              ? { ...prev, mode, meta: { ...prev.meta, ...meta } }
              : prev,
          ),
      });
      if (!c.signal.aborted)
        setRun((prev) => (prev && !prev.invalidated && prev.status === 'streaming' && ctrl.current === c ? { ...prev, status: 'done' } : prev));
    } catch (e) {
      if (c.signal.aborted) return;
      const message = e instanceof Error ? e.message : String(e);
      setRun((prev) =>
        prev && !prev.invalidated && prev.status === 'streaming' && ctrl.current === c ? { ...prev, status: 'error', error: message } : prev,
      );
    }
  };

  const stop = () => {
    ctrl.current?.abort();
    setRun((prev) => (prev ? { ...prev, status: 'stopped' } : prev));
  };

  const areaLabel = result.emd
    ? `${result.emd.sigungu}${result.emd.emd}`
    : null;

  return (
    <section className="memo-panel">
      <header className="report-tools-header">
        <div>
          <span>REPORT PREVIEW</span>
          <h2>부지 검토 보고서</h2>
        </div>
        {generatedBy && (
          <span className="report-generation-badge">{generatedBy}</span>
        )}
      </header>

      <div className="report-actions">
        <button
          onClick={busy ? stop : () => void start()}
          className={`report-ai-button${busy ? ' is-stop' : ''}`}
        >
          <span aria-hidden="true">{busy ? '■' : '✦'}</span>
          {busy
            ? '생성 중지'
            : run
              ? 'AI 검토 의견 다시 생성'
              : 'AI 검토 의견 생성'}
        </button>
        <button
          onClick={() => { if (active) printWithTitle(reportFileTitle(areaLabel, new Date())); }}
          className="report-pdf-button"
        >
          PDF 저장 <span aria-hidden="true">↗</span>
        </button>
      </div>

      {busy && <p className="memo-state" role="status">AI 의견을 생성하고 있습니다. 기본 보고서는 계속 사용할 수 있으며, 완료된 의견만 PDF에 포함합니다.</p>}
      {!stale && run?.status === 'stopped' && <p className="memo-state" role="status">AI 생성을 중단했습니다. 부분 의견은 보고서에 포함하지 않습니다.</p>}
      {!stale && run?.status === 'done' && !run.parsed.complete && !run.parsed.error && <p className="memo-state" role="status">AI 의견이 완성되지 않아 보고서에 포함하지 않았습니다. 기본 보고서는 계속 사용할 수 있습니다.</p>}

      {stale && (
        <p className="mt-2 rounded bg-amber-50 p-1.5 text-xs text-amber-900">
          입력 또는 근거 자료가 변경되어 이전 AI 의견을 해제했습니다. 기본
          보고서는 현재 조건으로 갱신되었습니다.
        </p>
      )}
      {!stale && (run?.status === 'error' || run?.parsed.error) && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {run?.error ??
            `${run?.parsed.error} 기본 보고서는 계속 출력할 수 있습니다.`}
        </p>
      )}

      <div className="report-preview-shell">
        <ChecklistReport
          data={data}
          input={shown.input}
          result={shown.result}
          rows={shown.rows}
          site={shown.site}
          landUseSource={shown.landUseSource}
          zoningName={shown.zoningName}
          memo={reportMemo}
          generatedBy={generatedBy}
          generatedAt={completed ? run.at : null}
          variant="screen"
        />
      </div>

      {run && !stale && run.status !== 'stopped' && run.raw.length > 0 && (
        <details
          className="mt-2"
          open={showRaw}
          onToggle={(e) => setShowRaw(e.currentTarget.open)}
        >
          <summary className="cursor-pointer text-[11px] text-gray-500">
            원문 보기
          </summary>
          <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px]">
            {run.parsed.visible}
          </pre>
          <button
            className="mt-1 text-[11px] text-gray-500 underline"
            onClick={() =>
              void navigator.clipboard.writeText(run.parsed.visible)
            }
          >
            복사
          </button>
        </details>
      )}

      <PrintPortal active={active}>
        <ChecklistReport
          data={data}
          input={shown.input}
          result={shown.result}
          rows={shown.rows}
          site={shown.site}
          landUseSource={shown.landUseSource}
          zoningName={shown.zoningName}
          memo={reportMemo}
          generatedBy={generatedBy}
          generatedAt={completed ? run.at : null}
          variant="print"
        />
      </PrintPortal>
    </section>
  );
}
