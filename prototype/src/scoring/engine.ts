import { isEvidenceFresh } from '../lib/lookupContract';
import type {
  AppData,
  CapReason,
  CaseRow,
  Deduction,
  LandUse,
  TerrainSample,
  NewsSignalFile,
  NewsSignalRow,
  PermitDelayFile,
  PermitDelayRow,
  ScoreInput,
  ScoreResult,
  ProjectAssumptions,
  SiteConditions,
  ReviewIssue,
  CostItem,
} from '../types';
import {
  defaultProject,
  emptyConditions,
  COST_LABELS,
  CONSULTATION_LABELS,
} from '../lib/reviewInputs';
import { haversineKm, nearest, sumWithinKm } from './geo';
import {
  classifySite,
  findReclaimedOverride,
  lookupTerrain,
  slopeDeduction,
} from './terrain';
import { classifyCoverage } from './coverage';
import {
  RESTRICTION_DEDUCTION_LABEL,
  describeRestrictionHits,
  lookupRestrictions,
} from './restriction';

export const LAND_USE_LABEL: Record<LandUse, string> = {
  industrial: '공업지역',
  semiIndustrial: '준공업지역',
  commercial: '상업지역',
  green: '녹지·관리지역',
  residential: '주거지역',
  unknown: '미확인',
};

function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/**
 * Match a permit-delay row: exact sigungu → city roll-up (prefix) → sido-wide ('*').
 * The first candidate with at least `minPermits` samples wins; if none is large enough the most
 * specific candidate is returned so the card can still say "표본 부족".
 */
function findPermitRow(
  file: PermitDelayFile | null,
  sido: string,
  sigungu: string,
  minPermits: number,
): PermitDelayRow | null {
  if (!file) return null;
  const rows = file.rows.filter((r) => r.sido === sido);
  const candidates = [
    rows.find((r) => r.level === 'sigungu' && r.sigungu === sigungu),
    rows.find((r) => r.level === 'city' && sigungu.startsWith(r.sigungu)),
    rows.find((r) => r.sigungu === '*'),
  ].filter((r): r is PermitDelayRow => r !== undefined);
  return (
    candidates.find((r) => r.n >= minPermits && r.medianMonths !== null) ??
    candidates[0] ??
    null
  );
}

/** Same fallback chain for the news rows: exact sigungu → city roll-up (prefix) → sido-wide ('*'). */
function findNewsRow(
  file: NewsSignalFile | null,
  sido: string,
  sigungu: string,
): NewsSignalRow | null {
  if (!file) return null;
  const rows = file.rows.filter((r) => r.sido === sido);
  return (
    rows.find((r) => r.level === 'sigungu' && r.sigungu === sigungu) ??
    rows.find((r) => r.level === 'city' && sigungu.startsWith(r.sigungu)) ??
    rows.find((r) => r.sigungu === '*') ??
    null
  );
}

