import { haversineKm } from '../scoring/geo';
import type { LandUse } from '../types';

export type LlmMode = 'proxy' | 'fallback';

/** A precomputed memo only stands in for the point it was generated for. */
export const FALLBACK_RADIUS_KM = 0.3;

export interface PrecomputedFile {
  version: 4;
  model: string;
  generatedAt: string;
  memos: Record<
    string,
    {
      lat: number;
      lng: number;
      landUse: LandUse;
      contextKey: string;
      text: string;
    }
  >;
}

export interface GenerateMeta {
  model?: string;
  precomputedId?: string;
  distanceKm?: number;
}

export interface GenerateOptions {
  signal: AbortSignal;
  onText: (t: string) => void;
  onMode: (mode: LlmMode, meta?: GenerateMeta) => void;
  /** Where to look for an offline memo when the proxy is unreachable. */
  fallbackAt: { lat: number; lng: number; contextKey: string } | null;
}

async function streamViaProxy(
  prompt: string,
  onText: (t: string) => void,
  signal: AbortSignal,
): Promise<{ model?: string }> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`proxy ${res.status}`);
  const model = res.headers.get('X-LLM-Model') ?? undefined;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(dec.decode(value, { stream: true }));
  }
  return { model };
}

async function loadPrecomputed(
  at: { lat: number; lng: number; contextKey: string },
  signal: AbortSignal,
): Promise<{ id: string; text: string; distanceKm: number } | null> {
  try {
    const res = await fetch('data/precomputed_memos.json', { signal });
    if (!res.ok) return null;
    const file = (await res.json()) as PrecomputedFile;
    if (file.version !== 4) return null;
    let best: { id: string; text: string; distanceKm: number } | null = null;
    for (const [id, memo] of Object.entries(file.memos ?? {})) {
      if (memo.contextKey !== at.contextKey) continue;
      const distanceKm = haversineKm(at.lat, at.lng, memo.lat, memo.lng);
      if (
        distanceKm <= FALLBACK_RADIUS_KM &&
        (!best || distanceKm < best.distanceKm)
      ) {
        best = { id, text: memo.text, distanceKm };
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Server proxy first (Vercel Edge -> OpenRouter), then the precomputed memo bundled for the demo
 * points. There is no browser-key path: the key lives only in the server environment.
 */
export async function generateMemo(
  prompt: string,
  opts: GenerateOptions,
): Promise<void> {
  const { signal, onText, onMode, fallbackAt } = opts;
  let proxyError = '';
  try {
    onMode('proxy');
    const { model } = await streamViaProxy(prompt, onText, signal);
    onMode('proxy', { model });
    return;
  } catch (e) {
    if (signal.aborted) throw e;
    proxyError = e instanceof Error ? e.message : String(e);
  }

  if (fallbackAt) {
    const pre = await loadPrecomputed(fallbackAt, signal);
    if (pre) {
      onMode('fallback', { precomputedId: pre.id, distanceKm: pre.distanceKm });
      for (const chunk of pre.text.match(/[\s\S]{1,40}/g) ?? []) {
        if (signal.aborted) return;
        onText(chunk);
        await new Promise((r) => setTimeout(r, 25));
      }
      return;
    }
  }

  throw new Error(
    `검토 의견 생성 실패 (${proxyError}). 서버 환경변수 OPENROUTER_API_KEY를 확인하세요. ` +
      `사전 생성 메모는 등록된 지점 반경 ${FALLBACK_RADIUS_KM * 1000}m 이내이며 평가조건이 같은 경우에만 제공됩니다.`,
  );
}
