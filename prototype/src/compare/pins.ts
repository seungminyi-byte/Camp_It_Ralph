import type {
  DisasterLookup,
  LandUse,
  ProjectAssumptions,
  SiteConditions,
  RestrictionLookup,
  ScoreInput,
  ScoreResult,
  SiteSelection,
  ZoningLookup,
} from '../types';

/** UI capacity, not a scoring threshold — so it lives here rather than in constants.json. */
export const MAX_PINS = 4;

/** A pin stores its own site conditions and resolved public evidence. */
export interface PinnedSite {
  id: string;
  conditions: SiteConditions;
  selection: SiteSelection;
  /** land use as resolved when pinned (manual ?? VWorld ?? unknown) */
  landUse: LandUse;
  /** restored when the pin is reopened, so the card matches the chip */
  manualLandUse: LandUse | null;
  zoning: ZoningLookup | null;
  /** VWorld 규제구역 answer as pinned, so re-scoring the tray never refetches */
  restrictions: RestrictionLookup | null;
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
export function togglePin(
  pins: PinnedSite[],
  pin: PinnedSite,
  max = MAX_PINS,
): PinnedSite[] {
  if (pins.some((p) => p.id === pin.id))
    return pins.filter((p) => p.id !== pin.id);
  if (pins.length >= max) return pins;
  return [...pins, pin];
}

export function removePin(pins: PinnedSite[], id: string): PinnedSite[] {
  return pins.some((p) => p.id === id) ? pins.filter((p) => p.id !== id) : pins;
}

export function toScoreInput(
  pin: PinnedSite,
  project: ProjectAssumptions,
): ScoreInput {
  return {
    lat: pin.selection.lat,
    lng: pin.selection.lng,
    landUse: pin.landUse,
    landUseSource: pin.manualLandUse !== null
      ? 'manual'
      : pin.zoning?.found && pin.zoning.landUse === pin.landUse ? 'auto' : 'unknown',
    project,
    conditions: pin.conditions,
    zoning: pin.zoning,
    restrictions: pin.restrictions,
    disaster: pin.disaster,
  };
}

export interface CompareSummary {
  costliest: CompareEntry;
  cheapest: CompareEntry;
  diffKrw: number;
}
/** Only complete, equal scopes can produce a difference. */
export function compareSummary(entries: CompareEntry[]): CompareSummary | null {
  if (entries.length < 2) return null;
  const key = entries[0].result.businessCost.comparisonKey;
  if (
    !key ||
    entries.some(
      (e) =>
        !e.result.businessCost.complete ||
        e.result.businessCost.comparisonKey !== key ||
        e.result.businessCost.amountKrw === null,
    )
  )
    return null;
  const sorted = [...entries].sort(
    (a, b) =>
      a.result.businessCost.amountKrw! - b.result.businessCost.amountKrw!,
  );
  const cheapest = sorted[0];
  const costliest = sorted[sorted.length - 1];
  return {
    cheapest,
    costliest,
    diffKrw:
      costliest.result.businessCost.amountKrw! -
      cheapest.result.businessCost.amountKrw!,
  };
}
