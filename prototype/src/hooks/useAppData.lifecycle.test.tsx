// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { useAppData } from './useAppData';
import { BundleLoader } from '../lib/bundleLoader';
let root: Root, box: HTMLDivElement;
function View({ loader }: { loader: BundleLoader }) { const state = useAppData(loader); return <><output>{state.error ? `error:${state.error}` : state.data ? 'ready' : 'loading'}|{state.warnings.join(',')}|{state.data?.constants.scoring.review.rates.join(',')}</output><button onClick={state.retry}>retry</button></>; }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); box = document.createElement('div'); document.body.append(box); root = createRoot(box); });
afterEach(async () => { await act(async () => root.unmount()); box.remove(); vi.unstubAllGlobals(); });
it('StrictMode shares 15 loads, malformed optional is unknown, retry reloads only failed files', async () => {
  let broken = true; const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { const name = url.split('/').pop()!; requests.push(name); return Response.json(name === 'news_signal.json' && broken ? {} : JSON.parse(name.endsWith('.json') ? readFileSync(resolve(import.meta.dirname, '../../public/data', name), 'utf8') : 'null')); }));
  // CSV remains textual; the independent shape parser verifies its header.
  const originalFetch = fetch;
  vi.stubGlobal('fetch', vi.fn(async (url: string, options) => url.endsWith('.csv') ? (requests.push(url.split('/').pop()!), new Response(readFileSync(resolve(import.meta.dirname, '../../public', url.slice(1))))) : originalFetch(url, options)));
  const loader = new BundleLoader(); await act(async () => root.render(<StrictMode><View loader={loader} /></StrictMode>));
  expect(box.textContent).toContain('ready|news_signal.json|0.045,0.055,0.065'); expect(requests).toHaveLength(15);
  broken = false; await act(async () => box.querySelector('button')!.click()); expect(box.textContent).toContain('ready||0.045,0.055,0.065'); expect(requests).toHaveLength(16);
});
it('malformed required constants reaches retry UI, is not cached, and succeeds after correction', async () => {
  let broken = true; let constantCalls = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { const name = url.split('/').pop()!; if (name === 'constants.json') { constantCalls++; if (broken) return Response.json({}); } return new Response(readFileSync(resolve(import.meta.dirname, '../../public', url.slice(1)))); }));
  const loader = new BundleLoader(); await act(async () => root.render(<View loader={loader} />)); expect(box.textContent).toContain('error:constants.json:');
  broken = false; await act(async () => box.querySelector('button')!.click()); expect(box.textContent).toContain('ready||0.045,0.055,0.065'); expect(constantCalls).toBe(2);
});
it('unmount releases all active leases and late bodies do not update an abandoned consumer', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_url, options) => { signals.push(options.signal); return new Promise(() => {}); }));
  await act(async () => root.render(<View loader={new BundleLoader()} />)); expect(signals).toHaveLength(15);
  await act(async () => root.render(<p>intro</p>)); expect(signals.every(s => s.aborted)).toBe(true); expect(box.textContent).toBe('intro');
});
