// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoPanel } from './MemoPanel';
import { loadAppData, loadScenarios } from '../test/loadData';
import { scoreSite } from '../scoring/engine';
import { CHECKLIST_KEYS } from '../report/checklist';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import type { GenerateOptions } from '../genai/llmClient';
const mocks = vi.hoisted(() => ({ generate: vi.fn(), key: vi.fn() }));
vi.mock('../genai/llmClient', () => ({ generateMemo: mocks.generate }));
vi.mock('../genai/memoContext', async importOriginal => ({ ...await importOriginal<typeof import('../genai/memoContext')>(), memoContextKey: mocks.key }));
const data = loadAppData(), scenario = loadScenarios()[2];
const base = { lat: scenario.lat, lng: scenario.lng, landUse: scenario.landUse, conditions: emptyConditions(), project: defaultProject(data.constants) };
const site = { lat: base.lat, lng: base.lng, source: 'coords' as const, label: '합성 후보' };
const full = ['## OVERALL\n추가 확인이 필요합니다.', ...CHECKLIST_KEYS.map(key => `## ITEM ${key}\n담당 기관에 확인하세요.`), '## ACTIONS\n- 기관 확인', '## CAVEATS\n- 참고용입니다.'].join('\n');
const defer = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let root: Root, container: HTMLDivElement;
const pending: { options: GenerateOptions; resolve: () => void; reject: (error: Error) => void }[] = [];
const render = async (input = base, selectionRevision = 0, requestRevision = 'done:1', selectedSite = site) => {
  const result = scoreSite(input, data);
  await act(async () => root.render(<MemoPanel data={data} input={input} result={result} site={selectedSite} landUseSource="manual" zoningName={null} selectionRevision={selectionRevision} requestRevision={requestRevision} />));
};
const click = async () => { await act(async () => (container.querySelector('.report-ai-button') as HTMLButtonElement).click()); };
const openReport = async () => { await act(async () => (container.querySelector('.report-open-button') as HTMLButtonElement).click()); };
const emit = async (index: number, text: string) => { await act(async () => pending[index].options.onText(text)); };
const finish = async (index: number) => { await act(async () => pending[index].resolve()); };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.generate.mockReset(); mocks.key.mockReset().mockResolvedValue('exact-context'); pending.length = 0;
  mocks.generate.mockImplementation((_prompt: string, options: GenerateOptions) => { const d = defer<void>(); pending.push({ options, resolve: () => d.resolve(), reject: d.reject }); return d.promise; });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe('AI lifecycle against a mounted React DOM', () => {
  it('does not start transport after a stopped asynchronous context hash resolves', async () => {
    const hash = defer<string>(); mocks.key.mockReturnValueOnce(hash.promise);
    await render(); await click(); await click();
    expect(container.textContent).toContain('생성을 중단했습니다');
    await act(async () => hash.resolve('late'));
    expect(mocks.generate).not.toHaveBeenCalled(); expect(document.querySelector('#print-root .report-ai')).toBeNull();
  });
  it('new run survives old first chunk, later chunks, mode, done and error callbacks', async () => {
    await render(); await click(); await emit(0, 'old partial'); await click(); await click();
    expect(pending[0].options.signal.aborted).toBe(true);
    await emit(1, full); await finish(1);
    await emit(0, 'LATE OLD TEXT');
    await act(async () => { pending[0].options.onReplace('OLD FALLBACK'); pending[0].options.onMode('fallback'); pending[0].reject(new Error('old error')); });
    expect(container.textContent).not.toContain('LATE OLD'); expect(container.textContent).not.toContain('OLD FALLBACK'); expect(container.textContent).not.toContain('old error');
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
  });
  it('invalidates on input change and remains invalid after reverting', async () => {
    await render(); await click(); await emit(0, full); await finish(0);
    await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    await openReport();
    expect(document.querySelector('#print-root .report-ai')).not.toBeNull();
    await render({ ...base, conditions: { ...base.conditions, landAreaM2: 1 } }); await render();
    expect(container.textContent).toContain('이전 AI 의견을 해제'); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).toContain('열기 이후');
    expect(document.querySelector('#print-root .report-ai')).not.toBeNull();
    await openReport(); expect(document.querySelector('#print-root .report-ai')).toBeNull();
  });
  it.each(['loading:2', 'error:2', 'partial:2', 'done:2'])('invalidates same-key evidence request %s and rejects late completion', async requestRevision => {
    await render(); await click(); await render(base, 0, requestRevision); await emit(0, full); await finish(0);
    expect(pending[0].options.signal.aborted).toBe(true); expect(container.textContent).toContain('이전 AI 의견을 해제'); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
  it('same candidate selection revision and page exit invalidate the transport', async () => {
    await render(); await click(); await render(base, 1); await emit(0, full); await finish(0);
    expect(pending[0].options.signal.aborted).toBe(true);
    await click(); await act(async () => root.render(null));
    expect(pending[1].options.signal.aborted).toBe(true); expect(document.getElementById('print-root')).toBeNull();
    await emit(1, full); await finish(1); await render(base, 1);
    expect(container.querySelector('pre')).toBeNull(); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
  it('keeps empty, partial, stopped, unmapped, error and mismatched drafts out of print', async () => {
    await render();
    for (const [draft, stop] of [['', false], ['## OVERALL\n일부 의견', false], [full, true], [full + '\n## ITEM unknown.key\n오류', false], [full + '\n## ERROR\nupstream', false], [full.replace('담당 기관에 확인하세요.', '공급 60MW가 확정되었습니다.'), false]] as const) {
      await click(); const index = pending.length - 1;
      await emit(index, draft); if (stop) await click(); await finish(index);
      await openReport();
      expect(document.querySelector('#print-root .report-ai')).toBeNull(); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      expect(document.querySelector('#print-root')?.textContent).toContain('후보 부지 검토 보고서');
    }
  });
  it('requires explicit opt-in and keeps AI text exclusively in the appendix', async () => {
    await render(); await click(); await emit(0, full); await finish(0);
    const box = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(false); expect(document.querySelector('#print-root .report-ai')).toBeNull();
    await openReport(); expect(document.querySelector('#print-root .report-ai')).toBeNull();
    await act(async () => box.click());
    expect(document.querySelector('#print-root .report-ai')).toBeNull();
    await openReport();
    expect(document.querySelector('#print-root .report-ai')?.textContent).toContain('선택 부록');
    expect(document.querySelector('#print-root .business-checklist')?.textContent).not.toContain('담당 기관에 확인하세요.');
  });
  it('renders malicious AI as text and prevents flagged appendix while basic PDF remains', async () => {
    await render(); await click(); await emit(0, full.replace('담당 기관에 확인하세요.', '<script>alert(1)</script> 한전 공식 승인이 완료되었습니다.')); await finish(0);
    expect(container.querySelector('script')).toBeNull(); expect(container.querySelector('pre')?.textContent).toContain('<script>alert(1)</script>');
    expect(document.querySelector('#print-root .report-ai')).toBeNull(); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });
  it('preserves over-limit notes and offers the basic report without network transport', async () => {
    const conditions = structuredClone(base.conditions); conditions.consultations.power.note = '입력보존'.repeat(6000);
    await render({ ...base, conditions }); await click();
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.key).not.toHaveBeenCalled();
    await openReport();
    expect(container.textContent).toContain('허용 크기'); expect(document.querySelector('#print-root')?.textContent).toContain(conditions.consultations.power.note);
  });
  it('keeps a report frozen across input and evidence changes, then opens a new complete snapshot', async () => {
    await render(); await openReport();
    const initial = document.querySelector('#print-root')!.textContent;
    const id = document.querySelector('#print-root article')!.getAttribute('data-snapshot-id');
    await render({ ...base, conditions: { ...base.conditions, plannedAreaM2: 30000, landAreaM2: 10000, farPct: 200, coveragePct: 50, floors: 4 } }, 0, 'partial:2');
    expect(document.querySelector('#print-root')!.textContent).toBe(initial);
    expect(container.textContent).toContain('열기 이후 입력 또는 근거가 변경');
    await openReport();
    expect(document.querySelector('#print-root article')!.getAttribute('data-snapshot-id')).not.toBe(id);
    expect(document.querySelector('#print-root')!.textContent).toContain('15,000㎡');
    expect(document.querySelectorAll('#print-root')).toHaveLength(1);
    await act(async () => (container.querySelector('.report-close-button') as HTMLButtonElement).click());
    expect(document.querySelector('#print-root')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('.report-open-button'));
  });
  it('retains the old snapshot across candidate and unsupported-coordinate changes while invalidating AI', async () => {
    await render(); await openReport(); await click();
    const originalId = document.querySelector('#print-root article')!.getAttribute('data-snapshot-id');
    const next = { ...base, lat: base.lat + 0.01 };
    await render(next, 1, 'done:2', { ...site, lat: next.lat, label: '다음 후보 B' });
    expect(pending[0].options.signal.aborted).toBe(true);
    await emit(0, full); await finish(0);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(document.querySelector('#print-root article')!.getAttribute('data-snapshot-id')).toBe(originalId);
    expect(document.querySelector('#print-root')!.textContent).not.toContain('다음 후보 B');
    expect(container.textContent).toContain('열기 이후');
    await openReport();
    const nextId = document.querySelector('#print-root article')!.getAttribute('data-snapshot-id');
    expect(nextId).not.toBe(originalId); expect(document.querySelector('#print-root')!.textContent).toContain('다음 후보 B');
    await render({ ...base, lat: 40 }, 2, 'idle:3', { ...site, lat: 40, label: '자료 밖 C' });
    expect((container.querySelector('.report-open-button') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('.report-ai-button') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('.report-pdf-button') as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector('#print-root article')!.getAttribute('data-snapshot-id')).toBe(nextId);
    await act(async () => root.render(null)); expect(document.querySelector('#print-root')).toBeNull();
  });
  it('waits for fonts and committed snapshot before print and restores the title and focus', async () => {
    const fonts = defer<void>();
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fonts.promise } });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queueMicrotask(() => callback(0)); return 1; });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    document.title = '원래 제목';
    await render();
    await act(async () => (container.querySelector('.report-pdf-button') as HTMLButtonElement).click());
    expect(print).not.toHaveBeenCalled(); expect(document.querySelectorAll('#print-root')).toHaveLength(1);
    await act(async () => fonts.resolve());
    expect(print).toHaveBeenCalledOnce(); expect(document.title).toContain('합성후보');
    await act(async () => window.dispatchEvent(new Event('afterprint')));
    expect(document.title).toBe('원래 제목');
    print.mockRestore(); delete (document as unknown as { fonts?: unknown }).fonts;
  });
  it('cancels a pending print when its report is closed before fonts finish', async () => {
    const fonts = defer<void>();
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: fonts.promise } });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queueMicrotask(() => callback(0)); return 1; });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await render(); await act(async () => (container.querySelector('.report-pdf-button') as HTMLButtonElement).click());
    await act(async () => (container.querySelector('.report-close-button') as HTMLButtonElement).click());
    await act(async () => fonts.resolve());
    expect(print).not.toHaveBeenCalled(); expect(document.getElementById('print-root')).toBeNull();
    print.mockRestore(); delete (document as unknown as { fonts?: unknown }).fonts;
  });

});
