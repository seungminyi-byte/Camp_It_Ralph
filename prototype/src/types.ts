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

export type CaseStatus =
  '무산' | '중단후재개' | '지연후준공' | '진행중분쟁' | '대응중';

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

export type DataCenterCategory = 'edgeSmall' | 'colocation' | 'hyperscale';

export interface DataCenterSite {
  id: string;
  name: string;
  category: DataCenterCategory;
  categoryReason: string;
  lat: number;
  lng: number;
  address: string;
  status: 'operational';
  openedYear: number | null;
  capacityMw: number | null;
  capacityKind: 'IT' | 'facility' | 'design' | null;
  scaleNote: string;
  sourceName: string;
  sourceUrl: string;
  coordinateBasis: string;
}

export interface DataCenterSiteFile {
  version: 1;
  asOf: string;
  scope: string;
  classification: Record<DataCenterCategory, string>;
  sites: DataCenterSite[];
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

export interface NearbySiteCandidate {
  id: string;
  label: string;
  pnu: string | null;
  areaM2: number;
  areaPyeong: number;
  distanceKm: number;
  center: { lat: number; lng: number };
  /** Leaflet-ready exterior rings, stored as [lat, lng]. */
  rings: [number, number][][];
}

export interface NearbySiteCandidates {
  basis: 'vworld-continuous-cadastral-map';
  minimumAreaM2: number;
  minimumAreaPyeong: number;
  searchRadiusKm: number;
  candidates: NearbySiteCandidate[];
  truncated: boolean;
  searchedTiles: number;
  note: string;
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
export type BusinessType = 'generalCloud' | 'colocation' | 'ai';

export interface ProjectProfile {
  label: string;
  description: string;
}

export interface ProjectAssumptions {
  type: ProjectType;
  businessType: BusinessType;
  targetMw: number | null;
  development: 'new' | 'conversion';
  areaMethod: 'manual' | 'racks';
  itMw: number | null;
  rackKw: number | null;
  rackAreaM2: number | null;
  whiteSpacePct: number | null;
  rates: [number, number, number];
  delays: [number, number, number];
}

export type CostItem =
  'land' | 'building' | 'civil' | 'power' | 'telecom' | 'other';
export interface Consultation {
  status: 'unknown' | 'discussing' | 'confirmed';
  note: string;
  date: string;
}
export interface SiteConditions {
  landAreaM2: number | null;
  plannedAreaM2: number | null;
  existingAreaM2: number | null;
  farPct: number | null;
  coveragePct: number | null;
  floors: number | null;
  costMode: 'total' | 'items';
  totalCostKrw: number | null;
  costs: Record<CostItem, number | null>;
  averageDebtKrw: number | null;
  consultations: Record<'power' | 'water' | 'telecom', Consultation>;
}

export interface HouseholdGridFile {
  version: number;
  indicator?: string;
  pipelineVersion?: string;
  sourceSha256?: string;
  source: string;
  sourceUrl: string;
  year: number;
  spatialUnit: string;
  note: string;
  rows: [lat: number, lng: number, households: number | null][];
}

export interface EvidenceItem {
  key: string;
  title: string;
  status: 'available' | 'partial' | 'unknown';
  source: string;
  sourceUrl: string;
  period: string;
  spatialUnit: string;
  detail: string;
  dataVersion?: string;
}

export interface ReviewIssue {
  title: string;
  detail: string;
  tone: 'risk' | 'caution';
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
  method: {
    sampleArcsec: number;
    slope: string;
    samplesPerCell: number;
    steepThresholdDeg: number;
  };
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
  planes: {
    landPct: string;
    slopeP50Deg: string;
    steepPct: string;
    elevMean10m: string;
  };
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

/** 'outside' = beyond the bundled data (north of the MDL, Japan, far islands): 판독 불가. */
export type SiteStatus =
  'ok' | 'coastal' | 'reclaimed' | 'sea' | 'nodata' | 'outside';

/** Manually curated boxes for post-2000 reclamation that SRTM still reads as water. */
export interface ReclaimedOverride {
  name: string;
  /** [minLat, minLng, maxLat, maxLng] */
  bbox: [number, number, number, number];
  note?: string;
}

/** Wire shape of api/restrictions.ts: raw VWorld hits, judged by the engine through constants. */
export interface RestrictionLookup {
  hits: { layer: string; name: string | null; buffered: boolean }[];
  queried: string[];
  failed: string[];
  /** true when every queried layer answered — only then is "no hit" evidence of absence */
  complete: boolean;
}

export type RestrictionLevel =
  'prohibited' | 'conditional' | 'none' | 'unknown';
/** Which cap is in force on the composite grade (the strictest one, whether or not it lowered the grade). */
export type CapReason = 'restriction';

export interface RestrictionHit {
  /** canonical type — a key of constants.scoring.restriction.types */
  type: string;
  name: string;
  level: 'prohibited' | 'conditional';
  law: string;
  source: 'bundled' | 'vworld';
  zoneId?: string;
  layer?: string;
}

/** One protected-area polygon from protected_zones.json (p08_protected_zones.py). */
export interface ProtectedZone {
  id: string;
  type: string;
  name: string;
  /** KDPA MARINE flag: 0 land, 1 partly marine, 2 marine */
  marine: number;
  /** [minLat, minLng, maxLat, maxLng] */
  bbox: [number, number, number, number];
  /** closed [lat, lng] rings; outer rings and holes alike, tested with the even-odd rule */
  rings: [number, number][][];
}

export interface ProtectedZonesFile {
  source: string;
  sourceUrls: string[];
  license?: string;
  builtAt: string;
  asOf: Record<string, string>;
  method: Record<string, unknown>;
  types: Record<string, { zones: number; vertices: number; source: string }>;
  dropped?: Record<string, number>;
  zones: ProtectedZone[];
}

/** Validated once in useAppData (rings closed, bbox present); scoreSite runs on every slider move. */
export interface ProtectedZones {
  source: string;
  sourceUrls: string[];
  asOf: Record<string, string>;
  zones: ProtectedZone[];
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
  stats: Record<
    string,
    { value?: number; label: string; source?: string; sourceUrl?: string }
  >;
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
    review: {
      rates: [number, number, number];
      delays: [number, number, number];
      m2PerPyeong: number;
    };
    evidence: Record<
      string,
      {
        source: string;
        sourceUrl: string;
        period: string;
        spatialUnit: string;
        detail: string;
      }
    >;
    disaster: {
      deduction: number;
      label: string;
      law: string;
      sourceUrl: string;
      reviewNote: string;
    };
    power: {
      weightSupply: number;
      weightRegion: number;
      weightDistance: number;
      supplyScoreBySubstationCount: Record<string, number>;
      regionPrior: Record<string, number>;
      distanceScoreKm: { maxKm: number; score: number }[];
      emdMatchUncertainKm: number;
    };
    permit: {
      popRadiusKm: number;
      populationDeduction: { maxPop: number; deduction: number }[];
      schoolDeduction: { maxKm: number; deduction: number }[];
      landUseDeduction: Record<LandUse, number>;
      incheonResidentialExtraDeduction: number;
      caseNearbyKm: number;
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
      unsuitable: {
        minP50Deg: number;
        minSteepPct: number;
        minDeduction: number;
      };
      reclaimedOverrides: ReclaimedOverride[];
    };
    /** 법정 보호·규제구역: bundled polygons (protected_zones.json) + VWorld point lookups (api/restrictions.ts) */
    restriction: {
      prohibitedDeduction: number;
      conditionalDeduction: number;
      /** metres; the 국가유산 layer is queried again with this buffer for 역사문화환경 보존지역 */
      heritageBufferM: number;
      /** canonical zone type → verdict and the statute behind it; bundled zones and VWorld layers share it */
      types: Record<
        string,
        { level: 'prohibited' | 'conditional'; law: string }
      >;
      /** VWorld 2D Data API layer → canonical type; `buffered` names the type of the buffered query's hits */
      vworldLayers: Record<
        string,
        {
          type: string;
          buffered?: string;
          nameRules?: { includes: string; type: string }[];
        }
      >;
    };
    composite: {
      weightPower: number;
      weightPermit: number;
      grades: { min: number; grade: string }[];
      /** a 법적 입지 제한 hit caps the grade here (E) */
      restrictionGradeCap: string;
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
  households?: HouseholdGridFile | null;
  cases: CaseRow[];
  regulations: RegulationRow[];
  dcStats: DcStat[];
  /** 공개 주소와 운영 상태를 확인한 완공 데이터센터; optional curated layer */
  dataCenters: DataCenterSiteFile | null;
  constants: Constants;
  /** 건축HUB 허가→착공 통계 (P1); null when data/permit_delay.json is absent */
  permitDelay: PermitDelayFile | null;
  /** 네이버 뉴스 갈등 시그널 (P1); null when data/news_signal.json is absent */
  newsSignal: NewsSignalFile | null;
  /** 지형 격자 (p07_terrain.py); null when data/terrain_grid.json is absent or undecodable */
  terrain: TerrainGrid | null;
  /** 법정 보호·규제구역 도형 (p08_protected_zones.py); null when data/protected_zones.json is absent or malformed */
  protectedZones: ProtectedZones | null;
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
  /** Legacy input accepted by saved scenario scripts; never interpreted as a debt balance. */
  projectType?: ProjectType;
  capexKrw?: number;
  annualRate?: number;
  project?: ProjectAssumptions;
  conditions?: SiteConditions;
  /** VWorld lookup for this point; lets the engine tell reclaimed land from open water. */
  zoning?: ZoningLookup | null;
  /** VWorld 규제구역 lookup for this point (api/restrictions.ts); null while loading or when it failed. */
  restrictions?: RestrictionLookup | null;
  /** A validated point lookup; absent while unconfirmed or failed. */
  disaster?: DisasterLookup | null;
}

export interface DisasterRiskHit {
  name: string | null;
  attributes: Record<string, string | number | boolean | null>;
}

export interface DisasterLookup {
  found: boolean;
  layer: 'LT_C_UP201';
  coordinate: { lat: number; lng: number };
  hits: DisasterRiskHit[];
}

export interface ScoreResult {
  disaster: {
    status: 'hit' | 'none' | 'unknown';
    hits: DisasterRiskHit[];
    deduction: number;
  };
  project: {
    type: ProjectType;
    profile: ProjectProfile;
    assumptions: ProjectAssumptions;
  };
  conditions: SiteConditions;
  area: {
    fitPct: number | null;
    hasInputs: boolean;
    status: 'shortfall' | 'fits' | 'unknown';
    label: string;
    requiredAreaM2: number | null;
    racks: number | null;
    minimumLandM2: number | null;
    shortfallM2: number | null;
    missing: string[];
    note: string;
  };
  businessCost: {
    mode: SiteConditions['costMode'];
    amountKrw: number | null;
    complete: boolean;
    label: string;
    missing: string[];
    comparisonKey: string | null;
  };
  evidence: EvidenceItem[];
  review: {
    label: string;
    tone: 'risk' | 'caution' | 'good';
    reason: string;
    issues: ReviewIssue[];
    actions: string[];
    overview: {
      label: string;
      tone: 'risk' | 'caution' | 'good';
      reason: string;
      issues: ReviewIssue[];
    };
  };
  emd: {
    key: string;
    sido: string;
    sigungu: string;
    emd: string;
    distanceKm: number;
  } | null;
  emdUncertain: boolean;
  gate: { pass: boolean; substationCount: number; substations: string[] };
  power: {
    score: number | null;
    supplyScore: number;
    regionScore: number;
    distanceScore: number;
    nearestSubstation: { name: string; distanceKm: number } | null;
    listedCount: number | null;
  };
  permit: {
    score: number | null;
    deductions: Deduction[];
    popNearby: number | null;
    householdsNearby: number | null;
    householdMissingCells: number;
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
  };
  site: {
    status: SiteStatus;
    /** Only confirmed land or a corroborated reclaimed area may receive a score. */
    eligible: boolean;
    label: string;
    detail: string;
    override: string | null;
  };
  terrain: {
    sample: TerrainSample;
    deduction: number;
    band: string;
    unsuitable: boolean;
  } | null;
  /** 법정 보호·규제구역 verdict; `checked` says which of the two layers actually answered */
  restriction: {
    level: RestrictionLevel;
    hits: RestrictionHit[];
    checked: { bundled: boolean; vworld: 'ok' | 'partial' | 'none' };
  };
  composite: {
    score: number | null;
    grade: string | null;
    gradeCapped: boolean;
    capReason: CapReason | null;
    breakdown: {
      power: { score: number | null; weight: number; weightedPoints: number | null };
      permit: { score: number | null; weight: number; weightedPoints: number | null };
    };
  };
  finance: {
    debtKrw: number | null;
    cells: { annualRate: number; months: number; costKrw: number | null }[];
    missing: string[];
  };
}
