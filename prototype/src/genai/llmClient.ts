import { haversineKm } from '../scoring/geo';
import type { LandUse } from '../types';
import { promptSizeIssue } from './prompts';

export type LlmMode = 'proxy' | 'fallback';
export const FALLBACK_RADIUS_KM = 0.3;
export const MEMO_DEADLINE_MS = 195_000;
export const MEMO_MAX_BYTES = 128 * 1024;
const PRECOMPUTED_MAX_BYTES = 2 * 1024 * 1024;
export interface PrecomputedFile {
  version: 4;
  model: string;
  generatedAt: string;
  memos: Record<string, { lat: number; lng: number; landUse: LandUse; contextKey: string; text: string }>;
}
export interface GenerateMeta { model?: string; precomputedId?: string; distanceKm?: number }
export interface GenerateOptions {
  signal: AbortSignal;
  onText: (text: string) => void;
  /** Replace failed proxy content atomically before publishing the fallback. */
  onReplace: (text: string) => void;
  onMode: (mode: LlmMode, meta?: GenerateMeta) => void;
  fallbackAt: { lat: number; lng: number; contextKey: string } | null;
}
export class MemoTransportError extends Error {
  readonly code: 'timeout' | 'empty' | 'too-large' | 'upstream' | 'invalid' | 'input' | 'auth' | 'rate-limit' | 'provider-timeout' | 'server-timeout';
  constructor(code: MemoTransportError['code']) {
    const messages = { timeout: 'AI 응답 제한시간 195초를 초과했습니다.', empty: 'AI 응답 본문 없음',
      'too-large': 'AI 응답 크기가 허용 범위를 초과했습니다.', upstream: 'AI 서비스가 응답을 완료하지 못했습니다.',
      auth: 'AI 서비스 인증이 거절되었습니다. 서비스 관리자의 연결 설정 확인이 필요합니다.',
      'rate-limit': 'AI 제공자가 요청 제한을 반환했습니다. 잠시 후 다시 시도할 수 있습니다.',
      'provider-timeout': 'AI 제공자가 응답 시간초과를 반환했습니다.',
      'server-timeout': 'AI 응답 대기 제한시간을 초과했습니다.',
      invalid: 'AI 응답 형식을 확인할 수 없습니다.', input: 'AI 요청 자료가 허용 크기를 초과했습니다. 입력은 보존되며 기본 보고서를 사용할 수 있습니다.' };
    super(messages[code]);
    this.code = code;
  }
}
const safeFailure = (code: string): MemoTransportError => {
  const kinds: Record<string, MemoTransportError['code']> = {
    UPSTREAM_AUTH_FAILED: 'auth', UPSTREAM_RATE_LIMITED: 'rate-limit',
    UPSTREAM_PROVIDER_TIMEOUT: 'provider-timeout', UPSTREAM_TIMEOUT: 'server-timeout',
  };
  return new MemoTransportError(Object.hasOwn(kinds, code) ? kinds[code] : 'upstream');
};
function streamFailure(text: string, ended = false): MemoTransportError | null {
  const marker = /^[ \t]*#{1,3}[ \t]*ERROR[ \t]*(?:\r?\n|$)/im.exec(text);
  if (!marker) return null;
  const remainder = text.slice(marker.index + marker[0].length);
  const end = remainder.indexOf('\n');
  // Do not classify a partial code or wait for an unbounded error line.
  if (end < 0 && !ended && remainder.length <= 128) return null;
  return safeFailure((end < 0 ? remainder : remainder.slice(0, end)).replace(/\r$/, ''));
}
const abortError = () => new DOMException('의견 생성을 중단했습니다.', 'AbortError');
const cancelBody = (body: ReadableStream<Uint8Array> | null) => { void body?.cancel().catch(() => {}); };

/** One deadline covers headers, every body read, and the optional exact-context fallback. */
class MemoOperation {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private timer: ReturnType<typeof setTimeout>;
  private parentAbort = () => this.controller.abort(abortError());
  private parent: AbortSignal;
  constructor(parent: AbortSignal) {
    this.parent = parent;
    this.timer = setTimeout(() => this.controller.abort(new MemoTransportError('timeout')), MEMO_DEADLINE_MS);
    parent.addEventListener('abort', this.parentAbort, { once: true });
    if (parent.aborted) this.parentAbort();
  }
  check() { if (this.signal.aborted) throw this.signal.reason; }
  async wait<T>(pending: Promise<T>): Promise<T> {
    this.check();
    let abort: () => void = () => {};
    const stopped = new Promise<never>((_, reject) => {
      abort = () => reject(this.signal.reason);
      this.signal.addEventListener('abort', abort, { once: true });
    });
    try { const value = await Promise.race([pending, stopped]); this.check(); return value; }
    finally { this.signal.removeEventListener('abort', abort); }
  }
  async fetch(url: string, init?: RequestInit) {
    this.check();
    const pending = fetch(url, { ...init, signal: this.signal });
    let observed: Response | undefined;
    void pending.then((response) => { observed = response; if (this.signal.aborted) cancelBody(response.body); }, () => {});
    try { return await this.wait(pending); }
    catch (error) { if (observed) cancelBody(observed.body); throw error; }
  }
  dispose() { clearTimeout(this.timer); this.parent.removeEventListener('abort', this.parentAbort); this.controller.abort(abortError()); }
}

