import type { OnlineEvidence } from '../types';
import { isEvidenceFresh, LOOKUP_TTL_MS } from './lookupContract';

/** Fresh complete answers and remembered observations have deliberately different lifetimes. */
export class EvidenceCache<T extends OnlineEvidence> {
  private fresh = new Map<string, { value: T; at: number }>();
  private observed = new Map<string, T>();
  private runs = new Map<string, number>();
  private sequence = 0;
  private readonly hasObservations: (value: T) => boolean;
  private readonly merge: (previous: T, next: T) => T;
  constructor(hasObservations: (value: T) => boolean, merge: (previous: T, next: T) => T = (_previous, next) => next) {
    this.hasObservations = hasObservations; this.merge = merge;
  }
  private put<V>(map: Map<string, V>, key: string, value: V) {
    if (map.size >= 500 && !map.has(key)) map.delete(map.keys().next().value!);
    map.set(key, value);
  }
  peek(key: string): T | undefined {
    const cached = this.fresh.get(key);
    if (cached && Date.now() - cached.at < LOOKUP_TTL_MS && isEvidenceFresh(cached.value)) return cached.value;
    this.fresh.delete(key);
    return this.stale(key);
  }
  stale(key: string): T | undefined {
    const value = this.observed.get(key);
    return value ? { ...value, complete: false, stale: true } : undefined;
  }
  /** A caller-validated pin snapshot can retain observations after bounded cache eviction. */
  seed(key: string, value: T) {
    if (!this.peek(key) && this.hasObservations(value)) this.put(this.observed, key, { ...value, complete: false, stale: true });
  }
  async load(key: string, fetcher: () => Promise<T>, signal?: AbortSignal, force = false): Promise<T> {
    const cached = this.peek(key);
    if (!force && cached && isEvidenceFresh(cached)) {
      if (signal?.aborted) throw signal.reason;
      return cached;
    }
    const initialObservations = this.observed.get(key);
    const revision = ++this.sequence;
    this.runs.set(key, revision);
    this.fresh.delete(key);
    try {
      const result = await fetcher();
      if (signal?.aborted) throw new DOMException('Cancelled lookup', 'AbortError');
      const prior = this.observed.get(key) ?? initialObservations;
      const expired = !!result.fetchedAt && Date.now() - Date.parse(result.fetchedAt) >= LOOKUP_TTL_MS;
      const value = !isEvidenceFresh(result) && prior
        ? { ...this.merge(prior, result), stale: true, previousFetchedAt: prior.previousFetchedAt ?? prior.fetchedAt }
        : expired ? { ...result, complete: false, stale: true } : result;
      // Independent consumers receive their result; only cache publication is ordered globally.
      if (this.runs.get(key) !== revision) return value;
      if (isEvidenceFresh(value)) {
        this.put(this.fresh, key, { value, at: Date.now() });
        this.observed.delete(key);
      }
      if (this.hasObservations(value)) this.put(this.observed, key, value);
      return value;
    } finally {
      if (this.runs.get(key) === revision) this.runs.delete(key);
    }
  }
}
