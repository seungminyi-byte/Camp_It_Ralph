import { ApiError } from './_http.js';

// Instance-local only: cold starts and other instances have independent counters.
export class GenerationGate {
  private readonly active = new Map<string, number>();
  private starts: number[] = [];
  reserve(digest: string, now = Date.now()): () => void {
    for (const [key, expiry] of this.active) if (expiry <= now) this.active.delete(key);
    this.starts = this.starts.filter((time) => time > now - 60_000);
    if (this.active.has(digest)) throw new ApiError('DUPLICATE_REQUEST', 409);
    if (this.active.size >= 2 || this.starts.length >= 12) throw new ApiError('RATE_LIMITED', 429);
    const expiry = now + 55_000;
    this.active.set(digest, expiry);
    this.starts.push(now);
    return () => { if (this.active.get(digest) === expiry) this.active.delete(digest); };
  }
}
export const generationGate = new GenerationGate();
