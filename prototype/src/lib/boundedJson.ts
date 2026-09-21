export const ONLINE_DEADLINE_MS = 15_000;
export const ONLINE_JSON_BYTES = 2 * 1024 * 1024;
export class HttpLookupError extends Error {
  readonly status: number;
  readonly code?: 'NOT_FOUND';
  constructor(status: number, code?: 'NOT_FOUND') { super(`lookup HTTP ${status}`); this.status = status; this.code = code; }
}
function cancel(body: ReadableStream<Uint8Array> | null) {
  if (body && !body.locked) void body.cancel().catch(() => {});
}
/** The budget covers headers, every body byte, and decoding; cancellation never waits on the transport. */
export async function boundedJson(url: string, options: { signal?: AbortSignal; deadlineMs?: number; maxBytes?: number } = {}): Promise<unknown> {
  const controller = new AbortController();
  const signal = controller.signal;
  const parentAbort = () => controller.abort(new DOMException('조회가 취소되었습니다', 'AbortError'));
  const timer = setTimeout(() => controller.abort(new Error('조회 제한시간을 초과했습니다. 다시 시도하세요.')), options.deadlineMs ?? ONLINE_DEADLINE_MS);
  options.signal?.addEventListener('abort', parentAbort, { once: true });
  if (options.signal?.aborted) parentAbort();
  const check = () => { if (signal.aborted) throw signal.reason; };
  const wait = async <T>(pending: Promise<T>): Promise<T> => {
    check();
    let abort = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
    });
    try { return await Promise.race([pending, interrupted]); }
    finally { signal.removeEventListener('abort', abort); }
  };
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    check();
    const pending = fetch(url, { signal, cache: 'no-store', redirect: 'error' });
    void pending.then((response) => { if (signal.aborted) cancel(response.body); }, () => {});
    const response = await wait(pending);
    const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const addressError = response.status === 404 && mediaType === 'text/plain';
    if (!response.ok && !addressError) { cancel(response.body); throw new HttpLookupError(response.status); }
    const maxBytes = response.ok ? options.maxBytes ?? ONLINE_JSON_BYTES : 1024;
    const declared = response.headers.get('content-length');
    if (response.ok && mediaType !== 'application/json' ||
        declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes) || !response.body) {
      cancel(response.body); throw new Error('invalid lookup body');
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await wait(reader.read());
      check();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) throw new Error('lookup response too large');
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    check();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!response.ok) throw new HttpLookupError(response.status, text === 'NOT_FOUND' ? 'NOT_FOUND' : undefined);
    return JSON.parse(text);
  } finally {
    if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    controller.abort();
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', parentAbort);
  }
}
