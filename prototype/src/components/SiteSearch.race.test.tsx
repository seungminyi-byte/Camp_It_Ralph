// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteSearch } from './SiteSearch';
import type { SiteSelection } from '../types';
const geocode = vi.hoisted(() => vi.fn());
vi.mock('../lib/geocode', () => ({ GEOCODE_NOT_FOUND: 'NOT_FOUND', geocodeAddress: geocode }));
let container: HTMLDivElement, root: Root;
const picked = vi.fn();
const defer = () => { let resolve!: (value: { lat: number; lng: number; label: string }) => void, reject!: (error: Error) => void;
  const promise = new Promise<{ lat: number; lng: number; label: string }>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const render = async (selection: SiteSelection | null = null, revision = 0) => {
  await act(async () => root.render(<SiteSearch centroids={[]} selection={selection} selectionRevision={revision} onPick={picked} />));
};
const type = async (value: string) => {
  await act(async () => {
    const input = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const submit = async () => { await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  picked.mockReset(); geocode.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe('search intent epochs in a mounted DOM', () => {
  it('input editing cancels A and permits B; late A cannot pick or switch off B busy', async () => {
    const a = defer(), b = defer(); geocode.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await render(); await type('first address'); await submit();
    const signal = geocode.mock.calls[0][1] as AbortSignal;
    await type('second address'); expect(signal.aborted).toBe(true); await submit();
    expect(container.querySelector('button')?.disabled).toBe(false);
    await act(async () => a.resolve({ lat: 36, lng: 127, label: 'late A' }));
    expect(picked).not.toHaveBeenCalled(); expect(container.textContent).toContain('주소 조회 중');
    await act(async () => b.resolve({ lat: 37, lng: 127, label: 'B' }));
    expect(picked).toHaveBeenCalledExactlyOnceWith({ lat: 37, lng: 127, label: 'B', source: 'geocode' }, 16);
    expect(container.textContent).not.toContain('주소 조회 중');
  });
  it('parent map/pin selection invalidates the pending search even if coordinates are reused', async () => {
    const pending = defer(); geocode.mockReturnValue(pending.promise);
    const selection = { lat: 37, lng: 127, source: 'map' as const };
    await render(selection, 1); await type('address'); await submit(); await render(selection, 2);
    await act(async () => pending.resolve({ lat: 36, lng: 126, label: 'old' }));
    expect(picked).not.toHaveBeenCalled(); expect(geocode.mock.calls[0][1].aborted).toBe(true);
  });
  it('coordinate selection supersedes a pending geocode and late failure does not paint an error', async () => {
    const pending = defer(); geocode.mockReturnValue(pending.promise);
    await render(); await type('address'); await submit(); await type('37.5, 127.1'); await submit();
    expect(picked.mock.calls[0][0]).toMatchObject({ lat: 37.5, lng: 127.1, source: 'coords' });
    await act(async () => pending.reject(new Error('late error')));
    expect(picked).toHaveBeenCalledTimes(1); expect(container.textContent).not.toContain('온라인 주소 검색을 사용할 수 없습니다');
  });
  it('an 읍면동 list selection cancels geocoding and owns the final picked site', async () => {
    const pending = defer(); geocode.mockReturnValue(pending.promise);
    const centroids = [{ sido: '세종특별자치시', sigungu: '세종특별자치시', emd: '한솔동', lat: 36.48, lng: 127.26, n: 1 }];
    await act(async () => root.render(<SiteSearch centroids={centroids} selection={null} onPick={picked} />));
    await type('unmatched address'); await submit(); await type('한솔동');
    const option = container.querySelector('[role="option"] button') as HTMLButtonElement;
    expect(option).not.toBeNull(); await act(async () => option.click());
    await act(async () => pending.resolve({ lat: 37, lng: 128, label: 'old' }));
    expect(picked).toHaveBeenCalledTimes(1); expect(picked.mock.calls[0][0]).toMatchObject({ lat: 36.48, lng: 127.26, source: 'emd' });
  });
  it('unmount cancels the request and never applies ignored late completion', async () => {
    const pending = defer(); geocode.mockReturnValue(pending.promise);
    await render(); await type('address'); await submit();
    await act(async () => root.render(null));
    expect(geocode.mock.calls[0][1].aborted).toBe(true);
    await act(async () => pending.resolve({ lat: 36, lng: 127, label: 'old' })); expect(picked).not.toHaveBeenCalled();
  });
  it('same-query submit increments epoch and old finally cannot clear the replacement spinner', async () => {
    const a = defer(), b = defer(); geocode.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await render(); await type('same address'); await submit(); await submit();
    await act(async () => a.reject(new Error('old')));
    expect(container.textContent).toContain('주소 조회 중');
    await act(async () => b.resolve({ lat: 37, lng: 127, label: 'new' }));
    expect(picked).toHaveBeenCalledTimes(1);
  });
});
