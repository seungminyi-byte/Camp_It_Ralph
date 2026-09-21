// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pinId } from '../compare/pins';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { scoreSite } from '../scoring/engine';
import { loadAppData, loadScenarios } from '../test/loadData';
import { CompareDialog } from './CompareDialog';

const data = loadAppData();
const scenario = loadScenarios().find((item) => item.id === 'sejong-contrast')!;
const selection = { lat: scenario.lat, lng: scenario.lng, source: 'coords' as const };
const input = {
  lat: selection.lat,
  lng: selection.lng,
  landUse: scenario.landUse,
  project: defaultProject(data.constants),
  conditions: emptyConditions(),
};
const result = scoreSite(input, data);
const pin = {
  id: pinId({ selection, landUse: input.landUse }),
  selection,
  conditions: result.conditions,
  landUse: input.landUse,
  manualLandUse: null,
  zoning: null,
  restrictions: null,
  disaster: null,
};

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

describe('candidate report controls', () => {
  it('sends the clicked candidate to the report, conditions, and removal flows', async () => {
    Object.assign(HTMLDialogElement.prototype, {
      showModal() {},
      close() {},
    });
    const onOpen = vi.fn();
    const onOpenReport = vi.fn();
    const onRemove = vi.fn();
    const onClose = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <CompareDialog
          open
          entries={[{ pin, result }]}
          onClose={onClose}
          onOpen={onOpen}
          onOpenReport={onOpenReport}
          onRemove={onRemove}
        />,
      );
    });
    const region = host.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe('후보별 비교 표');
    const click = async (label: string) => {
      const button = [...host!.querySelectorAll('button')].find((item) => item.textContent === label)!;
      await act(async () => button.click());
    };
    await click('보고서 보기');
    expect(onOpenReport).toHaveBeenCalledWith(pin);
    expect(onClose).toHaveBeenCalledTimes(0);
    await click('조건 수정');
    expect(onOpen).toHaveBeenCalledWith(pin);
    expect(onClose).toHaveBeenCalledTimes(1);
    await click('후보에서 제거');
    expect(onRemove).toHaveBeenCalledWith(pin.id);
    await act(async () => root.unmount());
  });
});
