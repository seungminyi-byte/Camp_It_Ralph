import type { LandUse, LandUseSource, SiteSelection } from '../types';
import type { ZoningStatus } from '../hooks/useZoning';

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

interface Props {
  site: SiteSelection | null;
  landUse: LandUse;
  landUseSource: LandUseSource;
  zoning: ZoningStatus;
  onLandUse: (v: LandUse) => void;
  onResetAuto: () => void;
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
  site,
  landUse,
  landUseSource,
  zoning,
  onLandUse,
  onResetAuto,
}: Props) {
  return (
    <section className="border-b border-gray-200 p-4">


      {site && (
        <p className="mt-2 rounded bg-gray-50 p-1.5 text-xs text-gray-700">
          <b>{site.label ?? '선택 지점'}</b>
          <span className="ml-1 text-gray-500">
            {site.lat.toFixed(5)}, {site.lng.toFixed(5)} · {SOURCE_LABEL[site.source]}
          </span>
        </p>
      )}


      <div className="mt-3 grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-2 text-sm">
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

      </div>
    </section>
  );
}
