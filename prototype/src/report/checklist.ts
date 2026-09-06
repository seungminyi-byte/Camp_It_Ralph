import { LAND_USE_LABEL } from '../scoring/engine';
import type { AppData, LandUseSource, ScoreInput, ScoreResult } from '../types';

export type Verdict = 'good' | 'caution' | 'risk' | 'na';

export const VERDICT_GLYPH: Record<Verdict, string> = {
  good: '○',
  caution: '△',
  risk: '✗',
  na: '—',
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: '양호',
  caution: '주의',
  risk: '위험',
  na: '미확인',
};

export type ChecklistKey =
  | 'power.gate'
  | 'power.distance'
  | 'power.region'
  | 'permit.landUse'
  | 'permit.population'
  | 'permit.school'
  | 'permit.regulation'
  | 'permit.cases'
  | 'permit.news'
  | 'permit.delayStat'
  | 'site.terrain'
  | 'site.landWater';

export const CHECKLIST_KEYS: readonly ChecklistKey[] = [
  'power.gate',
  'power.distance',
  'power.region',
  'permit.landUse',
  'permit.population',
  'permit.school',
  'permit.regulation',
  'permit.cases',
  'permit.news',
  'permit.delayStat',
  'site.terrain',
  'site.landWater',
];

export interface ChecklistRow {
  key: ChecklistKey;
  group: '전력' | '인허가' | '부지';
  title: string;
  verdict: Verdict;
  /** deducted points where the row maps to a deduction, else null */
  points: number | null;
  evidence: string;
  anchor?: string;
  sources: string[];
}

export interface ChecklistContext {
  input: ScoreInput;
  landUseSource: LandUseSource;
  zoningName: string | null;
}

/** Shared severity scale so every row reads the same way. */
export function verdictFromPoints(points: number): Verdict {
  if (points <= 0) return 'good';
  return points < 10 ? 'caution' : 'risk';
}

function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function dedPoints(result: ScoreResult, ...labels: string[]): number {
  return result.permit.deductions
    .filter((d) => labels.includes(d.label))
    .reduce((s, d) => s + d.points, 0);
}

function landUseSourceLabel(ctx: ChecklistContext): string {
  if (ctx.landUseSource === 'auto') return `VWorld 자동 판정${ctx.zoningName ? `: ${ctx.zoningName}` : ''}`;
  if (ctx.landUseSource === 'manual') return '수동 선택';
  return '미확인 (기본 감점 적용)';
}

/**
 * Fixed 12-row due-diligence checklist. Verdicts and evidence come straight from ScoreResult so
 * the report is reproducible without the LLM; the model only fills the opinion column.
 */
