import { memoContextKey, sameMemoInput } from '../genai/memoContext';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, LandUseSource, ScoreInput, ScoreResult, SiteSelection } from '../types';
import { buildChecklist, type ChecklistRow } from '../report/checklist';
import { buildMemoPrompt } from '../genai/prompts';
import { parseMemo, type ParsedMemo } from '../genai/memoFormat';
import { generateMemo, type GenerateMeta, type LlmMode } from '../genai/llmClient';
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
  status: 'streaming' | 'done' | 'error';
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
}

/** The panel is keyed on the site in App, so a new point remounts it with a clean slate. */
export function MemoPanel({ data, input, result, site, landUseSource, zoningName }: Props) {
  const [run, setRun] = useState<Run | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  useEffect(() => () => ctrl.current?.abort(), []);

  const rows = useMemo(
    () => buildChecklist(result, data, { input, landUseSource, zoningName }),
    [result, data, input, landUseSource, zoningName],
  );

  const busy = run?.status === 'streaming';
  const stale = run !== null && !sameMemoInput(run.snapshot.input, input);
  const shown = run?.snapshot ?? { input, result, rows, landUseSource, zoningName, site };
  const generatedBy =
    run && run.mode
      ? run.mode === 'proxy'
        ? `AI 생성${run.meta.model ? ` · ${run.meta.model}` : ''}`
        : `사전 생성 의견 (오프라인${run.meta.distanceKm !== undefined ? ` · 등록 지점에서 ${Math.round(run.meta.distanceKm * 1000)}m` : ''})`
      : null;

  const start = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const snapshot: Snapshot = { input, result, rows, landUseSource, zoningName, site };
    const prompt = buildMemoPrompt(data, input, result, rows, { site, landUseSource, zoningName });

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
        fallbackAt: { lat: input.lat, lng: input.lng, contextKey: await memoContextKey(input, result, rows) },
        onText: (t) =>
          setRun((prev) => {
            if (!prev || c.signal.aborted) return prev;
            const raw = prev.raw + t;
            return { ...prev, raw, parsed: parseMemo(raw) };
          }),
        onMode: (mode, meta) =>
          setRun((prev) =>
            prev && !c.signal.aborted ? { ...prev, mode, meta: { ...prev.meta, ...meta } } : prev,
          ),
      });
      if (!c.signal.aborted) setRun((prev) => (prev ? { ...prev, status: 'done' } : prev));
    } catch (e) {
      if (c.signal.aborted) return;
      const message = e instanceof Error ? e.message : String(e);
      setRun((prev) => (prev ? { ...prev, status: 'error', error: message } : prev));
    }
  };

  const stop = () => {
    ctrl.current?.abort();
    setRun((prev) => (prev ? { ...prev, status: 'done' } : prev));
  };

  const areaLabel = result.emd ? `${result.emd.sigungu}${result.emd.emd}` : null;

  return (
    <section className="border-b border-gray-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">실사 체크리스트</h2>
        {generatedBy && <span className="text-[10px] text-gray-400">{generatedBy}</span>}
      </div>

      <div className="flex gap-1">
        <button
          onClick={busy ? stop : () => void start()}
          className="flex-1 rounded bg-blue-600 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {busy ? '중지' : run ? 'AI 검토 의견 다시 생성' : 'AI 검토 의견 생성'}
        </button>
        <button
          onClick={() => printWithTitle(reportFileTitle(areaLabel, new Date()))}
          className="rounded border border-gray-300 px-2 py-1.5 text-sm hover:bg-gray-100"
        >
          PDF로 저장
        </button>
      </div>

      {stale && (
        <p className="mt-2 rounded bg-amber-50 p-1.5 text-xs text-amber-900">
          입력이 변경되었습니다. 아래 보고서는 생성 시점 기준이니 다시 생성하세요.
        </p>
      )}
      {run?.status === 'error' && <p className="mt-2 text-xs text-red-600">{run.error}</p>}

      <div className="mt-3 max-h-[32rem] overflow-y-auto rounded border border-gray-200 p-2">
        <ChecklistReport
          data={data}
          input={shown.input}
          result={shown.result}
          rows={shown.rows}
          site={shown.site}
          landUseSource={shown.landUseSource}
          zoningName={shown.zoningName}
          memo={run?.parsed ?? null}
          generatedBy={generatedBy}
          generatedAt={run?.at ?? null}
          variant="screen"
        />
      </div>

      {run && run.raw.length > 0 && (
        <details className="mt-2" open={showRaw} onToggle={(e) => setShowRaw(e.currentTarget.open)}>
          <summary className="cursor-pointer text-[11px] text-gray-500">원문 보기</summary>
          <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px]">
            {run.parsed.visible}
          </pre>
          <button
            className="mt-1 text-[11px] text-gray-500 underline"
            onClick={() => void navigator.clipboard.writeText(run.parsed.visible)}
          >
            복사
          </button>
        </details>
      )}

      <PrintPortal>
        <ChecklistReport
          data={data}
          input={shown.input}
          result={shown.result}
          rows={shown.rows}
          site={shown.site}
          landUseSource={shown.landUseSource}
          zoningName={shown.zoningName}
          memo={run?.parsed ?? null}
          generatedBy={generatedBy}
          generatedAt={run?.at ?? null}
          variant="print"
        />
      </PrintPortal>
    </section>
  );
}
