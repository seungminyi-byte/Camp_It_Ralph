import type {
  AppData,
  CapReason,
  CaseRow,
  ConflictLevel,
  Deduction,
  LandUse,
  TerrainSample,
  NewsSignalFile,
  NewsSignalRow,
  PermitDelayFile,
  PermitDelayRow,
  ScoreInput,
  ScoreResult,
} from '../types';
import { haversineKm, nearest, sumWithinKm } from './geo';
import { classifySite, findReclaimedOverride, lookupTerrain, slopeDeduction } from './terrain';
import { classifyCoverage } from './coverage';
import { RESTRICTION_DEDUCTION_LABEL, describeRestrictionHits, lookupRestrictions } from './restriction';

export const LAND_USE_LABEL: Record<LandUse, string> = {
  industrial: '공업지역',
  semiIndustrial: '준공업지역',
  commercial: '상업지역',
  green: '녹지·관리지역',
  residential: '주거지역',
  unknown: '미확인',
};

export const CONFLICT_LEVEL_LABEL: Record<ConflictLevel, string> = {
  low: '낮음',
  medium: '주의',
  high: '높음',
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
  return candidates.find((r) => r.n >= minPermits && r.medianMonths !== null) ?? candidates[0] ?? null;
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
  const { lat, lng } = input;

  const emdMatch = nearest(lat, lng, data.emdCentroids, (c) => [c.lat, c.lng]);
  const emdUncertain =
    emdMatch === null || emdMatch.distanceKm > scoring.power.emdMatchUncertainKm;
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
  const reclaimed = findReclaimedOverride(terrainCfg.reclaimedOverrides, lat, lng);
  const site: ScoreResult['site'] = coverage.outside
    ? { status: 'outside', label: '판독 불가', detail: coverage.detail, override: null }
    : classifySite(terrainSample, reclaimed, terrainCfg, {
        zoningFound: input.zoning ? input.zoning.found : null,
        assumeLand: input.assumeLand ?? false,
      });

  let emdPower = emdInfo
    ? data.emdPower.find(
        (p) =>
          p.sido === emdInfo.sido && p.sigungu === emdInfo.sigungu && p.emd === emdInfo.emd,
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
    p.weightSupply * supplyScore + p.weightRegion * regionScore + p.weightDistance * distanceScore;
  if (!gatePass) powerScore = Math.min(powerScore, p.gateFailCap);
  powerScore = Math.round(powerScore);

  const capacityBand = !gatePass
    ? p.capacityBands[3].label
    : subCount >= 2 && subDistKm <= 5
      ? p.capacityBands[0].label
      : subCount >= 1 && subDistKm <= 10
        ? p.capacityBands[1].label
        : p.capacityBands[2].label;

  const q = scoring.permit;
  const deductions: Deduction[] = [];

  const popNearby = Math.round(
    sumWithinKm(lat, lng, data.popGrid, (g) => [g[0], g[1]], q.popRadiusKm, (g) => g[2]),
  );
  const popDed = q.populationDeduction.find((b) => popNearby <= b.maxPop)?.deduction ?? 0;
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
  const schoolDed = q.schoolDeduction.find((b) => schoolDistKm <= b.maxKm)?.deduction ?? 0;
  if (schoolDed > 0 && nearestSchool) {
    deductions.push({
      label: '학교 근접',
      points: schoolDed,
      evidence: `최근접 학교 ${nearestSchool.item[0]} ${fmtKm(schoolDistKm)} (교육환경보호구역 200m)`,
      anchor: '금천 독산동: 학교 인접 민원으로 공사 1.5개월 중단',
    });
  }

  const landDed = q.landUseDeduction[input.landUse];
  if (landDed > 0) {
    deductions.push({
      label: `용도지역: ${LAND_USE_LABEL[input.landUse]}`,
      points: landDed,
      evidence:
        input.landUse === 'unknown'
          ? '용도지역 미확인 (지도의 용도지역 표시 또는 토지이음에서 확인 필요)'
          : '데이터센터는 공업·준공업 입지가 인허가 마찰 최소',
    });
  }

  // Reclaimed cells are flat by construction; their real risk is soft ground, not slope.
  let terrain: ScoreResult['terrain'] = null;
  if (terrainSample && (site.status === 'ok' || site.status === 'coastal')) {
    const slope = slopeDeduction(terrainSample, terrainCfg);
    terrain = {
      sample: terrainSample,
      deduction: slope.points,
      band: slope.band,
      unsuitable: slope.unsuitable,
    };
    if (slope.points > 0) {
      deductions.push({
        label: '지형·경사',
        points: slope.points,
        evidence:
          `1km 격자 중앙값 경사 ${terrainSample.slopeP50Deg}°, ` +
          `${data.terrain?.steepThresholdDeg ?? 15}° 이상 비율 ${terrainSample.steepPct}%, ` +
          `표고 약 ${terrainSample.elevM}m — ${slope.band} (SRTM 30m·Terrain Tiles)`,
        anchor:
          '산지관리법 시행령 별표4: 산지전용허가 평균경사도 25° 이하 · 화성·성남 개발행위허가 조례 15° 미만',
      });
    }
  } else if (terrainSample && site.status !== 'outside') {
    const slope = slopeDeduction(terrainSample, terrainCfg);
    terrain = { sample: terrainSample, deduction: 0, band: slope.band, unsuitable: false };
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
      evidence: '인천시 도시계획 조례: 일반주거지역 데이터센터 입지 금지 (2024.9 시행)',
    });
  }

  // 법정 보호·규제구역: bundled polygons (국립공원·KDPA) plus the VWorld lookup the caller passed in. Water and
  // coastal cells are checked too — a 갯벌 습지보호지역 is exactly what a "매립 예정지로 간주" click should hit —
  // but a point beyond the bundled data is left unknown rather than judged from foreign geometry.
  const rCfg = scoring.restriction;
  const restriction: ScoreResult['restriction'] = coverage.outside
    ? { level: 'unknown', hits: [], checked: { bundled: false, vworld: 'none' } }
    : lookupRestrictions(data.protectedZones, input.restrictions, lat, lng, rCfg);
  if (restriction.level === 'prohibited' || restriction.level === 'conditional') {
    // One deduction per site at the highest level; the evidence still lists every hit.
    deductions.push({
      label: RESTRICTION_DEDUCTION_LABEL[restriction.level],
      points:
        restriction.level === 'prohibited' ? rCfg.prohibitedDeduction : rCfg.conditionalDeduction,
      evidence: describeRestrictionHits(restriction.hits),
      anchor:
        restriction.level === 'prohibited'
          ? '자연공원법·수도법·개발제한구역법 등 법정 구역은 해제·지정 변경 없이는 신축 불가 — 스크리닝 판정이며 고시 도면 확인 필요'
          : undefined,
    });
  }

  const matchedCases: CaseRow[] = [];
  let caseDedSum = 0;
  if (emdInfo) {
    for (const c of data.cases) {
      const sameSigungu =
        c.sido === emdInfo.sido.slice(0, 2) && emdInfo.sigungu.startsWith(c.sigungu.slice(0, 2));
      if (sameSigungu) {
        matchedCases.push(c);
        caseDedSum += q.caseDeduction[c.status] ?? 0;
      }
    }
  }
  caseDedSum = Math.min(caseDedSum, q.caseSameSigunguCap);
  if (caseDedSum > 0) {
    deductions.push({
      label: '동일 시군구 갈등 사례',
      points: caseDedSum,
      evidence: matchedCases.map((c) => `${c.name}(${c.status})`).join(', '),
    });
  }
  const nearbyCase = data.cases.find(
    (c) =>
      !matchedCases.includes(c) && haversineKm(lat, lng, c.lat, c.lng) <= q.caseNearbyKm,
  );
  if (nearbyCase) {
    matchedCases.push(nearbyCase);
    deductions.push({
      label: '인근 갈등 사례',
      points: q.caseNearbyDeduction,
      evidence: `${fmtKm(haversineKm(lat, lng, nearbyCase.lat, nearbyCase.lng))} 거리 ${nearbyCase.name}(${nearbyCase.status})`,
    });
  }

  let newsSignal: ScoreResult['permit']['newsSignal'] = null;
  const newsRow = emdInfo ? findNewsRow(data.newsSignal, emdInfo.sido, emdInfo.sigungu) : null;
  if (newsRow && data.newsSignal) {
    const count = newsRow.conflictArticles;
    const band = q.newsDeduction.find((b) => count <= b.maxCount)?.deduction ?? 0;
    const levelWeight = q.newsLevelWeight[newsRow.level] ?? 1;
    const points = Math.round(band * levelWeight);
    const areaLabel = newsRow.sigungu === '*' ? newsRow.sido : newsRow.sigungu;
    newsSignal = { row: newsRow, areaLabel, deduction: points };
    if (points > 0) {
      const w = data.newsSignal.window;
      const head = newsRow.top[0];
      deductions.push({
        label: '뉴스 갈등 보도',
        points,
        evidence:
          `${areaLabel} 데이터센터 반대·갈등 기사 ${count}건` +
          `(전체 ${newsRow.articles}건, 최근 ${w.months}개월 ${w.from}~${w.to}, 네이버 뉴스 검색)` +
          (levelWeight < 1
            ? ` · ${areaLabel} 전체 단위 검색이라 부지 특정성을 감안해 ${Math.round(levelWeight * 100)}%만 반영`
            : '') +
          (head ? ` · 대표 기사: "${head.title}" (${head.date})` : ''),
        anchor: '안양 호계동: 주민 반대 여론 속 2년 정체 끝에 사업 무산',
      });
    }
  }

  // Named roll-up of the three conflict signals already deducted above; the score is unchanged.
  const nearbyPoints = nearbyCase ? q.caseNearbyDeduction : 0;
  const newsPoints = newsSignal?.deduction ?? 0;
  const conflictPoints = caseDedSum + nearbyPoints + newsPoints;
  const conflictLevel: ConflictLevel =
    conflictPoints >= q.conflictRisk.highMin
      ? 'high'
      : conflictPoints >= q.conflictRisk.mediumMin
        ? 'medium'
        : 'low';

  let delayStat: ScoreResult['permit']['delayStat'] = null;
  const permitRow = emdInfo
    ? findPermitRow(data.permitDelay, emdInfo.sido, emdInfo.sigungu, q.delayStat.minPermits)
    : null;
  if (permitRow && data.permitDelay) {
    const cfg = q.delayStat;
    const base = data.permitDelay.baseline;
    const enough = permitRow.n >= cfg.minPermits && permitRow.medianMonths !== null;
    const ratio =
      permitRow.medianMonths !== null && base.medianMonths
        ? permitRow.medianMonths / base.medianMonths
        : null;
    let points = 0;
    if (enough && ratio !== null) {
      points = cfg.relativeBands.find((b) => ratio <= b.maxRatio)?.deduction ?? 0;
      if (
        permitRow.stalled12mShare !== null &&
        base.stalled12mShare !== null &&
        permitRow.eligible12mN >= cfg.minPermits &&
        permitRow.stalled12mShare - base.stalled12mShare >= cfg.stalledExtra.minExcessShare
      ) {
        points += cfg.stalledExtra.deduction;
      }
      points = Math.min(points, cfg.cap);
    }
    const areaLabel = permitRow.sigungu === '*' ? permitRow.sido : permitRow.sigungu;
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
            (base.stalled12mShare !== null ? `(전체 ${Math.round(base.stalled12mShare * 100)}%)` : '')
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
  if (!gatePass) caps.push({ grade: comp.gateFailGradeCap, reason: 'gate' });
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

  const permitGrade =
    comp.grades.find((g) => permitScore >= g.min)?.grade ?? 'E';
  const delay = scoring.delayByPermitGrade[permitGrade];

  const monthlyCostKrw = (input.capexKrw * input.annualRate) / 12;
  const delayCostKrw = monthlyCostKrw * delay.point;

  return {
    emd: emdInfo,
    emdUncertain,
    gate: { pass: gatePass, substationCount: subCount, substations: emdPower?.subs ?? [] },
    power: {
      score: powerScore,
      supplyScore,
      regionScore,
      distanceScore,
      nearestSubstation: nearestSub
        ? { name: nearestSub.item.name || '(무명 변전소)', distanceKm: nearestSub.distanceKm }
        : null,
      capacityBand,
    },
    permit: {
      score: permitScore,
      deductions,
      popNearby,
      nearestSchool: nearestSchool
        ? { name: nearestSchool.item[0], distanceKm: nearestSchool.distanceKm }
        : null,
      matchedCases,
      matchedRegulations,
      delayStat,
      newsSignal,
      conflictRisk: {
        level: conflictLevel,
        points: conflictPoints,
        casePoints: caseDedSum,
        nearbyPoints,
        newsPoints,
      },
    },
    site,
    terrain,
    restriction,
    composite: { score: compositeScore, grade, gradeCapped, capReason },
    delay: {
      minMonths: delay.minMonths,
      maxMonths: delay.maxMonths,
      pointMonths: delay.point,
      anchor: delay.anchor,
    },
    finance: { delayCostKrw, monthlyCostKrw },
  };
}
