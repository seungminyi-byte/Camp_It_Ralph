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
  };
  composite: { score: number; grade: string; gradeCapped: boolean };
  delay: { minMonths: number; maxMonths: number; pointMonths: number; anchor: string };
  finance: { delayCostKrw: number; monthlyCostKrw: number };
}
