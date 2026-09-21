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
    expect(document.querySelector('#print-root .report-ai')).not.toBeNull();
    await render({ ...base, conditions: { ...base.conditions, landAreaM2: 1 } }); await render();
    expect(container.textContent).toContain('이전 AI 의견을 해제'); expect(container.querySelector('input[type="checkbox"]')).toBeNull(); expect(document.querySelector('#print-root .report-ai')).toBeNull();
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
      expect(document.querySelector('#print-root .report-ai')).toBeNull(); expect(container.querySelector('input[type="checkbox"]')).toBeNull();
      expect(document.querySelector('#print-root')?.textContent).toContain('후보 부지 검토 보고서');
    }
  });
  it('requires explicit opt-in and keeps AI text exclusively in the appendix', async () => {
    await render(); await click(); await emit(0, full); await finish(0);
    const box = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(false); expect(document.querySelector('#print-root .report-ai')).toBeNull();
    await act(async () => box.click());
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
    expect(container.textContent).toContain('허용 크기'); expect(document.querySelector('#print-root')?.textContent).toContain(conditions.consultations.power.note);
  });
});