export function scoreSite(input: ScoreInput, data: AppData): ScoreResult {
  const { scoring } = data.constants;
  const project = input.project ?? {
    ...defaultProject(data.constants),
    type: input.projectType ?? 'standard',
  };
  const conditions = input.conditions ?? {
    ...emptyConditions(),
    costMode: 'total',
    totalCostKrw: input.capexKrw ?? null,
  };
  const projectProfile = scoring.projectProfiles[project.type];
  const { lat, lng } = input;

  const emdMatch = nearest(lat, lng, data.emdCentroids, (c) => [c.lat, c.lng]);
  const emdUncertain =
    emdMatch === null ||
    emdMatch.distanceKm > scoring.power.emdMatchUncertainKm;
  const emdInfo = emdMatch
    ? {
        key: `${emdMatch.item.sido}|${emdMatch.item.sigungu}|${emdMatch.item.emd}`,
        sido: emdMatch.item.sido,
        sigungu: emdMatch.item.sigungu,
        emd: emdMatch.item.emd,
        distanceKm: emdMatch.distanceKm,
      }
    : null;

  // Beyond the bundled data every number below would be borrowed from the nearest
  // 읍면동 across the border or the sea, so the point is marked 판독 불가 and the UI shows no grade.
  const coverage = classifyCoverage(
    lat,
    lng,
    emdMatch
      ? {
          label:
            emdMatch.item.sigungu === emdMatch.item.sido
              ? `${emdMatch.item.sido} ${emdMatch.item.emd}`
              : `${emdMatch.item.sido} ${emdMatch.item.sigungu} ${emdMatch.item.emd}`,
          distanceKm: emdMatch.distanceKm,
        }
      : null,
    scoring.coverage,
  );

  const terrainCfg = scoring.terrain;
  const terrainSample: TerrainSample | null = data.terrain
    ? lookupTerrain(data.terrain, lat, lng)
    : null;
  const reclaimed = findReclaimedOverride(
    terrainCfg.reclaimedOverrides,
    lat,
    lng,
  );
  const site: ScoreResult['site'] = coverage.outside
    ? {
        status: 'outside',
        eligible: false,
        label: '판독 불가 · 자료 범위 밖',
        detail: coverage.detail,
        override: null,
      }
    : classifySite(terrainSample, reclaimed, terrainCfg, {
        zoningFound: input.zoning?.found ? true : input.zoning && isEvidenceFresh(input.zoning) ? false : null,
      });

  let emdPower = emdInfo
    ? data.emdPower.find(
        (p) =>
          p.sido === emdInfo.sido &&
          p.sigungu === emdInfo.sigungu &&
          p.emd === emdInfo.emd,
      )
    : undefined;
  if (!emdPower && emdInfo) {
    const bySidoEmd = data.emdPower.filter(
      (p) => p.sido === emdInfo.sido && p.emd === emdInfo.emd,
    );
    if (bySidoEmd.length === 1) emdPower = bySidoEmd[0];
  }
  const subCount = emdPower?.count ?? 0;
  const gatePass = subCount > 0;

  const p = scoring.power;
  const supplyScore =
    subCount >= 3
      ? p.supplyScoreBySubstationCount['3plus']
      : (p.supplyScoreBySubstationCount[String(subCount)] ?? 0);
  const regionScore = emdInfo
    ? (p.regionPrior[emdInfo.sido.slice(0, 2)] ?? p.regionPrior['default'])
    : p.regionPrior['default'];
  const nearestSub = nearest(lat, lng, data.substations, (s) => [s.lat, s.lng]);
  const subDistKm = nearestSub?.distanceKm ?? 999;
  const distanceScore =
    p.distanceScoreKm.find((b) => subDistKm <= b.maxKm)?.score ?? 20;
  let powerScore =
    p.weightSupply * supplyScore +
    p.weightRegion * regionScore +
    p.weightDistance * distanceScore;

  powerScore = Math.max(0, Math.round(powerScore));

  const q = scoring.permit;
  const deductions: Deduction[] = [];

  const popNearby = Math.round(
    sumWithinKm(
      lat,
      lng,
      data.popGrid,
      (g) => [g[0], g[1]],
      q.popRadiusKm,
      (g) => g[2],
    ),
  );
  const basePopDed =
    q.populationDeduction.find((b) => popNearby <= b.maxPop)?.deduction ?? 0;
  const popDed = basePopDed;
  if (popDed > 0) {
    deductions.push({
      label: '주거 인접',
      points: popDed,
      evidence: `반경 ${q.popRadiusKm}km 인구 약 ${popNearby.toLocaleString()}명 (SGIS 1km 격자)`,
      anchor: '김포 구래동: 아파트 인접 반발로 허가 후 착공까지 4년',
    });
  }

  const nearestSchool = nearest(lat, lng, data.schools, (s) => [s[2], s[3]]);
  const schoolDistKm = nearestSchool?.distanceKm ?? 999;
  const baseSchoolDed =
    q.schoolDeduction.find((b) => schoolDistKm <= b.maxKm)?.deduction ?? 0;
  const schoolDed = baseSchoolDed;
  if (schoolDed > 0 && nearestSchool) {
    deductions.push({
      label: '학교 근접',
      points: schoolDed,
      evidence: `최근접 학교 ${nearestSchool.item[0]} ${fmtKm(schoolDistKm)} (등록 지점까지 직선거리, 법정 경계거리 아님)`,
      anchor: '금천 독산동: 학교 인접 민원으로 공사 1.5개월 중단',
    });
  }

  const landDed =
    input.landUse === 'unknown' ? 0 : q.landUseDeduction[input.landUse];
  if (landDed > 0) {
    deductions.push({
      label: `용도지역: ${LAND_USE_LABEL[input.landUse]}`,
      points: landDed,
      evidence:
        '용도지역별 내부 참고 기준입니다. 적용 조례와 건축 허용 여부를 별도 확인하세요.',
    });
  }

  // Reclaimed cells are flat by construction; their real risk is soft ground, not slope.
  let terrain: ScoreResult['terrain'] = null;
  if (
    terrainSample &&
    site.eligible &&
    (site.status === 'ok' || site.status === 'coastal')
  ) {
    const slope = slopeDeduction(terrainSample, terrainCfg);
    const projectSlopeDeduction = slope.points;
    terrain = {
      sample: terrainSample,
      deduction: projectSlopeDeduction,
      band: slope.band,
      unsuitable: slope.unsuitable,
    };
    if (projectSlopeDeduction > 0) {
      deductions.push({
        label: '지형·경사',
        points: projectSlopeDeduction,
        evidence:
          (slope.unsuitable
            ? '급경사 구간이 확인되어 토목공사비, 사면 안정성 및 산지전용 인허가 위험이 높으므로 정밀측량 및 관할기관 검토가 필요합니다. '
            : '') +
          `1km 격자 중앙값 경사 ${terrainSample.slopeP50Deg}°, ` +
          `${data.terrain?.steepThresholdDeg ?? 15}° 이상 비율 ${terrainSample.steepPct}%, ` +
          `표고 약 ${terrainSample.elevM}m — ${slope.band} (SRTM 30m·Terrain Tiles)`,
        anchor:
          '산지관리법 시행령 별표4: 산지전용허가 평균경사도 25° 이하 · 화성·성남 개발행위허가 조례 15° 미만',
      });
    }
  } else if (terrainSample && site.status !== 'outside') {
    const slope = slopeDeduction(terrainSample, terrainCfg);
    terrain = {
      sample: terrainSample,
      deduction: 0,
      band: slope.band,
      unsuitable: false,
    };
  }

  const matchedRegulations = emdInfo
    ? data.regulations.filter(
        (r) =>
          r.sido === emdInfo.sido.slice(0, 2) &&
          (r.sigungu === '전체' || r.sigungu === emdInfo.sigungu),
      )
    : [];
  for (const reg of matchedRegulations) {
    deductions.push({
      label: `지자체 규제 (${reg.reg_type})`,
      points: reg.deduction,
      evidence: reg.detail,
    });
  }
  if (
    input.landUse === 'residential' &&
    emdInfo &&
    emdInfo.sido.startsWith('인천') &&
    matchedRegulations.some((r) => r.reg_type === '조례시행')
  ) {
    deductions.push({
      label: '조례상 입지 불가',
      points: q.incheonResidentialExtraDeduction,
      evidence:
        '인천시 도시계획 조례: 일반주거지역 데이터센터 입지 금지 (2024.9 시행)',
    });
  }

  // 법정 보호·규제구역: bundled polygons (국립공원·KDPA) plus the VWorld lookup the caller passed in. Water and
  // coastal cells are checked too, since protected tidal wetlands can overlap those cells,
  // but a point beyond the bundled data is left unknown rather than judged from foreign geometry.
  const rCfg = scoring.restriction;
  const restriction: ScoreResult['restriction'] = coverage.outside
    ? {
        level: 'unknown',
        hits: [],
        scoringHits: [],
        requiresLegalReview: false,
        mapping: rCfg.heritageMapping ?? null,
        fetchedAt: null,
        checked: { bundled: false, vworld: 'none' },
      }
    : lookupRestrictions(
        data.protectedZones,
        input.restrictions,
        lat,
        lng,
        rCfg,
      );
  if (
    restriction.level === 'prohibited' ||
    restriction.level === 'conditional'
  ) {
    // One deduction per site; non-scoring observations are never penalty evidence.
    deductions.push({
      label: RESTRICTION_DEDUCTION_LABEL[restriction.level],
      points:
        restriction.level === 'prohibited'
          ? rCfg.prohibitedDeduction
          : rCfg.conditionalDeduction,
      evidence: describeRestrictionHits(restriction.scoringHits.filter(h => h.level === restriction.level)),
      anchor:
        restriction.level === 'prohibited'
          ? '자연공원법·수도법·개발제한구역법 등 법정 구역은 해제·지정 변경 없이는 신축 불가 — 스크리닝 판정이며 고시 도면 확인 필요'
          : undefined,
    });
  }

  const disasterLookup = coverage.outside ? null : input.disaster;
  const disaster: ScoreResult['disaster'] = {
    status: !disasterLookup ? 'unknown' : disasterLookup.found ? 'hit' : isEvidenceFresh(disasterLookup) ? 'none' : 'unknown',
    complete: !!disasterLookup && isEvidenceFresh(disasterLookup),
    hits: disasterLookup?.hits ?? [],
    deduction: disasterLookup?.found ? scoring.disaster.deduction : 0,
  };
  if (disaster.status === 'hit') {
    deductions.push({
      label: scoring.disaster.label,
      points: disaster.deduction,
      evidence: `${[...new Set(disaster.hits.map((h) => h.name ?? '재해위험지구'))].join(' · ')} — ${scoring.disaster.reviewNote}`,
      anchor: `${scoring.disaster.law} · 감점은 내부 예비 평가 기준`,
    });
  }

  const matchedCases: CaseRow[] = data.cases.filter(
    (c) =>
      (emdInfo &&
        c.sido === emdInfo.sido.slice(0, 2) &&
        emdInfo.sigungu.startsWith(c.sigungu)) ||
      haversineKm(lat, lng, c.lat, c.lng) <= q.caseNearbyKm,
  );
  const newsRow = emdInfo
    ? findNewsRow(data.newsSignal, emdInfo.sido, emdInfo.sigungu)
    : null;
  const newsSignal: ScoreResult['permit']['newsSignal'] = newsRow
    ? {
        row: newsRow,
        areaLabel: newsRow.sigungu === '*' ? newsRow.sido : newsRow.sigungu,
        deduction: 0,
      }
    : null;

  let delayStat: ScoreResult['permit']['delayStat'] = null;
  const permitRow = emdInfo
    ? findPermitRow(
        data.permitDelay,
        emdInfo.sido,
        emdInfo.sigungu,
        q.delayStat.minPermits,
      )
    : null;
  if (permitRow && data.permitDelay) {
    const cfg = q.delayStat;
    const base = data.permitDelay.baseline;
    const enough =
      permitRow.n >= cfg.minPermits && permitRow.medianMonths !== null;
    const ratio =
      permitRow.medianMonths !== null && base.medianMonths
        ? permitRow.medianMonths / base.medianMonths
        : null;
    let points = 0;
    if (enough && ratio !== null) {
      points =
        cfg.relativeBands.find((b) => ratio <= b.maxRatio)?.deduction ?? 0;
      if (
        permitRow.stalled12mShare !== null &&
        base.stalled12mShare !== null &&
        permitRow.eligible12mN >= cfg.minPermits &&
        permitRow.stalled12mShare - base.stalled12mShare >=
          cfg.stalledExtra.minExcessShare
      ) {
        points += cfg.stalledExtra.deduction;
      }
      points = Math.min(points, cfg.cap);
    }
    const areaLabel =
      permitRow.sigungu === '*' ? permitRow.sido : permitRow.sigungu;
    delayStat = {
      row: permitRow,
      areaLabel,
      enough,
      deduction: points,
      baselineMedianMonths: base.medianMonths,
      baselineStalledShare: base.stalled12mShare,
      ratio,
    };
    if (points > 0 && ratio !== null) {
      const w = data.permitDelay.window;
      const stalledTxt =
        permitRow.stalled12mShare !== null
          ? `, 12개월 이상 미착공 ${Math.round(permitRow.stalled12mShare * 100)}%` +
            (base.stalled12mShare !== null
              ? `(전체 ${Math.round(base.stalled12mShare * 100)}%)`
              : '')
          : '';
      deductions.push({
        label: '허가→착공 지연 통계',
        points,
        evidence:
          `${areaLabel} 대형 신축(연면적 ${data.permitDelay.sample.minTotAreaM2.toLocaleString()}㎡↑) 허가 ${permitRow.n}건` +
          `(${w.from.slice(0, 4)}~${w.to.slice(0, 4)}): 허가→착공 중앙값 ${permitRow.medianMonths}개월` +
          ` = 조사 시군구 전체 ${base.medianMonths}개월의 ${ratio.toFixed(1)}배${stalledTxt}`,
        anchor: '국토부: 수도권 건축허가 DC 33곳 중 17곳(51.5%) 지연·차질',
      });
    }
  }

  const permitScore = Math.max(
    0,
    Math.round(100 - deductions.reduce((s, d) => s + d.points, 0)),
  );

  const comp = scoring.composite;
  const compositeScore = Math.round(
    comp.weightPower * powerScore + comp.weightPermit * permitScore,
  );
  let grade = comp.grades.find((g) => compositeScore >= g.min)?.grade ?? 'E';
  let gradeCapped = false;
  let capReason: CapReason | null = null;
  // Caps from mildest to strictest; grades[] is ordered best→worst, so a larger index is a lower grade.
  // capReason names the strictest cap in force even when the score already sat at or below it.
  const caps: { grade: string; reason: CapReason }[] = [];

  if (restriction.level === 'prohibited') {
    caps.push({ grade: comp.restrictionGradeCap, reason: 'restriction' });
  }
  for (const cap of caps) {
    const capIdx = comp.grades.findIndex((g) => g.grade === cap.grade);
    const curIdx = comp.grades.findIndex((g) => g.grade === grade);
    if (curIdx < capIdx) {
      grade = cap.grade;
      gradeCapped = true;
    }
    capReason = cap.reason;
  }

  const popCells = data.popGrid.filter(
    (g) => haversineKm(lat, lng, g[0], g[1]) <= q.popRadiusKm,
  );
  const householdCells = (data.households?.rows ?? []).filter(
    (g) => haversineKm(lat, lng, g[0], g[1]) <= q.popRadiusKm,
  );
  const knownHouseholds = householdCells.filter(
    (g) => g[2] !== null && Number.isFinite(g[2]) && g[2]! >= 0,
  );
  const householdsNearby = knownHouseholds.length
    ? knownHouseholds.reduce((sum, g) => sum + g[2]!, 0)
    : null;
  const householdMissingCells = householdCells.length - knownHouseholds.length;
  const powerKnown =
    site.eligible &&
    !emdUncertain &&
    !!emdPower &&
    subCount > 0 &&
    !!nearestSub;
  // Legacy offline scenarios omit provenance; live reviews always distinguish manual assumptions.
  const zoningKnown = input.landUse !== 'unknown' &&
    (input.zoning ? isEvidenceFresh(input.zoning) : input.landUseSource === undefined) &&
    (input.landUseSource !== 'auto' || input.zoning?.complete === true);
  const permitKnown =
    site.eligible &&
    !emdUncertain &&
    zoningKnown &&
    popCells.length > 0 &&
    !!nearestSchool &&
    !!terrainSample &&
    restriction.checked.bundled &&
    restriction.checked.vworld === 'ok' &&
    !restriction.requiresLegalReview &&
    disaster.status !== 'unknown' && disaster.complete !== false;
  const evidence = Object.entries(scoring.evidence).map(([key, meta]) => {
    const availability: Record<string, boolean> = {
      power: powerKnown,
      substations: !!nearestSub,
      population: popCells.length > 0,
      households: householdsNearby !== null,
      schools: !!nearestSchool,
      zoning: zoningKnown,
      restrictions:
        restriction.checked.bundled && restriction.checked.vworld === 'ok' && !restriction.requiresLegalReview,
      disaster: disaster.status !== 'unknown' && disaster.complete !== false,
      terrain: !!terrainSample,
      news: !!newsSignal,
      permits: !!delayStat?.enough,
    };
    const titles: Record<string, string> = {
      power: '한전 공개 목록',
      substations: '변전소 참고 위치',
      population: '주변 인구',
      households: '주변 가구',
      schools: '학교 거리',
      zoning: '용도지역',
      restrictions: '보호·규제구역',
      disaster: '재해위험지구',
      terrain: '지형',
      news: '뉴스 참고 자료',
      permits: '허가→착공 참고 통계',
    };
    const partial =
      (key === 'households' &&
        householdMissingCells > 0 &&
        householdsNearby !== null) ||
      (key === 'zoning' && !zoningKnown && !!input.zoning?.found) ||
      (key === 'disaster' && disaster.complete === false && disaster.hits.length > 0) ||
      (key === 'restrictions' &&
        !availability[key] &&
        (restriction.checked.bundled || restriction.hits.length > 0)) ||
      (key === 'permits' && !!delayStat && !delayStat.enough);
    const file =
      key === 'news'
        ? data.newsSignal
        : key === 'permits'
          ? data.permitDelay
          : null;
    const period = file
      ? `${file.window.from}~${file.window.to} · 수집 ${file.fetchedAt}`
      : meta.period;
    const dataVersion =
      key === 'households' && data.households
        ? `${data.households.version}/${data.households.pipelineVersion ?? 'unknown'}/${data.households.sourceSha256 ?? 'unknown'}`
        : undefined;
    return {
      ...meta,
      period,
      dataVersion,
      key,
      title: titles[key] ?? key,
      status: !site.eligible
        ? ('unknown' as const)
        : partial
          ? ('partial' as const)
          : availability[key]
            ? ('available' as const)
            : ('unknown' as const),
    };
  });
  const area = evaluateArea(project, conditions);
  const businessCost = evaluateBusinessCost(conditions);
  const finance = evaluateFinance(project, conditions);
  const hasCostInputs = conditions.costMode === 'total'
    ? conditions.totalCostKrw !== null
    : Object.values(conditions.costs).some(value => value !== null);
  const issues: ReviewIssue[] = [];
  const overviewIssues: ReviewIssue[] = [];
  const add = (
    title: string,
    detail: string,
    tone: ReviewIssue['tone'] = 'caution',
    showInOverview = true,
  ) => {
    const issue = { title, detail, tone };
    issues.push(issue);
    if (showInOverview) overviewIssues.push(issue);
  };
  if (!site.eligible)
    add(site.label, site.detail, site.status === 'sea' ? 'risk' : 'caution');
  if (restriction.level === 'prohibited')
    add(
      '법적 입지 제한 구역',
      describeRestrictionHits(restriction.scoringHits.filter(h => h.level === 'prohibited')) +
        ' · 고시 도면·토지이용계획확인서 확인 필요',
      'risk',
    );
  else if (restriction.level === 'conditional')
    add('규제구역 검토 필요', describeRestrictionHits(restriction.scoringHits));
  if (restriction.requiresLegalReview)
    add('국가유산 관련 확인 필요',
      '국가유산 관련 법적 적용 확인 필요 · 인허가·종합 참고점수 미산정. ' +
      describeRestrictionHits(restriction.hits.filter(h => h.level === 'review')));
  if (restriction.hits.some(h => h.level === 'reference'))
    add('국가유산 주변 조회 · 참고', describeRestrictionHits(restriction.hits.filter(h => h.level === 'reference')));
  if (deductions.some((d) => d.label === '조례상 입지 불가'))
    add(
      '조례상 입지 제한 검토',
      '사용자 선택 또는 조회된 용도지역과 적용 조례를 관할기관에 확인하세요.',
      'risk',
    );
  if (terrain?.unsuitable)
    add('급경사 정밀 검토', '정밀측량·사면 안정성과 토목공사비를 확인하세요.');
  if (disaster.status === 'hit')
    add('재해위험지구 검토 필요', scoring.disaster.reviewNote);
  if (area.status === 'shortfall')
    add(
      area.label,
      `${area.shortfallM2!.toLocaleString()}㎡ 부족 · 입력 조건을 재검토하세요.`,
    );
  if (area.status === 'unknown')
    add('면적 계산 보류', area.missing.join(' · '), 'caution', area.hasInputs);
  if (!positive(project.targetMw))
    add('목표 수전용량 미입력', '목표 수전용량은 양수로 입력하고 실제 공급 가능량은 공급기관과 확인하세요.', 'caution', project.targetMw !== null);
  const missingSources = evidence.filter(
    (e) => e.status !== 'available' && e.key !== 'news' && e.key !== 'permits',
  );
  if (missingSources.length)
    add('공개자료 추가 확인', missingSources.map((e) => e.title).join(' · '));
  if (
    positive(project.targetMw) &&
    positive(project.itMw) &&
    project.itMw! > project.targetMw!
  )
    add('전력 입력조건 재검토', 'IT부하가 목표 수전용량보다 큽니다.');
  for (const [key, label] of Object.entries(CONSULTATION_LABELS)) {
    const c =
      conditions.consultations[key as keyof typeof conditions.consultations];
    const started = c.status !== 'unknown' || !!c.note.trim() || !!c.date;
    if (c.status !== 'confirmed' || !c.note.trim() || !validDate(c.date))
      add(
        `${label} 공급조건 확인`,
        `${label} 협의 내용과 확인일을 기록하세요. 사용자 확인은 공급기관의 확약을 대체하지 않습니다.`,
        'caution', started,
      );
  }
  if (!businessCost.complete)
    add('사업비 범위 확인', businessCost.missing.join(' · '), 'caution', hasCostInputs);
  if (finance.missing.length)
    add('금융비용 계산 보류', finance.missing.join(' · '), 'caution', conditions.averageDebtKrw !== null || finance.missing.some(item => item !== '지연 중 평균 차입잔액'));
  const summarize = (items: ReviewIssue[]): ScoreResult['review']['overview'] => {
    const risk = items.some(i => i.tone === 'risk');
    return {
      label: !site.eligible ? site.label : risk ? '중대 제약 확인'
        : area.status === 'shortfall' ? '입력 조건 재검토'
        : items.length ? '추가 확인 필요'
        : !area.hasInputs ? '상세조건 입력 전' : '후속 실사 검토',
      tone: risk ? 'risk' : items.length || !area.hasInputs ? 'caution' : 'good',
      reason: items[0]?.detail ?? (!area.hasInputs
        ? '공개자료를 먼저 확인하세요. 면적·비용·공급조건의 미확인은 전체 확인사항과 보고서에 남아 있습니다.'
        : '입력 조건의 단순 검토를 마쳤습니다. 실제 공급·설계·인허가는 후속 실사에서 확인하세요.'),
      issues: items,
    };
  };
  const review: ScoreResult['review'] = {
    ...summarize(issues),
    overview: summarize(overviewIssues),
    actions: [
      ...issues.map((i) => `${i.title}: ${i.detail}`),
      project.development === 'conversion'
        ? '기존 건물의 구조하중·층고·장비 반입·냉각설비 설치 가능성을 설계 담당자에게 확인하세요.'
        : '옥외설비·이격거리·주차·높이 제한과 실제 배치 가능성을 설계 담당자에게 확인하세요.',
      '실제 전력·통신 인입 경로, 도로점용과 주거지 통과 영향을 확인하세요.',
    ],
  };

  return {
    disaster,
    project: {
      type: project.type,
      profile: projectProfile,
      assumptions: project,
    },
    conditions,
    area,
    businessCost,
    finance,
    evidence,
    review,
    emd: emdInfo,
    emdUncertain,
    gate: {
      pass: gatePass,
      substationCount: subCount,
      substations: emdPower?.subs ?? [],
    },
    power: {
      score: powerKnown ? powerScore : null,
      supplyScore,
      regionScore,
      distanceScore,
      nearestSubstation: nearestSub
        ? {
            name: nearestSub.item.name || '(무명 변전소)',
            distanceKm: nearestSub.distanceKm,
          }
        : null,
      listedCount: emdPower ? subCount : null,
    },
    permit: {
      score: permitKnown ? permitScore : null,
      deductions,
      popNearby: popCells.length ? popNearby : null,
      householdsNearby,
      householdMissingCells,
      nearestSchool: nearestSchool
        ? { name: nearestSchool.item[0], distanceKm: nearestSchool.distanceKm }
        : null,
      matchedCases,
      matchedRegulations,
      delayStat,
      newsSignal,
    },
    site,
    terrain,
    restriction,
    composite: {
      score: powerKnown && permitKnown ? compositeScore : null,
      grade:
        restriction.level === 'prohibited'
          ? comp.restrictionGradeCap
          : powerKnown && permitKnown
            ? grade
            : null,
      gradeCapped,
      capReason,
      breakdown: {
        power: {
          score: powerKnown ? powerScore : null,
          weight: comp.weightPower,
          weightedPoints: powerKnown
            ? Math.round(powerScore * comp.weightPower * 100) / 100
            : null,
        },
        permit: {
          score: permitKnown ? permitScore : null,
          weight: comp.weightPermit,
          weightedPoints: permitKnown
            ? Math.round(permitScore * comp.weightPermit * 100) / 100
            : null,
        },
      },
    },
  };
}

