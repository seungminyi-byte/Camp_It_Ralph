import type { AppData, LandUse, LandUseSource, ProjectType, SiteSelection } from '../types';
import type { ZoningStatus } from '../hooks/useZoning';
import { SiteSearch } from './SiteSearch';
import { NumberField, type Preset } from './NumberField';

const LAND_USE_OPTIONS: { value: LandUse; label: string }[] = [
  { value: 'unknown', label: '미확인 (기본 감점)' },
  { value: 'industrial', label: '공업지역' },
  { value: 'semiIndustrial', label: '준공업지역' },
  { value: 'commercial', label: '상업지역' },
  { value: 'green', label: '녹지·관리지역' },
  { value: 'residential', label: '주거지역' },
];

const SOURCE_LABEL: Record<SiteSelection['source'], string> = {
  map: '지도 클릭',
  emd: '읍면동 검색',
  geocode: '주소 검색',
  coords: '좌표 입력',
};

const EOK = 1e8;
// Input conveniences, not scoring parameters, so they live here rather than in constants.json.
const CAPEX_PRESETS: Preset[] = [
  { label: '1,000억', value: 1_000 },
  { label: '2,500억', value: 2_500 },
  { label: '5,000억', value: 5_000 },
  { label: '1조', value: 10_000 },
  { label: '2조', value: 20_000 },
];
const RATE_PRESETS: Preset[] = [4, 5, 5.5, 6.5, 8].map((v) => ({ label: `${v.toFixed(1)}%`, value: v }));

/** 억 → "100억" / "1조" for the range caption. */
function fmtEok(eok: number): string {
  return eok >= 10_000 ? `${(eok / 10_000).toLocaleString()}조` : `${eok.toLocaleString()}억`;
}

interface Props {
  data: AppData;
  site: SiteSelection | null;
  landUse: LandUse;
  landUseSource: LandUseSource;
  zoning: ZoningStatus;
  capexKrw: number;
  annualRate: number;
  projectType: ProjectType;
  onPick: (selection: SiteSelection, zoom: number) => void;
  onLandUse: (v: LandUse) => void;
  onResetAuto: () => void;
  onCapex: (v: number) => void;
  onRate: (v: number) => void;
  onProjectType: (v: ProjectType) => void;
}

function ZoningNote({ zoning, source, onResetAuto }: Pick<Props, 'zoning' | 'onResetAuto'> & { source: LandUseSource }) {
  if (source === 'manual') {
    const auto = zoning.status === 'done' && zoning.lookup.found ? zoning.lookup.name : null;
    return (
      <span className="text-gray-500">
        수동 선택
        {auto && (
          <>
            {' · '}
            <button type="button" className="underline hover:text-blue-600" onClick={onResetAuto}>
              자동값({auto})으로 되돌리기
            </button>
          </>
        )}
      </span>
    );
  }
  if (zoning.status === 'loading') return <span className="text-gray-400">VWorld 용도지역 조회 중…</span>;
  if (zoning.status === 'done' && zoning.lookup.found) {
    return <span className="text-green-700">자동 판정: {zoning.lookup.name} (VWorld)</span>;
  }
  if (zoning.status === 'done') {
    return <span className="text-gray-500">VWorld에서 용도지역 도형을 찾지 못했습니다 — 직접 선택하세요.</span>;
  }
  if (zoning.status === 'error') {
    return <span className="text-gray-500">자동 판정 불가 (오프라인 또는 서버 미배포) — 직접 선택하세요.</span>;
  }
  return null;
}

export function SitePanel({
  data,
  site,
  landUse,
  landUseSource,
  zoning,
  capexKrw,
  annualRate,
  projectType,
  onPick,
  onLandUse,
  onResetAuto,
  onCapex,
  onRate,
  onProjectType,
}: Props) {
  const fin = data.constants.scoring.finance;
  const capexMin = fin.capexRangeKrw[0] / EOK;
  const capexMax = fin.capexRangeKrw[1] / EOK;
  // 0.2 * 100 is 20.000000000000004 in floating point; round to a tenth of a percent.
  const rateMin = Math.round(fin.rateRange[0] * 1000) / 10;
  const rateMax = Math.round(fin.rateRange[1] * 1000) / 10;
  const perMwEok = fin.capexPerMwKrw / EOK;
  const projectProfile = data.constants.scoring.projectProfiles[projectType];

  return (
    <section className="border-b border-gray-200 p-4">
      <h2 className="mb-2 text-sm font-bold text-gray-700">부지 선택</h2>
      <SiteSearch centroids={data.emdCentroids} onPick={onPick} />

      {site && (
        <p className="mt-2 rounded bg-gray-50 p-1.5 text-xs text-gray-700">
          <b>{site.label ?? '선택 지점'}</b>
          <span className="ml-1 text-gray-500">
            {site.lat.toFixed(5)}, {site.lng.toFixed(5)} · {SOURCE_LABEL[site.source]}
          </span>
        </p>
      )}

      <div className="mt-3 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-sm">
        <label className="pt-1 text-gray-600">사업 유형</label>
        <select
          value={projectType}
          onChange={(e) => onProjectType(e.target.value as ProjectType)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          {Object.entries(data.constants.scoring.projectProfiles).map(([value, profile]) => (
            <option key={value} value={value}>
              {profile.label} · {profile.targetMw}MW
            </option>
          ))}
        </select>
        <p className="col-span-2 -mt-1 text-xs text-gray-500">
          {projectProfile.description} · 공급가능 변전소 {projectProfile.minSubstations}곳 이상,
          최근접 변전소 {projectProfile.maxSubstationKm}km 이내 권장
        </p>

        <label className="pt-1 text-gray-600">용도지역</label>
        <select
          value={landUse}
          onChange={(e) => onLandUse(e.target.value as LandUse)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          {LAND_USE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="col-span-2 -mt-1 text-xs">
          <ZoningNote zoning={zoning} source={landUseSource} onResetAuto={onResetAuto} />
        </p>
        <p className="col-span-2 -mt-1 text-xs text-gray-400">
          지도의 용도지역 표시(VWorld, 지도를 12단계 이상 확대)로 재확인할 수 있습니다.
        </p>

        <label className="pt-1 text-gray-600">총사업비</label>
        <NumberField
          label="총사업비 (억원)"
          value={capexKrw / EOK}
          min={capexMin}
          max={capexMax}
          step={100}
          unit="억원"
          koreanUnits
          presets={CAPEX_PRESETS}
          caption={`${fin.capexLabel} · 사업 유형 변경 시 MW당 약 ${perMwEok.toLocaleString()}억원 기준으로 자동 설정 · ${fmtEok(capexMin)}~${fmtEok(capexMax)} 입력, "1.5조"처럼 써도 됩니다`}
          onChange={(eok) => onCapex(Math.round(eok) * EOK)}
        />

        <label className="pt-1 text-gray-600">연 금리</label>
        <NumberField
          label="연 금리 (%)"
          value={Math.round(annualRate * 1000) / 10}
          min={rateMin}
          max={rateMax}
          step={0.1}
          decimals={1}
          unit="%"
          presets={RATE_PRESETS}
          caption={`${fin.rateLabel} · ${rateMin}~${rateMax}% 입력`}
          onChange={(pct) => onRate(Math.round(pct * 10) / 1000)}
        />
      </div>
    </section>
  );
}
