export interface EmdPower {
  sido: string;
  sigungu: string;
  emd: string;
  subs: string[];
  count: number;
}

export interface EmdCentroid {
  sido: string;
  sigungu: string;
  emd: string;
  lat: number;
  lng: number;
  n: number;
  src?: string;
}

export interface Substation {
  name: string;
  lat: number;
  lng: number;
  voltage: string;
  operator: string;
}

export type SchoolRow = [name: string, level: string, lat: number, lng: number];
export type PopGridRow = [lat: number, lng: number, pop: number];

export interface CaseRow {
  id: string;
  name: string;
  sido: string;
  sigungu: string;
  lat: number;
  lng: number;
  cause: string;
  delay_months: number;
  delay_estimated: string;
  status: CaseStatus;
  source_url: string;
  summary: string;
}

export type CaseStatus = '무산' | '중단후재개' | '지연후준공' | '진행중분쟁' | '대응중';

/** Banded sum of the conflict-related permit deductions (cases + nearby case + news). */
export type ConflictLevel = 'low' | 'medium' | 'high';

export interface RegulationRow {
  sido: string;
  sigungu: string;
  reg_type: string;
  detail: string;
  deduction: number;
  effective: string;
  source_url: string;
}

export interface DcStat {
  region: string;
  customers: number;
  contractMw: number;
}

export interface Scenario {
  id: string;
  name: string;
  lat: number;
  lng: number;
  landUse: LandUse;
  expectedGrade: string[];
  story: string;
}

/** How the user picked the current point; shown on the report header. */
export type SiteSource = 'map' | 'emd' | 'geocode' | 'coords';

export interface SiteSelection {
  lat: number;
  lng: number;
  label?: string;
  source: SiteSource;
}

/** Whether `ScoreInput.landUse` came from the VWorld lookup or from the dropdown. */
export type LandUseSource = 'unknown' | 'auto' | 'manual';

export type LandUse =
  | 'industrial'
  | 'semiIndustrial'
  | 'commercial'
  | 'green'
  | 'residential'
  | 'unknown';

export type ProjectType = 'small' | 'standard' | 'hyperscale';

export interface ProjectProfile {
  label: string;
  description: string;
  targetMw: number;
  minSubstations: number;
  maxSubstationKm: number;
  powerDeductionCap: number;
  populationSchoolMultiplier: number;
  slopeMultiplier: number;
}

export interface PermitDelayStat {
  n: number;
  started: number;
  medianMonths: number | null;
  p75Months: number | null;
  stalled12mN: number;
  eligible12mN: number;
  stalled12mShare: number | null;
  topPurposes: { purpose: string; n: number }[];
}

export interface PermitDelayRow extends PermitDelayStat {
  sido: string;
  /** sigungu as written in emd_power/emd_centroids; '*' = whole sido */
  sigungu: string;
  level: 'sigungu' | 'city';
  codes: string[];
}

export interface PermitDelayFile {
  source: string;
  fetchedAt: string;
  window: { from: string; to: string };
  sample: { archGb: string; minTotAreaM2: number; stallMonths: number };
  baseline: PermitDelayStat;
  rows: PermitDelayRow[];
}

export interface NewsArticle {
  title: string;
  link: string;
  /** YYYY-MM-DD (KST) */
  date: string;
}

export interface NewsSignalRow {
  sido: string;
  /** sigungu as written in emd_power/emd_centroids; '*' = whole sido */
  sigungu: string;
  level: 'sigungu' | 'city' | 'sido';
  /** 네이버 검색어 앞부분 (예: '고양') */
  query: string;
  articles: number;
  conflictArticles: number;
  top: NewsArticle[];
}

export interface NewsSignalFile {
  source: string;
  fetchedAt: string;
  window: { months: number; from: string; to: string };
  queries: string[];
  conflictKeywords: string[];
  note: string;
  baseline: {
    areas: number;
    articles: number;
    conflictArticles: number;
    medianConflict: number;
    maxConflict: number;
  };
  rows: NewsSignalRow[];
}

/** Raw terrain_grid.json as served; planes are base64 uint8, 255 = nodata. */
export interface TerrainGridFile {
  source: string;
  sourceUrl?: string;
  attribution: string;
  fetchedAt: string;
  method: { sampleArcsec: number; slope: string; samplesPerCell: number; steepThresholdDeg: number };
  grid: {
    lat0: number;
    lng0: number;
    step: number;
    rows: number;
    cols: number;
    origin: 'sw';
    order?: string;
  };
  encoding: { type: 'base64-uint8'; nodata: number };
  planes: { landPct: string; slopeP50Deg: string; steepPct: string; elevMean10m: string };
  tiles?: { requested: number; loaded: number; missing: string[] };
  stats?: Record<string, number>;
}