function positive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}
function nonnegative(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function evaluateArea(
  p: ProjectAssumptions,
  c: SiteConditions,
): ScoreResult['area'] {
  const missing: string[] = [];
  let racks: number | null = null;
  let requiredAreaM2: number | null = null;
  if (p.areaMethod === 'racks') {
    for (const [label, val] of [
      ['IT부하', p.itMw],
      ['랙당 전력', p.rackKw],
      ['통로 포함 랙당 면적', p.rackAreaM2],
      ['전산실 면적 비중', p.whiteSpacePct],
    ] as const) {
      if (!positive(val)) missing.push(label);
    }
    if (positive(p.whiteSpacePct) && p.whiteSpacePct > 100)
      missing.push('전산실 면적 비중은 100% 이하');
    if (!missing.length) {
      racks = Math.ceil((p.itMw! * 1000) / p.rackKw!);
      requiredAreaM2 = (racks * p.rackAreaM2!) / (p.whiteSpacePct! / 100);
    }
  } else if (positive(c.plannedAreaM2)) requiredAreaM2 = c.plannedAreaM2;
  else missing.push('계획 연면적');
  let minimumLandM2: number | null = null;
  let shortfallM2: number | null = null;
  if (p.development === 'conversion') {
    if (!positive(c.existingAreaM2)) missing.push('기존 건물의 확보 면적');
    if (!missing.length && requiredAreaM2 !== null)
      shortfallM2 = Math.max(0, requiredAreaM2 - c.existingAreaM2!);
  } else {
    for (const [label, val] of [
      ['대지면적', c.landAreaM2],
      ['적용 용적률', c.farPct],
      ['건폐율', c.coveragePct],
      ['지상층수', c.floors],
    ] as const)
      if (!positive(val)) missing.push(label);
    if (positive(c.coveragePct) && c.coveragePct > 100)
      missing.push('건폐율은 100% 이하');
    if (positive(c.floors) && !Number.isInteger(c.floors))
      missing.push('지상층수는 정수');
    if (
      requiredAreaM2 !== null &&
      positive(c.farPct) &&
      positive(c.coveragePct) &&
      c.coveragePct <= 100 &&
      positive(c.floors) &&
      Number.isInteger(c.floors)
    ) {
      minimumLandM2 = Math.max(
        requiredAreaM2 / (c.farPct / 100),
        requiredAreaM2 / c.floors / (c.coveragePct / 100),
      );
      if (positive(c.landAreaM2))
        shortfallM2 = Math.max(0, minimumLandM2 - c.landAreaM2);
    }
  }
  if (
    (requiredAreaM2 !== null && !Number.isFinite(requiredAreaM2)) ||
    (minimumLandM2 !== null && !Number.isFinite(minimumLandM2))
  ) {
    missing.push('면적 계산 범위 초과');
    requiredAreaM2 = minimumLandM2 = shortfallM2 = racks = null;
  }
  const status =
    missing.length || shortfallM2 === null
      ? 'unknown'
      : shortfallM2 > 0
        ? 'shortfall'
        : 'fits';
  const hasInputs = [
    ...(p.areaMethod === 'racks' ? [p.itMw, p.rackKw, p.rackAreaM2, p.whiteSpacePct] : [c.plannedAreaM2]),
    ...(p.development === 'conversion' ? [c.existingAreaM2] : [c.landAreaM2, c.farPct, c.coveragePct, c.floors]),
  ].some(value => value !== null);
  const available = p.development === 'conversion' ? c.existingAreaM2 : c.landAreaM2;
  const required = p.development === 'conversion' ? requiredAreaM2 : minimumLandM2;
  const ratio = status !== 'unknown' && positive(available) && positive(required)
    ? Math.round(available / required * 100) : null;
  const fitPct = ratio !== null && Number.isFinite(ratio) ? ratio : null;
  return {
    hasInputs,
    fitPct,
    status,
    label:
      status === 'unknown'
        ? '계산 보류'
        : status === 'shortfall'
          ? '입력 조건상 면적 부족'
          : '단순 면적조건 충족',
    requiredAreaM2,
    racks,
    minimumLandM2,
    shortfallM2,
    missing,
    note:
      p.development === 'conversion'
        ? '확보 면적과 필요 면적의 단순 비교입니다. 구조하중·층고·장비 반입·냉각설비를 별도 검토하세요.'
        : '전 면적 지상·용적률 산입, 층별 동일 면적 가정입니다. 옥외설비·이격거리·주차·높이 제한은 별도 검토이며 건축 가능 면적의 확정값이 아닙니다.',
  };
}

function evaluateBusinessCost(c: SiteConditions): ScoreResult['businessCost'] {
  if (c.costMode === 'total') {
    const valid = nonnegative(c.totalCostKrw);
    return {
      mode: c.costMode,
      amountKrw: valid ? c.totalCostKrw : null,
      complete: valid,
      label: '직접 입력한 총사업비',
      missing: valid ? [] : ['총사업비'],
      comparisonKey: valid ? 'total-excluding-finance-v1' : null,
    };
  }
  const keys = Object.keys(COST_LABELS) as CostItem[];
  const missing = keys
    .filter((k) => !nonnegative(c.costs[k]))
    .map((k) => COST_LABELS[k]);
  const known = keys.filter((k) => nonnegative(c.costs[k]));
  const amount = known.reduce((sum, k) => sum + c.costs[k]!, 0);
  const valid = Number.isFinite(amount);
  if (!valid) missing.push('합계 계산 범위 초과');
  const complete = missing.length === 0;
  return {
    mode: c.costMode,
    amountKrw: known.length && valid ? amount : null,
    complete,
    label: complete ? '사업비 항목 합계' : '입력된 비용 합계',
    missing,
    comparisonKey: complete ? 'items-excluding-finance-v1' : null,
  };
}

function evaluateFinance(
  p: ProjectAssumptions,
  c: SiteConditions,
): ScoreResult['finance'] {
  const debtKrw = nonnegative(c.averageDebtKrw) ? c.averageDebtKrw : null;
  const missing: string[] = debtKrw === null ? ['지연 중 평균 차입잔액'] : [];
  if (!p.rates.every(nonnegative)) missing.push('금리 가정');
  if (!p.delays.every(nonnegative)) missing.push('지연기간 가정');
  const cells = p.rates.flatMap((annualRate) =>
    p.delays.map((months) => {
      const cost =
        debtKrw !== null && nonnegative(annualRate) && nonnegative(months)
          ? (debtKrw * annualRate * months) / 12
          : null;
      if (
        cost !== null &&
        !Number.isFinite(cost) &&
        !missing.includes('금융비용 계산 범위 초과')
      )
        missing.push('금융비용 계산 범위 초과');
      return {
        annualRate,
        months,
        costKrw: cost !== null && Number.isFinite(cost) ? cost : null,
      };
    }),
  );
  return { debtKrw, missing, cells };
}
