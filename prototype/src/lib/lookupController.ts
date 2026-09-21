import type { OnlineEvidence } from '../types';
import { isEvidenceFresh, LOOKUP_TTL_MS } from './lookupContract';
export interface LookupState<T> {
  status: 'idle' | 'loading' | 'done' | 'partial' | 'error';
  queryKey: string | null;
  selectionRevision: number;
  requestRevision: number;
  lookup: T | null;
  message?: string;
}
export interface LookupRequest<T> {
  queryKey: string;
  selectionRevision: number;
  peek: () => T | undefined;
  fetch: (signal: AbortSignal, force: boolean) => Promise<T>;
  hasObservations: (value: T) => boolean;
}
export const idleLookup = <T>(): LookupState<T> => ({ status: 'idle', queryKey: null, selectionRevision: -1, requestRevision: 0, lookup: null });
/** Each controller owns one consumer. Transport cancellation and revision checks are independent. */
export class LookupController<T extends OnlineEvidence> {
  private state = idleLookup<T>();
  private listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private request: LookupRequest<T> | null = null;
  private revision = 0;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(state: LookupState<T>) { this.state = state; this.listeners.forEach((listener) => listener()); }
  cancel = () => {
    this.revision++;
    this.controller?.abort();
    this.controller = null;
    clearTimeout(this.expiry);
  };
  retry = () => { if (this.request) this.start(this.request, true); };
  start(request: LookupRequest<T>, force = false) {
    this.cancel();
    this.request = request;
    const revision = this.revision;
    const controller = new AbortController();
    this.controller = controller;
    const old = this.state.queryKey === request.queryKey ? this.state.lookup : null;
    const remembered = old && request.hasObservations(old) ? old : request.peek();
    const cached = !force ? request.peek() : undefined;
    const base = { queryKey: request.queryKey, selectionRevision: request.selectionRevision, requestRevision: revision };
    const stale = remembered && request.hasObservations(remembered) ? { ...remembered, complete: false, stale: true } : null;
    const current = () => !controller.signal.aborted && this.revision === revision && this.request === request;
    const done = (lookup: T) => {
      if (!current()) return;
      const fresh = isEvidenceFresh(lookup);
      this.publish({ ...base, status: fresh ? 'done' : 'partial', lookup });
      if (fresh) {
        const remaining = lookup.fetchedAt ? Date.parse(lookup.fetchedAt) + LOOKUP_TTL_MS - Date.now() : LOOKUP_TTL_MS;
        this.expiry = setTimeout(() => { if (current()) this.start(request, true); }, Math.max(1, remaining));
      }
    };
    if (cached && isEvidenceFresh(cached)) { done(cached); return; }
    this.publish({ ...base, status: 'loading', lookup: stale });
    void request.fetch(controller.signal, force).then(done, () => {
      if (current()) this.publish({ ...base, status: 'error', lookup: stale, message: '조회하지 못했습니다. 미해당을 뜻하지 않습니다. 다시 시도하세요.' });
    });
  }
}
