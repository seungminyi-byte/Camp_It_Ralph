import type { LandUse, ProjectAssumptions, SiteConditions, SiteSelection } from '../types';
import type { PinnedSite } from '../compare/pins';
import { emptyConditions } from '../lib/reviewInputs';

export const SESSION_KEY = 'ralph.review.v1';
export const SESSION_BYTES = 96 * 1024;
export const SESSION_TTL = 24 * 60 * 60 * 1000;
export const STORAGE_WARNING = '현재 화면의 입력은 유지됩니다. 임시 보관을 사용할 수 없어 새로고침 시 복원되지 않을 수 있습니다.';
export interface ReviewInputs {
  site: SiteSelection | null;
  conditions: SiteConditions;
  manualLandUse: LandUse | null;
  projectOverride: ProjectAssumptions | null;
  openedPinId: string | null;
  pins: PinnedSite[];
  areaUnit: 'm2' | 'pyeong';
  selectionRevision: number;
}
export const emptyReview = (): ReviewInputs => ({ site: null, conditions: emptyConditions(), manualLandUse: null, projectOverride: null, openedPinId: null, pins: [], areaUnit: 'm2', selectionRevision: 0 });
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('object');
  return v as Record<string, unknown>;
};
const text = (v: unknown, max: number): string => { if (typeof v !== 'string' || v.length > max) throw Error('text'); return v; };
const number = (v: unknown): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw Error('number'); return v; };
const nullable = (v: unknown) => v === null ? null : number(v);
function choice<T extends string>(v: unknown, options: readonly T[]): T { if (!options.includes(v as T)) throw Error('enum'); return v as T; }
const landUse = (v: unknown) => v === null ? null : choice(v, ['industrial', 'semiIndustrial', 'commercial', 'green', 'residential', 'unknown']);
function selection(v: unknown): SiteSelection {
  const p = object(v);
  const lat = number(p.lat), lng = number(p.lng);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw Error('coordinates');
  return { lat, lng, source: choice(p.source, ['map', 'emd', 'geocode', 'coords']), ...(p.label === undefined ? {} : { label: text(p.label, 200) }) };
}
function consultation(v: unknown) {
  const p = object(v), date = text(p.date, 10);
  if (date !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw Error('date');
  return { status: choice(p.status, ['unknown', 'discussing', 'confirmed']), note: text(p.note, 2000), date };
}
function conditions(v: unknown): SiteConditions {
  const p = object(v), c = object(p.costs), q = object(p.consultations);
  return { landAreaM2: nullable(p.landAreaM2), plannedAreaM2: nullable(p.plannedAreaM2), existingAreaM2: nullable(p.existingAreaM2), farPct: nullable(p.farPct), coveragePct: nullable(p.coveragePct), floors: nullable(p.floors), costMode: choice(p.costMode, ['total', 'items']), totalCostKrw: nullable(p.totalCostKrw), averageDebtKrw: nullable(p.averageDebtKrw),
    costs: { land: nullable(c.land), building: nullable(c.building), civil: nullable(c.civil), power: nullable(c.power), telecom: nullable(c.telecom), other: nullable(c.other) },
    consultations: { power: consultation(q.power), water: consultation(q.water), telecom: consultation(q.telecom) } };
}
function triple(v: unknown): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3) throw Error('triple');
  return [number(v[0]), number(v[1]), number(v[2])];
}
function project(v: unknown): ProjectAssumptions | null {
  if (v === null) return null;
  const p = object(v);
  return { type: choice(p.type, ['small', 'standard', 'hyperscale']), businessType: choice(p.businessType, ['generalCloud', 'colocation', 'ai']), targetMw: nullable(p.targetMw), development: choice(p.development, ['new', 'conversion']), areaMethod: choice(p.areaMethod, ['manual', 'racks']), itMw: nullable(p.itMw), rackKw: nullable(p.rackKw), rackAreaM2: nullable(p.rackAreaM2), whiteSpacePct: nullable(p.whiteSpacePct), rates: triple(p.rates), delays: triple(p.delays) };
}
function pin(v: unknown) {
  const p = object(v), id = text(p.id, 200);
  if (!id.trim()) throw Error('id');
  return { id, selection: selection(p.selection), conditions: conditions(p.conditions), manualLandUse: landUse(p.manualLandUse) };
}
/** Explicit projection excludes online evidence, derived values, arbitrary fields and AI. */
export function inputSnapshot(input: ReviewInputs) {
  return { current: { selection: input.site === null ? null : selection(input.site), conditions: conditions(input.conditions), manualLandUse: landUse(input.manualLandUse), openedPinId: input.openedPinId === null ? null : text(input.openedPinId, 200) }, projectOverride: project(input.projectOverride), pins: input.pins.map(pin), areaUnit: choice(input.areaUnit, ['m2', 'pyeong']) };
}
export function serializeSession(input: ReviewInputs, now = Date.now()): string {
  const body = JSON.stringify({ version: 1, savedAt: new Date(now).toISOString(), ...inputSnapshot(input) });
  if (new TextEncoder().encode(body).length > SESSION_BYTES) throw Error('size');
  if (input.pins.length > 4 || new Set(input.pins.map(p => p.id)).size !== input.pins.length) throw Error('pins');
  return body;
}
export function restoreSession(body: string | null, now = Date.now()): { inputs: ReviewInputs; notice: string | null } {
  if (body === null) return { inputs: emptyReview(), notice: null };
  try {
    if (new TextEncoder().encode(body).length > SESSION_BYTES) throw Error('size');
    const p = object(JSON.parse(body)), stamp = text(p.savedAt, 24);
    if (p.version !== 1 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(stamp) || !Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp || now - Date.parse(stamp) > SESSION_TTL || Date.parse(stamp) > now + 60_000) throw Error('version/date');
    const current = object(p.current);
    const inputs: ReviewInputs = { ...emptyReview(), site: current.selection === null ? null : selection(current.selection), conditions: conditions(current.conditions), manualLandUse: landUse(current.manualLandUse), openedPinId: current.openedPinId === null ? null : text(current.openedPinId, 200), projectOverride: project(p.projectOverride), areaUnit: choice(p.areaUnit, ['m2', 'pyeong']), selectionRevision: 1 };
    if (!Array.isArray(p.pins)) throw Error('pins');
    let dropped = 0;
    for (const candidate of p.pins) {
      try {
        const restored = pin(candidate);
        if (inputs.pins.length >= 4 || inputs.pins.some(p => p.id === restored.id)) throw Error('duplicate/capacity');
        inputs.pins.push({ ...restored, landUse: restored.manualLandUse ?? 'unknown', zoning: null, restrictions: null, disaster: null });
      } catch { dropped++; }
    }
    if (inputs.openedPinId && !inputs.pins.some(p => p.id === inputs.openedPinId)) { inputs.openedPinId = null; dropped++; }
    return { inputs, notice: dropped ? `임시 보관 자료 중 유효하지 않은 후보 또는 연결 ${dropped}개를 제외했습니다. 나머지 입력은 복원했습니다.` : '이 탭의 입력과 담은 후보를 복원했습니다. 온라인 근거는 다시 확인합니다.' };
  } catch { return { inputs: emptyReview(), notice: '임시 보관 자료가 손상되었거나 만료되어 복원하지 않았습니다. 새 검토를 시작하세요.' }; }
}
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class ReviewSessionStore {
  private state: { inputs: ReviewInputs; notice: string | null; resetRevision: number };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private storage: StorageAccess;
  constructor(storage: StorageAccess) {
    this.storage = storage;
    try { this.state = { ...restoreSession(storage().getItem(SESSION_KEY)), resetRevision: 0 }; }
    catch { this.state = { inputs: emptyReview(), notice: STORAGE_WARNING, resetRevision: 0 }; }
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish() { this.listeners.forEach(listener => listener()); }
  update = (change: (value: ReviewInputs) => ReviewInputs) => {
    const next = change(this.state.inputs);
    if (next === this.state.inputs) return;
    this.state = { ...this.state, inputs: next };
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(this.flush, 250);
    this.publish();
  };
  flush = () => {
    clearTimeout(this.timer);
    if (!this.dirty) return;
    try { this.storage().setItem(SESSION_KEY, serializeSession(this.state.inputs)); this.dirty = false; }
    catch { if (this.state.notice !== STORAGE_WARNING) { this.state = { ...this.state, notice: STORAGE_WARNING }; this.publish(); } }
  };
  reset = () => {
    clearTimeout(this.timer); this.dirty = false;
    let notice: string;
    try { this.storage().removeItem(SESSION_KEY); notice = '검토 입력과 담은 후보를 지웠습니다.'; }
    catch { notice = '현재 검토는 초기화했지만 임시 보관 자료를 지우지 못했습니다. 새로고침 시 이전 입력이 복원될 수 있습니다.'; }
    this.state = { inputs: { ...emptyReview(), selectionRevision: this.state.inputs.selectionRevision + 1 }, notice, resetRevision: this.state.resetRevision + 1 };
    this.publish();
  };
}
