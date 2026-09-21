export const config = { runtime: 'edge' };
import { ApiError, boundedBytes, cancelBody, cleanString, errorResponse, isRecord, methodNotAllowed, Operation } from './_http.js';
import { generationGate } from './_generation.js';

declare const process: { env: Record<string, string | undefined> };
const DEFAULT_MODEL = 'google/gemma-4-31b-it:free';
const FREE_MODELS = new Set([DEFAULT_MODEL, 'nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-26b-a4b-it:free', 'openrouter/free']);
const OVERALL_MS = 55_000, IDLE_MS = 15_000;
const INPUT_MAX_BYTES = 96 * 1024, OUTPUT_MAX_BYTES = 128 * 1024;
const SSE_MAX_BYTES = 1024 * 1024;

function sseToText(res: Response, operation: Operation, release: () => void): ReadableStream<Uint8Array> {
  const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
  const reader = res.body!.getReader();
  let buffer = '', inputBytes = 0, outputBytes = 0, textEmitted = false, cancelled = false, finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    void reader.cancel().catch(() => {});
    reader.releaseLock();
    operation.dispose(); release();
  };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (text: string) => {
        const bytes = enc.encode(text);
        // Reserve enough space for a terminal safe error marker within the same cap.
        if (outputBytes + bytes.length > OUTPUT_MAX_BYTES - 128) throw new ApiError('OUTPUT_TOO_LARGE');
        outputBytes += bytes.length;
        textEmitted ||= text.trim().length > 0;
        if (!cancelled) controller.enqueue(bytes);
      };
      const frame = (line: string): boolean => {
        if (!line || line.startsWith(':')) return false;
        if (!line.startsWith('data:')) {
          if (/^(event|id|retry):/.test(line)) return false;
          throw new ApiError('UPSTREAM_INVALID');
        }
        const payload = line.slice(5).trim();
        if (!payload) return false;
        if (payload === '[DONE]') {
          if (!textEmitted) throw new ApiError('UPSTREAM_EMPTY');
          return true;
        }
        let data: unknown;
        try { data = JSON.parse(payload); } catch { throw new ApiError('UPSTREAM_INVALID'); }
        if (!isRecord(data)) throw new ApiError('UPSTREAM_INVALID');
        if (data.error !== undefined) throw new ApiError('UPSTREAM_UNAVAILABLE');
        if (!Array.isArray(data.choices) || data.choices.length > 1) throw new ApiError('UPSTREAM_INVALID');
        // OpenRouter may send a usage-only frame with an empty choices array.
        if (data.choices.length === 0) {
          if (!isRecord(data.usage)) throw new ApiError('UPSTREAM_INVALID');
          return false;
        }
        const choice = data.choices[0];
        if (!isRecord(choice) || !isRecord(choice.delta)) throw new ApiError('UPSTREAM_INVALID');
        if (choice.error !== undefined && choice.error !== null || choice.finish_reason === 'error') throw new ApiError('UPSTREAM_UNAVAILABLE');
        const content = choice.delta.content;
        if (content !== undefined && content !== null) {
          if (typeof content !== 'string') throw new ApiError('UPSTREAM_INVALID');
          emit(content);
        }
        if (choice.finish_reason === 'length' || choice.finish_reason === 'content_filter' || choice.finish_reason === 'tool_calls') throw new ApiError('UPSTREAM_INCOMPLETE');
        if (choice.finish_reason !== undefined && choice.finish_reason !== null && choice.finish_reason !== 'stop') throw new ApiError('UPSTREAM_INVALID');
        return false;
      };
      try {
        for (;;) {
          operation.check();
          const { done, value } = await operation.wait(reader.read(), IDLE_MS);
          if (done) {
            buffer += dec.decode();
            if (buffer && frame(buffer.replace(/\r$/, ''))) break;
            throw new ApiError(textEmitted ? 'UPSTREAM_INCOMPLETE' : 'UPSTREAM_EMPTY');
          }
          inputBytes += value.byteLength;
          if (inputBytes > SSE_MAX_BYTES) throw new ApiError('OUTPUT_TOO_LARGE');
          buffer += dec.decode(value, { stream: true });
          let newline: number;
          let completed = false;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, '');
            buffer = buffer.slice(newline + 1);
            if (frame(line)) { completed = true; break; }
          }
          if (completed) break;
          if (buffer.length > OUTPUT_MAX_BYTES) throw new ApiError('OUTPUT_TOO_LARGE');
        }
      } catch (error) {
        const code = error instanceof ApiError ? error.code : 'UPSTREAM_INVALID';
        if (!cancelled) controller.enqueue(enc.encode(`\n## ERROR\n${code}\n`));
        operation.abort(error instanceof ApiError ? error : new ApiError('UPSTREAM_INVALID'));
      } finally {
        if (!cancelled) controller.close();
        cleanup();
      }
    },
    cancel() {
      cancelled = true;
      operation.abort();
      cleanup();
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed('POST');
  const operation = new Operation(req.signal, OVERALL_MS);
  let release: (() => void) | undefined;
  let streaming = false;
  try {
    if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError('UNSUPPORTED_MEDIA_TYPE', 415);
    const bytes = await boundedBytes(req, operation, INPUT_MAX_BYTES, new ApiError('PAYLOAD_TOO_LARGE', 413));
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new ApiError('BAD_REQUEST', 400); }
    if (!isRecord(body) || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 20000) throw new ApiError('BAD_REQUEST', 400);
    const prompt = body.prompt;
    const key = process.env.OPENROUTER_API_KEY;
    const model = process.env.LLM_MODEL || DEFAULT_MODEL;
    if (!key || !cleanString(key, 512) || /\s/.test(key) || !FREE_MODELS.has(model)) throw new ApiError('SERVER_UNAVAILABLE', 503);
    const models = model === DEFAULT_MODEL ? [model, 'nvidia/nemotron-3.5-lightning:free', 'google/gemma-4-26b-a4b-it:free'] : [model];
    const digest = await operation.wait(crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ model, prompt }))));
    operation.check();
    release = generationGate.reserve(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''));
    const pending = fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: operation.signal, redirect: 'manual',
      headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${key}`,
        'HTTP-Referer': new URL(req.url).origin, 'X-Title': 'The Grand Site DC',
      },
      body: JSON.stringify({ models, stream: true, temperature: 0.3, max_tokens: 4000,
        reasoning: { enabled: false }, messages: [{ role: 'user', content: prompt }],
      }),
    });
    void pending.then((res) => { if (operation.signal.aborted) cancelBody(res.body); }, () => {});
    const res = await operation.wait(pending);
    if (!res.ok || !res.body || res.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'text/event-stream') {
      cancelBody(res.body);
      throw new ApiError(res.ok ? 'UPSTREAM_INVALID' : 'UPSTREAM_UNAVAILABLE');
    }
    const response = new Response(sseToText(res, operation, release), { headers: {
      'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-LLM-Model': models.length > 1 ? 'OpenRouter' : model,
    } });
    streaming = true;
    return response;
  } catch (error) { operation.abort(); return errorResponse(error); }
  finally { if (!streaming) { operation.dispose(); release?.(); } }
}
