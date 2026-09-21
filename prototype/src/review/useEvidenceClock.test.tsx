// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useEvidenceClock } from './useEvidenceClock';
import { LOOKUP_TTL_MS } from '../lib/lookupContract';
it('expires at each next deadline, skips past deadlines, resumes on focus, and clears all ownership', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T10:00:00Z'));
  const box = document.createElement('div'), root = createRoot(box); document.body.append(box);
  const fetchedAt = new Date().toISOString(); let count = -1;
  const Probe = () => {
    const current = useEvidenceClock([{ fetchedAt }, { fetchedAt: new Date(Date.parse(fetchedAt) + 1000).toISOString() }, { fetchedAt: 'invalid' }]);
    useEffect(() => { count = current; }, [current]);
    return <span>{current}</span>;
  };
  try {
    await act(async () => root.render(<Probe />)); expect(count).toBe(0); expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(LOOKUP_TTL_MS + 1)); expect(count).toBe(1); expect(vi.getTimerCount()).toBe(1);
    await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(count).toBe(2); expect(vi.getTimerCount()).toBe(0);
    await act(async () => vi.advanceTimersByTimeAsync(LOOKUP_TTL_MS)); expect(count).toBe(2);
    await act(async () => window.dispatchEvent(new Event('focus'))); expect(count).toBe(3); expect(vi.getTimerCount()).toBe(0);
    await act(async () => root.unmount()); expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('focus')); expect(count).toBe(3);
  } finally { box.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
