// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppData } from '../test/loadData';
import { lat, lng, zoningFixture, restrictionFixture, disasterFixture, prohibitedHit } from '../test/onlineFixtures';
vi.mock('../hooks/useAppData', () => ({ useAppData: () => ({ data: loadAppData(), error: null }) }));
vi.mock('./MapView', () => ({ MapView: ({ onSelect }: { onSelect: (lat: number, lng: number) => void }) => <button onClick={() => onSelect(lat, lng)}>test select candidate</button> }));
vi.mock('./MemoPanel', () => ({ MemoPanel: () => <div>basic report entry</div> }));
import App from '../App';
let container: HTMLDivElement, root: Root;
function button(label: string) { return [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!; }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe('current candidate and pin evidence integration', () => {
  it('keeps a confirmed restriction in current and pinned results through manual retry failure', async () => {
    let restrictionCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/zoning?')) return Response.json(zoningFixture());
      if (url.includes('/disaster?')) return Response.json(disasterFixture());
      if (url.includes('/restrictions?')) {
        if (++restrictionCalls > 1) throw new Error('offline');
        return Response.json({ ...restrictionFixture(), hits: [prohibitedHit] });
      }
      throw new Error(`Unexpected test URL ${url}`);
    }));
    await act(async () => root.render(<App />));
    await act(async () => button('test select candidate').click());
    expect(container.textContent).toContain('개발제한구역');
    await act(async () => button('현재지점 담기+').click());
    await act(async () => button('규제구역 다시 조회').click());
    expect(container.textContent).toContain('조회 실패 · 미확인');
    expect(container.textContent).toContain('이전 조회의 관찰을 보존');
    expect(container.textContent).toContain('개발제한구역');
    await act(async () => button('후보지 비교하기→').click());
    const dialog = document.querySelector('dialog');
    expect(dialog?.textContent).toContain('개발제한구역');
    expect(dialog?.textContent).toContain('일부 규제 조회 미완료');
  });
});
