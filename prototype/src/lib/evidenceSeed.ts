import type { OnlineEvidence } from '../types';
import { LOOKUP_VERSION } from './lookupContract';
export interface EvidenceSeed<T> { queryKey: string | null; lookup: T | null; selectionRevision?: number; requestRevision?: number; status?: 'idle' | 'loading' | 'done' | 'partial' | 'error' }
/** Seeds originate only from validated in-memory lookups, never restored session input. */
export function matchingSeed<T extends OnlineEvidence>(seed: EvidenceSeed<T> | undefined, queryKey: string): T | undefined {
  if (!seed?.lookup || seed.queryKey !== queryKey || seed.lookup.version !== LOOKUP_VERSION || !seed.lookup.coordinate || !seed.lookup.fetchedAt || !Number.isFinite(Date.parse(seed.lookup.fetchedAt))) return undefined;
  const coordinateKey = `${seed.lookup.coordinate.lat},${seed.lookup.coordinate.lng}`;
  if (queryKey.split('|')[2] !== coordinateKey) return undefined;
  return { ...seed.lookup, complete: false, stale: true };
}
