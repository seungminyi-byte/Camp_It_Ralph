import { useEffect, useState } from 'react';
import type { NearbySiteCandidates } from '../types';
import { lookupNearbySites } from '../lib/nearbySites';

export type NearbySitesStatus =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; result: NearbySiteCandidates }
  | { status: 'error'; code: 'not-deployed' | 'unavailable' };

export function useNearbySites(site: { lat: number; lng: number } | null): NearbySitesStatus {
  const lat = site?.lat;
  const lng = site?.lng;
  const key = lat === undefined || lng === undefined ? null : `${lat.toFixed(5)},${lng.toFixed(5)}`;
  const [settled, setSettled] = useState<{ key: string; state: NearbySitesStatus } | null>(null);

  useEffect(() => {
    if (lat === undefined || lng === undefined || key === null) return;
    const controller = new AbortController();
    lookupNearbySites(lat, lng, controller.signal).then(
      (result) => { if (!controller.signal.aborted) setSettled({ key, state: { status: 'done', result } }); },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const code = error instanceof Error && error.message.endsWith('404') ? 'not-deployed' : 'unavailable';
        setSettled({ key, state: { status: 'error', code } });
      },
    );
    return () => controller.abort();
  }, [key, lat, lng]);

  if (key === null) return { status: 'idle' };
  return settled?.key === key ? settled.state : { status: 'loading' };
}