/** Decoded once in useAppData; scoreSite runs on every slider move. */
export interface TerrainGrid {
  lat0: number;
  lng0: number;
  step: number;
  rows: number;
  cols: number;
  nodata: number;
  steepThresholdDeg: number;
  source: string;
  attribution: string;
  landPct: Uint8Array;
  slopeP50Deg: Uint8Array;
  steepPct: Uint8Array;
  elevMean10m: Uint8Array;
}

export interface TerrainSample {
  /** share of 30m samples in the 1km cell above sea level, 0~100 */
  landPct: number;
  /** median slope of the cell in degrees */
  slopeP50Deg: number;
  /** share of samples at or above the steep threshold (15 deg), 0~100 */
  steepPct: number;
  elevM: number;
  row: number;
  col: number;
}

/** 'outside' = beyond the bundled South Korean data (north of the MDL, Japan, far islands): 판독 불가. */
export type SiteStatus = 'ok' | 'coastal' | 'reclaimed' | 'sea' | 'nodata' | 'outside';

/** Manually curated boxes for post-2000 reclamation that SRTM still reads as water. */
export interface ReclaimedOverride {
  name: string;
  /** [minLat, minLng, maxLat, maxLng] */
  bbox: [number, number, number, number];
  note?: string;
}

/** VWorld 용도지역 point lookup (api/zoning.ts). */
export interface ZoningLookup {
  found: boolean;
  layer: string | null;
  name: string | null;
  landUse: LandUse;
  sido?: string;
  sigungu?: string;
  all: { layer: string; name: string }[];
}

export interface Constants {
  stats: Record<string, { value?: number; label: string; source?: string; sourceUrl?: string }>;
  scoring: {
    /** Where the bundled data can speak at all; anything else is reported as 판독 불가. */
    coverage: {
      /** [minLat, minLng, maxLat, maxLng] */
      bbox: [number, number, number, number];
      /** [lat, lng] vertices west→east along the MDL/NLL; a point north of the interpolated line is outside */
      northernBoundary: [number, number][];
      /** a nearest 읍면동 centroid farther than this means no land data (대마도, 독도, open sea) */
      emdOutsideKm: number;
    };
    projectProfiles: Record<ProjectType, ProjectProfile>;
    power: {
      weightSupply: number;
      weightRegion: number;
      weightDistance: number;
      supplyScoreBySubstationCount: Record<string, number>;
      regionPrior: Record<string, number>;
      distanceScoreKm: { maxKm: number; score: number }[];
      gateFailCap: number;
      emdMatchUncertainKm: number;
      capacityBands: { cond: string; label: string }[];
    };
    permit: {
      popRadiusKm: number;
      populationDeduction: { maxPop: number; deduction: number }[];
      schoolDeduction: { maxKm: number; deduction: number }[];
      landUseDeduction: Record<LandUse, number>;
      incheonResidentialExtraDeduction: number;
      caseDeduction: Record<CaseStatus, number>;
      caseSameSigunguCap: number;
      caseNearbyKm: number;
      caseNearbyDeduction: number;
      newsDeduction: { maxCount: number; deduction: number }[];
      /** thresholds on the summed conflict deductions; below mediumMin is 'low' */
      conflictRisk: { mediumMin: number; highMin: number };
      /** 넓은 지역 행일수록 부지 특정성이 낮아 감점을 비율로 축소한다 */
      newsLevelWeight: Record<NewsSignalRow['level'], number>;
      delayStat: {
        minPermits: number;
        /** ratio = 시군구 중앙값 / 조사 시군구 전체 중앙값 */
        relativeBands: { maxRatio: number; deduction: number }[];
        /** 12개월+ 미착공 비율이 전체보다 minExcessShare 이상 높으면 가산 */
        stalledExtra: { minExcessShare: number; deduction: number };
        cap: number;
      };
    };
    terrain: {
      seaMaxLandPct: number;
      coastalMaxLandPct: number;
      slopeDeduction: { maxP50Deg: number; deduction: number; label: string }[];
      unsuitable: { minP50Deg: number; minSteepPct: number; minDeduction: number };
      reclaimedOverrides: ReclaimedOverride[];
    };
    composite: {
      weightPower: number;
      weightPermit: number;
      grades: { min: number; grade: string }[];
      gateFailGradeCap: string;
    };
    delayByPermitGrade: Record<
      string,
      { minMonths: number; maxMonths: number; point: number; anchor: string }
    >;
    finance: {
      defaultCapexKrw: number;
      capexLabel: string;
      /** display-only 환산: 총사업비 ÷ 이 값 ≈ MW 규모 */
      capexPerMwKrw: number;
      defaultAnnualRate: number;
      rateLabel: string;
      capexRangeKrw: [number, number];
      rateRange: [number, number];
    };
  };
  disclaimer: Record<string, string>;
}

