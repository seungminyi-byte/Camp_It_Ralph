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
  role: string;
}

export type LandUse =
  | 'industrial'
  | 'semiIndustrial'
  | 'commercial'
  | 'green'
  | 'residential'
  | 'unknown';

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

export interface Constants {
  stats: Record<string, { value?: number; label: string; source?: string; sourceUrl?: string }>;
  scoring: {
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
  scenarios: Scenario[];
  constants: Constants;
  /** 건축HUB 허가→착공 통계 (P1); null when data/permit_delay.json is absent */
  permitDelay: PermitDelayFile | null;
  /** 네이버 뉴스 갈등 시그널 (P1); null when data/news_signal.json is absent */
  newsSignal: NewsSignalFile | null;
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
  capexKrw: number;
  annualRate: number;
}

export interface ScoreResult {
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
  };
  composite: { score: number; grade: string; gradeCapped: boolean };
  delay: { minMonths: number; maxMonths: number; pointMonths: number; anchor: string };
  finance: { delayCostKrw: number; monthlyCostKrw: number };
}
