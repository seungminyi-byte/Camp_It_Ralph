import { useEffect, useState } from 'react';
import type { OnlineEvidence } from '../types';
import { LOOKUP_TTL_MS } from '../lib/lookupContract';

/** Expire displayed calculations without inventing new background network requests. */
export function useEvidenceClock(values: (OnlineEvidence | null | undefined)[]): number {
  const [revision, setRevision] = useState(0);
  const deadlines = JSON.stringify(values.map(value => value?.fetchedAt ? Date.parse(value.fetchedAt) + LOOKUP_TTL_MS : null));
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    const future = (JSON.parse(deadlines) as (number | null)[]).filter((value): value is number => value !== null && Number.isFinite(value) && value > Date.now());
    const timer = future.length ? setTimeout(refresh, Math.min(...future) - Date.now() + 1) : null;
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { if (timer !== null) clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [deadlines, revision]);
  return revision;
}