export interface AppData {
  emdPower: EmdPower[];
  emdCentroids: EmdCentroid[];
  substations: Substation[];
  schools: SchoolRow[];
  popGrid: PopGridRow[];
  cases: CaseRow[];
  regulations: RegulationRow[];
  dcStats: DcStat[];
  constants: Constants;
  /** 건축HUB 허가→착공 통계 (P1); null when data/permit_delay.json is absent */
  permitDelay: PermitDelayFile | null;
  /** 네이버 뉴스 갈등 시그널 (P1); null when data/news_signal.json is absent */
  newsSignal: NewsSignalFile | null;
  /** 지형 격자 (p07_terrain.py); null when data/terrain_grid.json is absent or undecodable */
  terrain: TerrainGrid | null;
}

export interface Deduction {
  label: string;
  points: number;
  evidence: string;
  anchor?: string;
}

export interface ScoreInput {
  lat: number;
  lng: number;
  landUse: LandUse;
  projectType: ProjectType;
  capexKrw: number;
  annualRate: number;
  /** VWorld lookup for this point; lets the engine tell reclaimed land from open water. */
  zoning?: ZoningLookup | null;
}

export interface ScoreResult {
  project: {
    type: ProjectType;
    profile: ProjectProfile;
    powerDeduction: number;
    substationDeduction: number;
    distanceDeduction: number;
    requirementsMet: boolean;
    substationRequirementMet: boolean;
    distanceRequirementMet: boolean;
  };
  emd: { key: string; sido: string; sigungu: string; emd: string; distanceKm: number } | null;
  emdUncertain: boolean;
  gate: { pass: boolean; substationCount: number; substations: string[] };
  power: {
    score: number;
    supplyScore: number;
    regionScore: number;
    distanceScore: number;
    nearestSubstation: { name: string; distanceKm: number } | null;
    capacityBand: string;
  };
  permit: {
    score: number;
    deductions: Deduction[];
    popNearby: number;
    nearestSchool: { name: string; distanceKm: number } | null;
    matchedCases: CaseRow[];
    matchedRegulations: RegulationRow[];
    /** 건축HUB 허가→착공 통계 매칭 결과 (없으면 null) */
    delayStat: {
      row: PermitDelayRow;
      areaLabel: string;
      enough: boolean;
      deduction: number;
      baselineMedianMonths: number | null;
      baselineStalledShare: number | null;
      ratio: number | null;
    } | null;
    /** 네이버 뉴스 갈등 기사 매칭 결과 (없으면 null) */
    newsSignal: {
      row: NewsSignalRow;
      areaLabel: string;
      deduction: number;
    } | null;
    /**
     * 갈등 사례·인근 사례·뉴스 시그널 감점의 합을 등급화한 파생 지표. 점수 자체는 바꾸지 않는다.
     * Component points are exposed so the UI never re-derives them from deduction labels.
     */
    conflictRisk: {
      level: ConflictLevel;
      points: number;
      /** '동일 시군구 갈등 사례' after caseSameSigunguCap */
      casePoints: number;
      /** '인근 갈등 사례' */
      nearbyPoints: number;
      /** '뉴스 갈등 시그널' after level weighting */
      newsPoints: number;
    };
  };
  site: {
    status: SiteStatus;
    /** Only confirmed land or a corroborated reclaimed area may receive a score. */
    eligible: boolean;
    label: string;
    detail: string;
    override: string | null;
  };
  terrain: { sample: TerrainSample; deduction: number; band: string; unsuitable: boolean } | null;
  composite: { score: number; grade: string; gradeCapped: boolean };
  delay: { minMonths: number; maxMonths: number; pointMonths: number; anchor: string };
  finance: { delayCostKrw: number; monthlyCostKrw: number };
}
