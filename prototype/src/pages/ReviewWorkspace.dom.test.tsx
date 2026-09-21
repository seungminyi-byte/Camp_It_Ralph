// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessInputs } from '../components/BusinessInputs';
import type { SiteSearch } from '../components/SiteSearch';
import { loadScenarios } from '../test/loadData';
import ReviewWorkspace from './ReviewWorkspace';

vi.mock('../hooks/useAppData', async () => {
  const { loadAppData } = await import('../test/loadData');
  const data = loadAppData();
  return { useAppData: () => ({ data, error: null }) };
});
vi.mock('../hooks/useZoning', () => ({ useZoning: () => ({ status: 'error' }) }));
vi.mock('../hooks/useRestrictions', () => ({ useRestrictions: () => ({ status: 'error' }) }));
vi.mock('../hooks/useDisaster', () => ({ useDisaster: () => ({ status: 'error' }) }));
vi.mock('../components/MapView', () => ({ MapView: () => null }));
vi.mock('../components/SiteSearch', () => ({
  SiteSearch: ({ onPick }: ComponentProps<typeof SiteSearch>) => (
    <div>
      {['sejong-contrast', 'incheon-residential'].map((id, index) => {
        const scenario = loadScenarios().find((item) => item.id === id)!;
        return <button key={id} onClick={() => onPick({
          lat: scenario.lat, lng: scenario.lng, source: 'coords', label: `후보 ${index + 1}`,
        }, 13)}>위치 {index + 1}</button>;
      })}
    </div>
  ),
}));
vi.mock('../components/BusinessInputs', () => ({
  BusinessInputs: ({ conditions, onConditions }: ComponentProps<typeof BusinessInputs>) => (
    <button data-condition onClick={() => onConditions({ ...conditions, plannedAreaM2: 30000 })}>
      면적 {conditions.plannedAreaM2 ?? '미입력'}
    </button>
  ),
}));

let host: HTMLDivElement;
let home: HTMLButtonElement;
let root: Root;
let mounted: boolean;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
const scrollIntoView = vi.fn();

async function settle(action: () => void) {
  await act(async () => { action(); });
  // Details toggle events are queued by the DOM, independently of animation frames.
  await act(async () => { vi.runOnlyPendingTimers(); });
}

async function render(active: boolean) {
  await settle(() => root.render(
    <div hidden={!active}><ReviewWorkspace active={active} onHome={() => {}} /></div>,
  ));
}

async function frame() {
  await settle(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}

async function drainFrames() {
  for (let i = 0; i < 5 && frames.size; i++) await frame();
  expect(frames.size).toBe(0);
}

function button(label: string, scope: ParentNode = host) {
  const found = [...scope.querySelectorAll('button')].find((element) => element.textContent?.trim() === label);
  expect(found, label).toBeDefined();
  return found!;
}

async function click(element: HTMLElement) {
  await settle(() => { element.focus(); element.click(); });
}

async function select(index: number) {
  await click(button(`위치 ${index}`));
}

async function compareAction(index: number, label: string) {
  await click(host.querySelector<HTMLButtonElement>('.header-saved')!);
  const scope = host.querySelectorAll('.compare-candidate-actions')[index - 1];
  await click(button(label, scope));
}

const report = () => host.querySelector<HTMLDetailsElement>('#report-section')!;
const reportTitle = () => host.querySelector<HTMLElement>('#report-title')!;
const currentReport = () => host.querySelector<HTMLButtonElement>('.open-report-cta')!;

async function saveTwoCandidates() {
  await select(1);
  await click(host.querySelector<HTMLButtonElement>('[data-condition]')!);
  await click(host.querySelector<HTMLButtonElement>('.primary-action')!);
  await select(2);
  await click(host.querySelector<HTMLButtonElement>('.secondary-action')!);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frames = new Map();
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  Object.assign(HTMLElement.prototype, { scrollIntoView, scrollTo() {} });
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); },
    close(this: HTMLDialogElement) { this.removeAttribute('open'); },
  });
  host = document.createElement('div');
  home = document.createElement('button');
  home.textContent = '제품 소개';
  document.body.append(home, host);
  root = createRoot(host);
  mounted = true;
  await render(true);
  await drainFrames();
  scrollIntoView.mockClear();
});

