import { writeFileSync } from 'node:fs';
import { loadAppData } from '../src/test/loadData.ts';
import { defaultProject, emptyConditions } from '../src/lib/reviewInputs.ts';
import { emptyReview, serializeSession } from '../src/review/session.ts';
import { CHECKLIST_KEYS } from '../src/report/checklist.ts';
const data = loadAppData();
const numeric = () => ({ ...emptyConditions(), plannedAreaM2: 30000, landAreaM2: 10000, farPct: 200, coveragePct: 50, floors: 4, averageDebtKrw: 1e11, costMode: 'total' as const, totalCostKrw: 2e11 });
const label = (id: string, long = false) => long ? (`합성 후보 ${id} · 긴 주소 검수 ` + '공개 검증용 부지 위치와 후보명을 그대로 보존합니다. '.repeat(15)).slice(0, 188) + ` ${id}_LABEL_END` : `합성 후보 ${id}`;
const notes = (id: string) => Object.fromEntries(['power', 'water', 'telecom'].map(k => { const end = ` ${id}_${k}_NOTE_END`; return [k, { status: 'discussing', date: '2026-09-21', note: ('공개 합성 검수입니다. 공급기관에 인입 조건과 확인 범위를 질의하고 실제 공급 가능량은 후속 협의합니다. '.repeat(100)).slice(0, 2000 - end.length) + end }]; }));
const pin = (id: string, i: number, long = false) => ({ id, selection: { lat: 36.4967 + i * 0.001, lng: 127.3007, source: 'coords' as const, label: label(id, long) }, conditions: { ...numeric(), totalCostKrw: (2000 + 100 * i) * 1e8, ...(long ? { consultations: notes(id) } : {}) }, manualLandUse: 'industrial', landUse: 'industrial', zoning: null, restrictions: null, disaster: null });
const cases: Record<string, any> = {};
for (const kind of ['empty', 'numeric', 'zero', 'long-partial', 'ai']) {
 const inputs: any = emptyReview(); inputs.site = { lat: 36.4967, lng: 127.3007, source: 'coords', label: label(kind === 'long-partial' ? 'E' : 'A', kind === 'long-partial') };
 if (kind !== 'empty') { inputs.conditions = numeric(); inputs.projectOverride = { ...defaultProject(data.constants), targetMw: 40, rates: [.04, .06, .08], delays: [6,12,24] }; }
 if (kind === 'numeric') { inputs.pins = [pin('A', 0), pin('B', 3)]; inputs.openedPinId = 'A'; }
 if (kind === 'zero') { inputs.conditions.averageDebtKrw = 0; inputs.conditions.totalCostKrw = 0; inputs.pins = [{ ...pin('A', 0), conditions: inputs.conditions }]; inputs.openedPinId = 'A'; }
 if (kind === 'long-partial') { inputs.site.lat = 36.49; inputs.conditions.consultations = notes('E'); inputs.pins = [pin('A',1,true),pin('B',2,true),pin('C',3,true),pin('D',4,true)]; }
 cases[kind] = { inputs, session: serializeSession(inputs), expected: { pins: inputs.pins.length, long: kind === 'long-partial', ai: kind === 'ai' } };
}
writeFileSync(new URL('./fixtures.json', import.meta.url), JSON.stringify(cases, null, 2));
writeFileSync(new URL('./ai.txt', import.meta.url), ['## OVERALL\n추가 확인이 필요합니다.', ...CHECKLIST_KEYS.map(key => `## ITEM ${key}\n담당 기관에 확인하세요.`), '## ACTIONS\n- 기관 확인', '## CAVEATS\n- 공개 합성 응답 검증입니다.'].join('\n'));
console.log(Object.fromEntries(Object.entries(cases).map(([k,v])=>[k,{bytes:Buffer.byteLength(v.session),noteLengths:Object.values(v.inputs.conditions.consultations).map((x:any)=>x.note.length),labels:v.inputs.pins.map((x:any)=>x.selection.label.length)}])));
