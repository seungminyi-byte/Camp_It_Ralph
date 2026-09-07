/** Side-panel width bounds (px) at lg+. UI capacity, not a scoring value, so it lives here. */
export const PANEL_WIDTH = { min: 360, max: 780 } as const;

const KEY = 'dc-screener.panelWidth.v2';

/** The initial 42% side panel leaves the map at the requested 58% share. */
export function defaultPanelWidth(): number {
  const viewport = typeof window === 'undefined' ? 1200 : window.innerWidth;
  return Math.round(Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, viewport * 0.42)));
}

/** Last width the user chose; storage can be blocked (private mode), so failures fall back. */
export function readPanelWidth(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= PANEL_WIDTH.min && v <= PANEL_WIDTH.max ? v : defaultPanelWidth();
  } catch {
    return defaultPanelWidth();
  }
}

export function storePanelWidth(width: number): void {
  try {
    localStorage.setItem(KEY, String(width));
  } catch {
    // storage unavailable: the width still applies for this session
  }
}