afterEach(async () => {
  if (mounted) await settle(() => root.unmount());
  host.remove();
  home.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('workspace report transitions', () => {
  it('opens the current report and focuses it once after the DOM commit', async () => {
    await select(1);
    await click(currentReport());
    expect(report().open).toBe(true);
    expect(document.activeElement).not.toBe(reportTitle());
    await drainFrames();
    expect(document.activeElement).toBe(reportTitle());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('restores the requested candidate and its saved conditions before focusing its report', async () => {
    await saveTwoCandidates();
    await compareAction(1, '보고서 보기');
    await drainFrames();
    expect(report().open).toBe(true);
    expect(report().textContent).toContain('후보 1');
    expect(host.querySelector('[data-condition]')?.textContent).toBe('면적 30000');
    expect(document.activeElement).toBe(reportTitle());
    expect(host.querySelector('dialog')?.open).toBe(false);
  });

  it.each(['current', 'candidate'] as const)('cancels a %s report focus on home and keeps it closed after immediate re-entry', async (source) => {
    if (source === 'candidate') {
      await saveTwoCandidates();
      await compareAction(1, '보고서 보기');
    } else {
      await select(1);
      await click(currentReport());
    }
    await render(false);
    home.focus();
    await drainFrames();
    expect(document.activeElement).toBe(home);
    expect(report().open).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
    await render(true);
    await click(host.querySelector<HTMLButtonElement>('.header-saved')!);
    await drainFrames();
    expect(report().open).toBe(false);
    expect(host.querySelector('dialog')?.open).toBe(true);
  });

  it('does not let a delayed home reset close a newly opened comparison on re-entry', async () => {
    await select(1);
    await click(currentReport());
    await render(false);
    await render(true);
    await click(host.querySelector<HTMLButtonElement>('.header-saved')!);
    await drainFrames();
    expect(host.querySelector('dialog')?.open).toBe(true);
    expect(report().open).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(['current', 'candidate'] as const)('does not focus the new site using a stale %s report request', async (source) => {
    if (source === 'candidate') {
      await saveTwoCandidates();
      await compareAction(1, '보고서 보기');
    } else {
      await select(1);
      await click(currentReport());
    }
    await select(2);
    await drainFrames();
    expect(report().open).toBe(false);
    expect(report().textContent).toContain('후보 2');
    expect(document.activeElement).toBe(button('위치 2'));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each(['home', 'site', 'conditions'] as const)('leaves no second report frame that can steal focus after a %s transition', async (transition) => {
    await saveTwoCandidates();
    await compareAction(1, '보고서 보기');
    await frame();
    scrollIntoView.mockClear();
    if (transition === 'home') {
      await render(false);
      home.focus();
    } else if (transition === 'site') {
      await select(2);
    } else {
      await compareAction(2, '조건 수정');
    }
    const nextFocus = document.activeElement;
    await drainFrames();
    expect(report().open).toBe(false);
    expect(document.activeElement).toBe(nextFocus);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it.each([1, 2])('cancels candidate-report work when conditions are opened for candidate %i', async (index) => {
    await saveTwoCandidates();
    await compareAction(1, '보고서 보기');
    await compareAction(index, '조건 수정');
    await drainFrames();
    expect(report().open).toBe(false);
    expect(report().textContent).toContain(`후보 ${index}`);
    expect(document.activeElement).not.toBe(reportTitle());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('closes an already opened report when the same candidate is opened for editing', async () => {
    await saveTwoCandidates();
    await compareAction(1, '보고서 보기');
    await drainFrames();
    expect(report().open).toBe(true);
    await compareAction(1, '조건 수정');
    await drainFrames();
    expect(report().open).toBe(false);
  });

  it('does not revive an old report request after editing another candidate and returning', async () => {
    await saveTwoCandidates();
    await compareAction(1, '보고서 보기');
    await compareAction(2, '조건 수정');
    await compareAction(1, '조건 수정');
    await drainFrames();
    expect(report().open).toBe(false);
    expect(report().textContent).toContain('후보 1');
    expect(document.activeElement).not.toBe(reportTitle());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('lets the latest candidate-report request win', async () => {
    await saveTwoCandidates();
    await compareAction(1, '보고서 보기');
    await compareAction(2, '보고서 보기');
    await drainFrames();
    expect(report().open).toBe(true);
    expect(report().textContent).toContain('후보 2');
    expect(host.querySelector('[data-condition]')?.textContent).toBe('면적 미입력');
    expect(document.activeElement).toBe(reportTitle());
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('cancels report focus when its candidate is removed', async () => {
    await saveTwoCandidates();
    await compareAction(1, '보고서 보기');
    await compareAction(1, '후보에서 제거');
    await drainFrames();
    expect(report().open).toBe(false);
    expect(document.activeElement).not.toBe(reportTitle());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('respects a manual report close before its focus frame', async () => {
    await select(1);
    await click(currentReport());
    await settle(() => { report().open = false; });
    await drainFrames();
    expect(report().open).toBe(false);
    expect(document.activeElement).not.toBe(reportTitle());
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('cancels pending report work on unmount', async () => {
    await select(1);
    await click(currentReport());
    await settle(() => root.unmount());
    mounted = false;
    home.focus();
    expect(frames.size).toBe(0);
    await drainFrames();
    expect(document.activeElement).toBe(home);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
