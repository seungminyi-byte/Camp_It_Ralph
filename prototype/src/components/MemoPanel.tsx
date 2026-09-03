import { useRef, useState } from 'react';
import type { AppData, ScoreInput, ScoreResult } from '../types';
import type { SiteSelection } from '../App';
import { buildMemoPrompt } from '../genai/prompts';
import {
  DEFAULT_MODELS,
  PROVIDER_LABEL,
  generateMemo,
  loadSettings,
  saveSettings,
  type LlmMode,
  type LlmSettings,
  type Provider,
} from '../genai/llmClient';

const MODE_LABEL: Record<LlmMode, string> = {
  proxy: '서버 프록시',
  direct: '브라우저 직접 호출',
  fallback: '사전 생성 메모',
};

const KEY_HINT: Record<Provider, string> = {
  gemini: '무료 키: aistudio.google.com/apikey',
  openrouter: '무료 키: openrouter.ai/keys · 모델은 :free 접미사',
  anthropic: '키: console.anthropic.com',
};

interface Props {
  data: AppData;
  input: ScoreInput;
  result: ScoreResult;
  site: SiteSelection | null;
}

export function MemoPanel({ data, input, result, site }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<LlmMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<LlmSettings>(loadSettings());
  const runId = useRef(0);

  const scenarioId =
    data.scenarios.find((sc) => sc.name === site?.label)?.id ?? null;

  const run = async () => {
    const id = ++runId.current;
    setBusy(true);
    setText('');
    setError(null);
    const prompt = buildMemoPrompt(data, input, result, site);
    try {
      await generateMemo(
        prompt,
        scenarioId,
        (t) => {
          if (runId.current === id) setText((prev) => prev + t);
        },
        (m) => {
          if (runId.current === id) setMode(m);
        },
      );
    } catch (e) {
      if (runId.current === id) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (runId.current === id) setBusy(false);
    }
  };

  const onProvider = (p: Provider) =>
    setDraft((d) => ({ ...d, provider: p, model: DEFAULT_MODELS[p] }));

  return (
    <section className="border-b border-gray-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700">실사 메모 (GenAI)</h2>
        <div className="flex items-center gap-2">
          {mode && (
            <span className="text-[10px] text-gray-400">
              {MODE_LABEL[mode]}
              {mode === 'direct' && ` · ${draft.provider}`}
            </span>
          )}
          <button
            className="text-[11px] text-gray-400 underline"
            onClick={() => setShowSettings((v) => !v)}
          >
            LLM 설정
          </button>
        </div>
      </div>
      {showSettings && (
        <div className="mb-2 flex flex-col gap-1 rounded border border-gray-200 bg-gray-50 p-2 text-xs">
          <select
            value={draft.provider}
            onChange={(e) => onProvider(e.target.value as Provider)}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={draft.model}
            onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
            placeholder="모델 ID"
            className="rounded border border-gray-300 px-2 py-1"
          />
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
            placeholder="API 키 (이 브라우저의 localStorage에만 저장)"
            className="rounded border border-gray-300 px-2 py-1"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">{KEY_HINT[draft.provider]}</span>
            <button
              className="rounded border border-gray-300 bg-white px-2 py-1 hover:bg-gray-100"
              onClick={() => {
                saveSettings({ ...draft, apiKey: draft.apiKey.trim() });
                setShowSettings(false);
              }}
            >
              저장
            </button>
          </div>
        </div>
      )}
      <button
        onClick={run}
        disabled={busy}
        className="w-full rounded bg-blue-600 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? '생성 중…' : '이 부지의 실사 메모 생성'}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {text && (
        <div className="mt-2">
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs leading-relaxed">
            {text}
          </pre>
          <button
            className="mt-1 text-[11px] text-gray-500 underline"
            onClick={() => navigator.clipboard.writeText(text)}
          >
            복사
          </button>
        </div>
      )}
    </section>
  );
}
