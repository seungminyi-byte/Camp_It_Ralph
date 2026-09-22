// Small request-boundary helpers. Errors deliberately contain no provider details.
export type ErrorCode = 'BAD_REQUEST' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' |
  'METHOD_NOT_ALLOWED' | 'NOT_FOUND' | 'SERVER_UNAVAILABLE' | 'UPSTREAM_INVALID' |
  'UPSTREAM_UNAVAILABLE' | 'UPSTREAM_AUTH_FAILED' | 'UPSTREAM_RATE_LIMITED' | 'UPSTREAM_PROVIDER_TIMEOUT' | 'UPSTREAM_TIMEOUT' | 'REQUEST_CANCELLED' | 'DUPLICATE_REQUEST' |
  'RATE_LIMITED' | 'UPSTREAM_EMPTY' | 'UPSTREAM_INCOMPLETE' | 'OUTPUT_TOO_LARGE';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  constructor(code: ErrorCode, status = 502) { super(code); this.code = code; this.status = status; }
}

export function errorResponse(error: unknown): Response {
  const safe = error instanceof ApiError ? error : new ApiError('UPSTREAM_UNAVAILABLE');
  return new Response(safe.code, { status: safe.status, headers: {
    'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(safe.status === 429 ? { 'Retry-After': '60' } : {}),
  } });
}

export function methodNotAllowed(allow: 'GET' | 'POST'): Response {
  const res = errorResponse(new ApiError('METHOD_NOT_ALLOWED', 405));
  res.headers.set('Allow', allow);
  return res;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function cleanString(value: unknown, max: number): value is string {
  if (typeof value !== 'string' || value.length > max) return false;
  return !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function queryParams(req: Request, caseInsensitive = false): URLSearchParams {
  const url = new URL(req.url);
  if (url.search.length > 4096) throw new ApiError('BAD_REQUEST', 400);
  const result = new URLSearchParams();
  const keys = new Set<string>();
  url.searchParams.forEach((value, key) => {
    const normalized = caseInsensitive ? key.toLowerCase() : key;
    if (keys.has(normalized) || !cleanString(value, 2000)) throw new ApiError('BAD_REQUEST', 400);
    keys.add(normalized);
    result.set(normalized, value);
  });
  return result;
}

export function serviceCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 33 && lat <= 39.5 && lng >= 124 && lng <= 132;
}

export function coordinateQuery(query: URLSearchParams, precision: 4 | 5) {
  const latText = query.get('lat');
  const lngText = query.get('lng');
  if (!latText?.trim() || !lngText?.trim()) throw new ApiError('BAD_REQUEST', 400);
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!serviceCoordinate(lat, lng)) throw new ApiError('BAD_REQUEST', 400);
  const scale = 10 ** precision;
  return { lat: Math.round(lat * scale) / scale, lng: Math.round(lng * scale) / scale };
}

/** One budget from request entry through the last body byte; shared by sequential/fan-out calls. */
export class Operation {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly parentAbort: () => void;
  private disposed = false;
  private readonly parent: AbortSignal;
  constructor(parent: AbortSignal, milliseconds: number) {
    this.parent = parent;
    this.parentAbort = () => this.abort(new ApiError('REQUEST_CANCELLED'));
    this.timer = setTimeout(() => this.abort(new ApiError('UPSTREAM_TIMEOUT')), milliseconds);
    parent.addEventListener('abort', this.parentAbort, { once: true });
    if (parent.aborted) this.parentAbort();
  }
  abort(reason: ApiError = new ApiError('REQUEST_CANCELLED')) { this.controller.abort(reason); }
  check() { if (this.signal.aborted) throw this.signal.reason; }
  async wait<T>(promise: Promise<T>, idleMs?: number): Promise<T> {
    this.check();
    let idle: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(this.signal.reason);
      this.signal.addEventListener('abort', onAbort, { once: true });
      if (idleMs) idle = setTimeout(() => this.abort(new ApiError('UPSTREAM_TIMEOUT')), idleMs);
    });
    try { return await Promise.race([promise, interrupted]); }
    finally {
      if (idle) clearTimeout(idle);
      this.signal.removeEventListener('abort', onAbort);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    this.parent.removeEventListener('abort', this.parentAbort);
  }
}

export function cancelBody(body: ReadableStream<Uint8Array> | null) {
  // Cancellation must not itself introduce an unbounded wait on a broken upstream.
  if (body && !body.locked) void body.cancel().catch(() => {});
}

export async function boundedBytes(
  source: Request | Response, operation: Operation, maxBytes: number, tooLarge = new ApiError('UPSTREAM_INVALID'),
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = source.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    cancelBody(source.body);
    throw tooLarge;
  }
  if (!source.body) return new Uint8Array(0);
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let finished = false;
  try {
    for (;;) {
      operation.check();
      const { done, value } = await operation.wait(reader.read());
      if (done) { finished = true; break; }
      size += value.byteLength;
      if (size > maxBytes) throw tooLarge;
      chunks.push(value);
    }
    const all = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
    return all;
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