async function readText(res: Response, operation: MemoOperation, maxBytes: number, onText?: (text: string) => void): Promise<string> {
  if (!res.body) throw new MemoTransportError('empty');
  const length = res.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) { cancelBody(res.body); throw new MemoTransportError('too-large'); }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      const { done, value } = await operation.wait(reader.read());
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new MemoTransportError('too-large');
      const chunk = decoder.decode(value, { stream: true });
      text += chunk;
      operation.check();
      onText?.(chunk);
      const failure = onText ? streamFailure(text) : null;
      if (failure) throw failure;
    }
    const tail = decoder.decode();
    text += tail;
    if (tail) onText?.(tail);
    const failure = onText ? streamFailure(text, true) : null;
    if (failure) throw failure;
    if (!text.trim()) throw new MemoTransportError('empty');
    return text;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
async function loadPrecomputed(at: NonNullable<GenerateOptions['fallbackAt']>, operation: MemoOperation) {
  const res = await operation.fetch('/data/precomputed_memos.json');
  if (!res.ok) { cancelBody(res.body); return null; }
  let file: unknown;
  try { file = JSON.parse(await readText(res, operation, PRECOMPUTED_MAX_BYTES)); }
  catch { operation.check(); return null; }
  if (!record(file) || file.version !== 4 || !record(file.memos)) return null;
  let best: { id: string; text: string; distanceKm: number } | null = null;
  for (const [id, memo] of Object.entries(file.memos)) {
    if (!record(memo) || memo.contextKey !== at.contextKey || typeof memo.lat !== 'number' || !Number.isFinite(memo.lat) ||
      typeof memo.lng !== 'number' || !Number.isFinite(memo.lng) || Math.abs(memo.lat) > 90 || Math.abs(memo.lng) > 180 ||
      typeof memo.text !== 'string' || !memo.text.trim() || new TextEncoder().encode(memo.text).length > MEMO_MAX_BYTES ||
      /^[ \t]*#{1,3}[ \t]*ERROR[ \t]*(?:\r?\n|$)/im.test(memo.text)) continue;
    const distanceKm = haversineKm(at.lat, at.lng, memo.lat, memo.lng);
    if (distanceKm <= FALLBACK_RADIUS_KM && (!best || distanceKm < best.distanceKm)) best = { id, text: memo.text, distanceKm };
  }
  return best;
}
export async function generateMemo(prompt: string, opts: GenerateOptions): Promise<void> {
  if (promptSizeIssue(prompt)) throw new MemoTransportError('input');
  const operation = new MemoOperation(opts.signal);
  let failure: unknown;
  try {
    operation.check();
    opts.onMode('proxy');
    try {
      const res = await operation.fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
      if (!res.ok) {
        if (res.headers.get('content-type')?.split(';')[0].trim() !== 'text/plain') {
          cancelBody(res.body); throw new MemoTransportError('upstream');
        }
        let code = '';
        try { code = await readText(res, operation, 512); } catch { operation.check(); }
        throw safeFailure(code.trim());
      }
      if (res.headers.get('content-type')?.split(';')[0].trim() !== 'text/plain') { cancelBody(res.body); throw new MemoTransportError('invalid'); }
      await readText(res, operation, MEMO_MAX_BYTES, opts.onText);
      operation.check();
      opts.onMode('proxy', { model: res.headers.get('X-LLM-Model') ?? undefined });
      return;
    } catch (error) { operation.check(); failure = error; }
    if (opts.fallbackAt) {
      try {
        const pre = await loadPrecomputed(opts.fallbackAt, operation);
        operation.check();
        if (pre) {
          opts.onReplace(pre.text);
          opts.onMode('fallback', { precomputedId: pre.id, distanceKm: pre.distanceKm });
          return;
        }
      } catch { operation.check(); }
    }
    const detail = failure instanceof MemoTransportError ? failure.message : 'AI 연결이 종료되었습니다.';
    throw new Error(`검토 의견 생성 실패: ${detail} 기본 보고서는 계속 사용할 수 있습니다.`);
  } finally { operation.dispose(); }
}
