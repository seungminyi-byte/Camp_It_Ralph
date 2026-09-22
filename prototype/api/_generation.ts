import { ApiError, isRecord, type ErrorCode } from './_http.js';

export const GENERATION_OVERALL_MS = 180_000;
export const GENERATION_STARTUP_MS = 20_000;
export const GENERATION_IDLE_MS = 15_000;

/** Classify only the observed final status or exact documented error type. */
export function upstreamFailure(error: unknown): ErrorCode {
  const code = isRecord(error) ? error.code : error;
  const type = isRecord(error) && isRecord(error.metadata) ? error.metadata.error_type : undefined;
  if (code === 401) return 'UPSTREAM_AUTH_FAILED';
  if (code === 429) return 'UPSTREAM_RATE_LIMITED';
  if (code === 504) return 'UPSTREAM_PROVIDER_TIMEOUT';
  if (type === 'authentication') return 'UPSTREAM_AUTH_FAILED';
  if (type === 'rate_limit_exceeded') return 'UPSTREAM_RATE_LIMITED';
  if (type === 'timeout') return 'UPSTREAM_PROVIDER_TIMEOUT';
  return 'UPSTREAM_UNAVAILABLE';
}

// Instance-local only: cold starts and other instances have independent counters.
export class GenerationGate {
  private readonly active = new Map<string, number>();
  private starts: number[] = [];
  reserve(digest: string, now = Date.now()): () => void {
    for (const [key, expiry] of this.active) if (expiry <= now) this.active.delete(key);
    this.starts = this.starts.filter((time) => time > now - 60_000);
    if (this.active.has(digest)) throw new ApiError('DUPLICATE_REQUEST', 409);
    if (this.active.size >= 2 || this.starts.length >= 12) throw new ApiError('RATE_LIMITED', 429);
    const expiry = now + GENERATION_OVERALL_MS;
    this.active.set(digest, expiry);
    this.starts.push(now);
    return () => { if (this.active.get(digest) === expiry) this.active.delete(digest); };
  }
}
export const generationGate = new GenerationGate();
