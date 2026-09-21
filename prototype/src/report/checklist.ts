import type { AppData, LandUseSource, ScoreInput, ScoreResult } from '../types';
import { LAND_USE_LABEL } from '../scoring/engine';
import { summarizeRestriction } from '../scoring/restriction';
import { summarizeDisaster } from '../lib/disasterSummary';
import { fmtArea, fmtCount, fmtKrw, fmtPopulation } from '../lib/format';
import { CONSULTATION_LABELS, CONSULTATION_STATUS } from '../lib/reviewInputs';
export type Verdict = 'good' | 'caution' | 'risk' | 'na';
export const VERDICT_GLYPH: Record<Verdict, string> = {
  good: '○',
  caution: '△',
  risk: '!',
  na: '—',
};
export const VERDICT_LABEL: Record<Verdict, string> = {
  good: '자료 확인',
  caution: '검토 필요',
  risk: '제약 확인',
  na: '미확인',
};
export const CHECKLIST_KEYS = [
  'power.gate',
  'power.distance',
  'power.region',
  'permit.landUse',
  'permit.population',
  'permit.school',
  'permit.regulation',
  'permit.restriction',
  'permit.disaster',
  'permit.cases',
  'permit.news',
  'permit.delayStat',
  'site.terrain',
  'site.landWater',
  'site.area',
  'cost.business',
  'cost.finance',
  'infra.consultation',
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export interface ChecklistRow {
  key: ChecklistKey;
  group: '전력' | '인허가' | '부지' | '비용' | '기반시설';
  title: string;
  verdict: Verdict;
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
export function verdictFromPoints(points: number): Verdict {
  return points > 0 ? 'caution' : 'good';
}
/** The report formats engine evidence and never infers capacity, consent or delay. */
export function buildChecklist(
  r: ScoreResult,
  data: AppData,
  ctx: ChecklistContext,
): ChecklistRow[] {
  const rows: ChecklistRow[] = [];
  const add = (
    key: ChecklistKey,
    group: ChecklistRow['group'],
    title: string,
    verdict: Verdict,
    evidence: string,
    sources: string[] = [],
    points: number | null = null,
  ) =>
    rows.push({
      key,
      group,
      title,
      verdict: r.site.eligible ? verdict : 'na',
      evidence,
      sources,
      points,
    });
  const source = (key: string) =>
    r.evidence.filter((e) => e.key === key).map((e) => e.sourceUrl);
  add(
    'power.gate',
    '전력',
    '읍면동 공개 변전소 목록',
    r.power.listedCount === null ? 'na' : 'good',
    `목록 등재 ${fmtCount(r.power.listedCount, '곳')} · 실제 공급 가능 용량 미확인. 목록 미등재로 부지를 제외하지 않음.`,
    source('power'),
  );
  add(
    'power.distance',
    '전력',
    'OSM 변전소 위치',
    r.power.nearestSubstation ? 'good' : 'na',
    r.power.nearestSubstation
      ? `${r.power.nearestSubstation.name} · 직선 ${r.power.nearestSubstation.distanceKm.toFixed(2)}km. 실제 연결 변전소·공사 경로가 아님.`
      : '위치자료 미확인',
    source('substations'),
  );
  add(
    'power.region',
    '전력',
    '지역 참고점수',
    r.power.score === null ? 'na' : 'good',
    `${r.emd?.sido ?? '지역 미확인'} · 지역 참고값 ${r.power.regionScore}. 개별 사업의 심사 결과를 예측하지 않음.`,
  );
  add(
    'permit.landUse',
    '인허가',
    '용도지역',
    ctx.input.landUse === 'unknown' ? 'na' : r.evidence.find((e) => e.key === 'zoning')?.status === 'available' ? 'good' : 'caution',
    `${LAND_USE_LABEL[ctx.input.landUse]} · ${ctx.landUseSource === 'manual' ? '사용자 선택' : ctx.landUseSource === 'auto' ? `VWorld 자동 조회: ${ctx.zoningName ?? LAND_USE_LABEL[ctx.input.landUse]}` : '자동 조회 미확인'}${r.evidence.find((e) => e.key === 'zoning')?.status === 'available' ? '' : ' · 온라인 근거 미완료 또는 재확인 필요'} · 건축 가능 여부·적용 용적률은 별도 확인.`,
    source('zoning'),
  );
  add(
    'permit.population',
    '인허가',
    '주변 인구·가구',
    r.permit.popNearby === null ||
      r.permit.householdsNearby === null ||
      r.permit.householdMissingCells > 0
      ? 'na'
      : 'good',
    `반경 ${data.constants.scoring.permit.popRadiusKm}km 내 1km 격자 중심점 합계: 인구 ${fmtPopulation(r.permit.popNearby)}, 가구 ${fmtCount(r.permit.householdsNearby, '가구')}. 가구 결측 격자 ${r.permit.householdMissingCells}개. 비밀보호 조정이 있는 참고값이며 주민등록 세대수·수용성 평가와 다름.`,
    [...source('population'), ...source('households')],
  );
  add(
    'permit.school',
    '인허가',
    '학교 지점 거리',
    r.permit.nearestSchool ? 'good' : 'na',
    r.permit.nearestSchool
      ? `${r.permit.nearestSchool.name} · 직선 ${r.permit.nearestSchool.distanceKm.toFixed(2)}km. 법정 보호구역 경계거리가 아님.`
      : '학교 위치자료 미확인',
    source('schools'),
  );
  add(
    'permit.regulation',
    '인허가',
    '수집된 지역 규제·조례',
    r.permit.matchedRegulations.length ? 'caution' : 'na',
    r.permit.matchedRegulations.map((x) => x.detail).join(' / ') ||
      '수집된 관련 조례 없음 · 규제가 없다는 의미가 아니므로 최신 조례 확인 필요',
    r.permit.matchedRegulations.map((x) => x.source_url),
  );
  add(
    'permit.restriction',
    '인허가',
    '법정 보호·규제구역',
    r.restriction.level === 'prohibited'
      ? 'risk'
      : ['conditional', 'review', 'reference'].includes(r.restriction.level)
        ? 'caution'
        : r.restriction.checked.bundled && r.restriction.checked.vworld === 'ok'
          ? 'good'
          : 'na',
    summarizeRestriction(r.restriction, true),
    [...new Set([
      ...source('restrictions'),
      ...(r.restriction.mapping && r.restriction.hits.some(h => h.level === 'review' || h.level === 'reference')
        ? [r.restriction.mapping.vworldDocumentUrl] : []),
      ...r.restriction.hits.flatMap(h => h.sourceIds ?? []).flatMap(id => {
        const legalSource = r.restriction.mapping?.sources[id];
        return legalSource ? [legalSource.url] : [];
      }),
    ])],
    r.permit.deductions.find(
      (x) =>
        x.label === '법적 입지 제한 구역' || x.label === '규제구역 검토 필요',
    )?.points ?? null,
  );
  add(
    'permit.disaster',
    '인허가',
    '재해위험지구',
    r.disaster.status === 'unknown'
      ? 'na'
      : r.disaster.status === 'hit'
        ? 'caution'
        : 'good',
    summarizeDisaster(r.disaster),
    source('disaster'),
    r.disaster.status === 'unknown' ? null : r.disaster.deduction,
  );
  add(
    'permit.cases',
    '인허가',
    '언론 보도 참조 사례',
    r.permit.matchedCases.length ? 'good' : 'na',
    r.permit.matchedCases.map((x) => `${x.name}: ${x.summary}`).join(' / ') ||
      '등록된 인근 참조 사례 없음 · 감점 제외',
    r.permit.matchedCases.map((x) => x.source_url),
  );
  add(
    'permit.news',
    '인허가',
    '뉴스 참고 목록',
    r.permit.newsSignal ? 'good' : 'na',
    r.permit.newsSignal
      ? `${r.permit.newsSignal.areaLabel}: 수집 범위 내 갈등 보도 ${r.permit.newsSignal.row.conflictArticles}건. 0건도 수용성을 뜻하지 않으며 감점 제외.`
      : '지역 뉴스 자료 미수집·미확인',
    r.permit.newsSignal?.row.top.map((x) => x.link) ?? [],
  );
  const ds = r.permit.delayStat;
  add(
    'permit.delayStat',
    '인허가',
    '허가→착공 참고 통계',
    ds?.enough ? 'good' : 'na',
    ds
      ? `${ds.areaLabel} 대형 신축 표본 ${ds.row.n}건, 중앙값 ${ds.row.medianMonths ?? '미확인'}개월. ${ds.enough ? '집계 자료' : '표본 부족'}. 이 부지의 예상 지연기간으로 사용하지 않음.`
      : '허가 통계 미확인',
  );
  add(
    'site.terrain',
    '부지',
    '지형·경사',
    !r.terrain ? 'na' : r.terrain.deduction > 0 ? 'caution' : 'good',
    r.terrain
      ? `격자 중앙값 경사 ${r.terrain.sample.slopeP50Deg}°, 표고 약 ${r.terrain.sample.elevM}m · ${r.terrain.band}. 실측 자료가 아님.`
      : '지형 자료 미확인',
    source('terrain'),
  );
  add(
    'site.landWater',
    '부지',
    '육지·수역 및 자료 범위',
    r.site.eligible ? 'good' : 'na',
    `${r.site.label} · ${r.site.detail}`,
  );
  add(
    'site.area',
    '부지',
    '면적 검토',
    r.area.status === 'unknown'
      ? 'na'
      : r.area.status === 'shortfall'
        ? 'caution'
        : 'good',
    `${r.area.label}. 필요 연면적 ${fmtArea(r.area.requiredAreaM2)}, 이론상 최소 대지 ${fmtArea(r.area.minimumLandM2)}. ${r.area.note}`,
  );
  add(
    'cost.business',
    '비용',
    '사업비 범위',
    r.businessCost.complete ? 'good' : 'na',
    `${r.businessCost.label} ${fmtKrw(r.businessCost.amountKrw)}. 미입력·유효값 확인: ${r.businessCost.missing.join(' · ') || '없음'}. 지연 금융비용 별도.`,
  );
  add(
    'cost.finance',
    '비용',
    '금리·지연기간 민감도',
    r.finance.missing.length ? 'na' : 'good',
    `평균 차입잔액 ${fmtKrw(r.finance.debtKrw)}. 잔액 × 연 금리 × 지연개월 ÷ 12. 시장 예측이 아닌 계산 가정.`,
  );
  add(
    'infra.consultation',
    '기반시설',
    '전력·용수·통신 협의',
    r.review.issues.some((i) => i.title.includes('공급조건 확인'))
      ? 'na'
      : 'good',
    (Object.keys(CONSULTATION_LABELS) as (keyof typeof CONSULTATION_LABELS)[])
      .map(
        (k) =>
          `${CONSULTATION_LABELS[k]}: ${CONSULTATION_STATUS[r.conditions.consultations[k].status]} / ${r.conditions.consultations[k].date || '날짜 미입력'} / ${r.conditions.consultations[k].note || '내용 미입력'}`,
      )
      .join('\n'),
  );
  return rows;
}