export function buildChecklist(
  result: ScoreResult,
  data: AppData,
  ctx: ChecklistContext,
): ChecklistRow[] {
  const s = data.constants.stats;
  const q = data.constants.scoring.permit;

  const rows: Record<ChecklistKey, Omit<ChecklistRow, 'key' | 'group' | 'title'>> = {
    'power.gate': (() => {
      const n = result.gate.substationCount;
      const verdict: Verdict = !result.emd
        ? 'na'
        : result.project.substationRequirementMet
          ? 'good'
          : result.gate.pass
            ? 'caution'
            : 'risk';
      const where = result.emd ? `${result.emd.sigungu} ${result.emd.emd}` : '행정구역 미확인';
      return {
        verdict,
        points: result.project.substationDeduction,
        evidence:
          `${where} 공급가능 변전소 ${n}곳` +
          (result.gate.substations.length ? ` (${result.gate.substations.join(', ')})` : '') +
          ` · ${result.project.profile.label} ${result.project.profile.targetMw}MW급 권장조건 ${result.project.profile.minSubstations}곳 이상` +
          ` · 확보 전력 추정 "${result.power.capacityBand}"` +
          (result.emdUncertain && result.emd
            ? ` · 행정구역 판정 불확실 (가장 가까운 읍면동 중심점 ${fmtKm(result.emd.distanceKm)})`
            : ''),
        sources: [],
      };
    })(),

    'power.distance': (() => {
      const near = result.power.nearestSubstation;
      const score = result.power.distanceScore;
      return {
        verdict: (!near
          ? 'na'
          : result.project.distanceRequirementMet
            ? 'good'
            : score >= 60
              ? 'caution'
              : 'risk') as Verdict,
        points: result.project.distanceDeduction,
        evidence: near
          ? `최근접 변전소 ${near.name} ${fmtKm(near.distanceKm)} · ${result.project.profile.label} 권장거리 ${result.project.profile.maxSubstationKm}km 이내 (OpenStreetMap 참고치)`
          : '반경 내 변전소 정보 없음',
        sources: [],
      };
    })(),

    'power.region': (() => {
      const score = result.power.regionScore;
      return {
        verdict: (score >= 70 ? 'good' : score >= 40 ? 'caution' : 'risk') as Verdict,
        points: null,
        evidence:
          `${result.emd?.sido ?? '지역 미상'} 지역 여건 ${score}점 · ` +
          `수도권 최종 공급가능 승인률 ${((s.capitalFinalApprovalRate.value ?? 0) * 100).toFixed(1)}%, ` +
          `비수도권 통과율 ${((s.nonCapitalPassRate.value ?? 0) * 100).toFixed(1)}%`,
        sources: [s.capitalFinalApprovalRate.sourceUrl, s.techReviewTotal.sourceUrl].filter(
          (u): u is string => !!u,
        ),
      };
    })(),

    'permit.landUse': (() => {
      const blocked = result.permit.deductions.some((d) => d.label === '조례상 입지 불가');
      const verdict: Verdict = blocked
        ? 'risk'
        : ctx.input.landUse === 'unknown'
          ? 'na'
          : verdictFromPoints(dedPoints(result, `용도지역: ${LAND_USE_LABEL[ctx.input.landUse]}`));
      return {
        verdict,
        points: dedPoints(result, `용도지역: ${LAND_USE_LABEL[ctx.input.landUse]}`),
        evidence:
          `${LAND_USE_LABEL[ctx.input.landUse]} (${landUseSourceLabel(ctx)})` +
          (blocked ? ' · 조례상 데이터센터 입지 불가 구역' : ''),
        sources: [],
      };
    })(),

    'permit.population': (() => {
      const points = dedPoints(result, '주거 인접');
      return {
        verdict: verdictFromPoints(points),
        points,
        evidence: `반경 ${q.popRadiusKm}km 인구 약 ${result.permit.popNearby.toLocaleString()}명 (SGIS 1km 격자)`,
        anchor: '김포 구래동: 아파트 인접 반발로 허가 후 착공까지 4년',
        sources: [],
      };
    })(),

    'permit.school': (() => {
      const points = dedPoints(result, '학교 근접');
      const near = result.permit.nearestSchool;
      return {
        verdict: verdictFromPoints(points),
        points,
        evidence: near
          ? `최근접 학교 ${near.name} ${fmtKm(near.distanceKm)} (교육환경보호구역 200m)`
          : '반경 내 학교 없음',
        anchor: '금천 독산동: 학교 인접 민원으로 공사 1.5개월 중단',
        sources: [],
      };
    })(),

    'permit.regulation': (() => {
      const points = dedPoints(
        result,
        ...result.permit.deductions
          .map((d) => d.label)
          .filter((l) => l.startsWith('지자체 규제') || l === '조례상 입지 불가'),
      );
      const regs = result.permit.matchedRegulations;
      return {
        verdict: verdictFromPoints(points),
        points,
        evidence: regs.length
          ? regs.map((r) => `${r.sido} ${r.sigungu} ${r.reg_type}: ${r.detail}`).join(' / ')
          : '확인된 특이 규제 없음',
        sources: regs.map((r) => r.source_url).filter(Boolean),
      };
    })(),

    'permit.cases': (() => {
      const points = result.permit.conflictRisk.casePoints + result.permit.conflictRisk.nearbyPoints;
      const cases = result.permit.matchedCases;
      return {
        verdict: verdictFromPoints(points),
        points,
        evidence: cases.length
          ? cases.map((c) => `${c.name} (${c.status}, 지연 ${c.delay_months}개월)`).join(' / ')
          : '동일·인근 시군구 사례 없음',
        sources: cases.map((c) => c.source_url).filter(Boolean),
      };
    })(),

    'permit.news': (() => {
      const ns = result.permit.newsSignal;
      if (!ns) {
        return { verdict: 'na' as Verdict, points: null, evidence: '뉴스 갈등 보도 자료 없음', sources: [] };
      }
      const months = data.newsSignal?.window.months ?? 24;
      const head = ns.row.top[0];
      return {
        verdict: verdictFromPoints(ns.deduction),
        points: ns.deduction,
        evidence:
          `${ns.areaLabel} 최근 ${months}개월 반대·갈등 기사 ${ns.row.conflictArticles}건` +
          ` (데이터센터 기사 전체 ${ns.row.articles}건)` +
          (head ? ` · 대표 기사 "${head.title}" (${head.date})` : ''),
        anchor: '안양 호계동: 주민 반대 여론 속 2년 정체 끝에 사업 무산',
        sources: head ? [head.link] : [],
      };
    })(),

    'permit.delayStat': (() => {
      const ds = result.permit.delayStat;
      if (!ds) {
        return { verdict: 'na' as Verdict, points: null, evidence: '허가 통계 데이터 없음', sources: [] };
      }
      if (!ds.enough) {
        return {
          verdict: 'na' as Verdict,
          points: null,
          evidence: `${ds.areaLabel} 표본 ${ds.row.n}건으로 부족 — 감점 미적용`,
          sources: [],
        };
      }
      return {
        verdict: verdictFromPoints(ds.deduction),
        points: ds.deduction,
        evidence:
          `${ds.areaLabel} 대형 신축 ${ds.row.n}건: 허가→착공 중앙값 ${ds.row.medianMonths}개월` +
          (ds.baselineMedianMonths !== null
            ? ` (조사 시군구 전체 ${ds.baselineMedianMonths}개월${ds.ratio !== null ? `, ${ds.ratio.toFixed(1)}배` : ''})`
            : '') +
          (ds.row.stalled12mShare !== null
            ? ` · 12개월 이상 미착공 ${Math.round(ds.row.stalled12mShare * 100)}%`
            : ''),
        anchor: '국토부: 수도권 건축허가 DC 33곳 중 17곳(51.5%) 지연·차질',
        sources: [],
      };
    })(),

    'site.terrain': (() => {
      const t = result.terrain;
      if (!t) {
        return { verdict: 'na' as Verdict, points: null, evidence: '지형 데이터 없음', sources: [] };
      }
      const steepAt = data.terrain?.steepThresholdDeg ?? 15;
      return {
        verdict: t.unsuitable ? ('risk' as Verdict) : verdictFromPoints(t.deduction),
        points: t.deduction,
        evidence:
          `1km 격자 중앙값 경사 ${t.sample.slopeP50Deg}° · ${steepAt}° 이상 비율 ${t.sample.steepPct}%` +
          ` · 표고 약 ${t.sample.elevM}m — ${t.band}`,
        anchor: '산지관리법 시행령 별표4: 산지전용허가 평균경사도 25° 이하',
        sources: [],
      };
    })(),

    'site.landWater': (() => {
      const verdict: Verdict =
        result.site.status === 'ok'
          ? 'good'
          : result.site.status === 'nodata' || result.site.status === 'outside'
            ? 'na'
            : result.site.status === 'sea'
              ? 'risk'
              : 'caution';
      return {
        verdict,
        points: null,
        evidence: `${result.site.label} — ${result.site.detail}`,
        sources: [],
      };
    })(),
  };

  const meta: Record<ChecklistKey, { group: ChecklistRow['group']; title: string }> = {
    'power.gate': { group: '전력', title: '읍면동 공급가능 변전소' },
    'power.distance': { group: '전력', title: '최근접 변전소 거리' },
    'power.region': { group: '전력', title: '지역 승인 여건' },
    'permit.landUse': { group: '인허가', title: '용도지역' },
    'permit.population': { group: '인허가', title: '주거 인접 (반경 1km 인구)' },
    'permit.school': { group: '인허가', title: '학교 근접' },
    'permit.regulation': { group: '인허가', title: '지자체 규제·조례' },
    'permit.cases': { group: '인허가', title: '유사 갈등 사례' },
    'permit.news': { group: '인허가', title: '뉴스 갈등 보도' },
    'permit.delayStat': { group: '인허가', title: '허가→착공 지연 통계' },
    'site.terrain': { group: '부지', title: '지형·경사' },
    'site.landWater': { group: '부지', title: '육지·수역 판정' },
  };

  return CHECKLIST_KEYS.map((key) => ({ key, ...meta[key], ...rows[key] }));
}
