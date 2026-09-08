import type {
  Constants,
  CostItem,
  ProjectAssumptions,
  SiteConditions,
  BusinessType,
  ProjectType,
} from '../types';

export const PROJECT_SCALE_LABELS: Record<ProjectType, string> = {
  small: '엣지',
  standard: '일반',
  hyperscale: '초대형',
};

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  generalCloud: '일반 클라우드',
  colocation: '코로케이션',
  ai: 'AI 데이터센터',
};

export const COST_LABELS: Record<CostItem, string> = {
  land: '토지비',
  building: '건축·설비비',
  civil: '토목비',
  power: '전력 인입비',
  telecom: '통신 인입비',
  other: '기타비용',
};

export const CONSULTATION_LABELS = {
  power: '전력',
  water: '용수',
  telecom: '통신',
} as const;
export const CONSULTATION_STATUS = {
  unknown: '미확인',
  discussing: '협의 중',
  confirmed: '사용자 확인',
} as const;

export function emptyConditions(): SiteConditions {
  return {
    landAreaM2: null,
    plannedAreaM2: null,
    existingAreaM2: null,
    farPct: null,
    coveragePct: null,
    floors: null,
    costMode: 'items',
    totalCostKrw: null,
    costs: {
      land: null,
      building: null,
      civil: null,
      power: null,
      telecom: null,
      other: null,
    },
    averageDebtKrw: null,
    consultations: {
      power: { status: 'unknown', note: '', date: '' },
      water: { status: 'unknown', note: '', date: '' },
      telecom: { status: 'unknown', note: '', date: '' },
    },
  };
}

export function defaultProject(constants: Constants): ProjectAssumptions {
  return {
    type: 'standard',
    businessType: 'generalCloud',
    targetMw: null,
    development: 'new',
    areaMethod: 'manual',
    itMw: null,
    rackKw: null,
    rackAreaM2: null,
    whiteSpacePct: null,
    rates: [...constants.scoring.review.rates],
    delays: [...constants.scoring.review.delays],
  };
}

export function convertArea(
  value: number,
  from: 'm2' | 'pyeong',
  to: 'm2' | 'pyeong',
  factor: number,
): number {
  if (from === to) return value;
  return from === 'm2' ? value / factor : value * factor;
}
