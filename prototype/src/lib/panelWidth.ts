/** Side-panel width bounds (px) at lg+. UI capacity, not a scoring value, so it lives here. */
export const PANEL_WIDTH = { min: 320, max: 760, default: 420 } as const;

const KEY = 'dc-screener.panelWidth';

/** Last width the user chose; storage can be blocked (private mode), so failures fall back. */
export function readPanelWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= PANEL_WIDTH.min && v <= PANEL_WIDTH.max ? v : PANEL_WIDTH.default;
  } catch {
    return PANEL_WIDTH.default;
  }
}

export function storePanelWidth(width: number): void {
  try {
    localStorage.setItem(KEY, String(width));
  } catch {
    // storage unavailable: the width still applies for this session
  }
}
