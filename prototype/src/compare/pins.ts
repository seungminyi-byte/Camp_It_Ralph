import type { DisasterLookup, LandUse, ProjectType, ScoreInput, ScoreResult, SiteSelection, ZoningLookup } from '../types';

/** UI capacity, not a scoring threshold — so it lives here rather than in constants.json. */
export const MAX_PINS = 4;

/**
 * A pinned site keeps only what is specific to the location. Capex and rate are deliberately
 * NOT stored: the tray compares "same project, different place", so the current sliders apply
 * to every pin at once.
 */
export interface PinnedSite {
  id: string;
  selection: SiteSelection;
  /** land use as resolved when pinned (manual ?? VWorld ?? unknown) */
  landUse: LandUse;
  /** restored when the pin is reopened, so the card matches the chip */
  manualLandUse: LandUse | null;
  zoning: ZoningLookup | null;
  disaster: DisasterLookup | null;
}

export interface CompareEntry {
  pin: PinnedSite;
  result: ScoreResult;
}

/** Same coordinates under a different land use are a legitimate what-if, so they get separate ids. */
export function pinId(p: Pick<PinnedSite, 'selection' | 'landUse'>): string {
  const { lat, lng } = p.selection;
  return `${lat.toFixed(5)},${lng.toFixed(5)}|${p.landUse}`;
}

/** Add when absent, remove when present; a full tray returns the same array so callers can bail. */
export function togglePin(pins: PinnedSite[], pin: PinnedSite, max = MAX_PINS): PinnedSite[] {
  if (pins.some((p) => p.id === pin.id)) return pins.filter((p) => p.id !== pin.id);
  if (pins.length >= max) return pins;
  return [...pins, pin];
}

export function removePin(pins: PinnedSite[], id: string): PinnedSite[] {
  return pins.some((p) => p.id === id) ? pins.filter((p) => p.id !== id) : pins;
}

export function toScoreInput(
  pin: PinnedSite,
  capexKrw: number,
  annualRate: number,
  projectType: ProjectType,
): ScoreInput {
  return {
    lat: pin.selection.lat,
    lng: pin.selection.lng,
    landUse: pin.landUse,
    projectType,
    capexKrw,
    annualRate,
    zoning: pin.zoning,
    disaster: pin.disaster,
  };
}

export interface CompareSummary {
  costliest: CompareEntry;
  cheapest: CompareEntry;
  diffKrw: number;
  diffMonths: number;
}

/** Spread between the pins on delay cost — a difference of engine outputs, not a score of its own. */
export function compareSummary(entries: CompareEntry[]): CompareSummary | null {
  if (entries.length < 2) return null;
  let costliest = entries[0];
  let cheapest = entries[0];
  for (const e of entries) {
    if (e.result.finance.delayCostKrw > costliest.result.finance.delayCostKrw) costliest = e;
    if (e.result.finance.delayCostKrw < cheapest.result.finance.delayCostKrw) cheapest = e;
  }
  return {
    costliest,
    cheapest,
    diffKrw: costliest.result.finance.delayCostKrw - cheapest.result.finance.delayCostKrw,
    diffMonths: costliest.result.delay.pointMonths - cheapest.result.delay.pointMonths,
  };
}
