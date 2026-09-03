import type { AppData, LandUse } from '../types';
import type { SiteSelection } from '../App';

const LAND_USE_OPTIONS: { value: LandUse; label: string }[] = [
  { value: 'unknown', label: '미확인 (기본 감점)' },
  { value: 'industrial', label: '공업지역' },
  { value: 'semiIndustrial', label: '준공업지역' },
  { value: 'commercial', label: '상업지역' },
  { value: 'green', label: '녹지·관리지역' },
  { value: 'residential', label: '주거지역' },
];

interface Props {
  data: AppData;
  site: SiteSelection | null;
  landUse: LandUse;
  capexKrw: number;
  annualRate: number;
  onScenario: (id: string) => void;
  onLandUse: (v: LandUse) => void;
  onCapex: (v: number) => void;
  onRate: (v: number) => void;
}

export function SitePanel({
  data,
  site,
  landUse,
  capexKrw,
  annualRate,
  onScenario,
  onLandUse,
  onCapex,
  onRate,
}: Props) {
  const fin = data.constants.scoring.finance;
  return (
    <section className="border-b border-gray-200 p-4">
      <h2 className="mb-2 text-sm font-bold text-gray-700">데모 시나리오</h2>
      <div className="flex flex-col gap-1.5">
        {data.scenarios.map((sc) => (
          <button
            key={sc.id}
            onClick={() => onScenario(sc.id)}
            className={`rounded border px-3 py-1.5 text-left text-sm hover:bg-blue-50 ${
              site?.label === sc.name ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            }`}
            title={sc.story}
          >
            {sc.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">지도를 클릭하면 임의 지점을 평가합니다.</p>

      <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-sm">
        <label className="text-gray-600">용도지역</label>
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

        <label className="text-gray-600">총사업비</label>
        <div>
          <input
            type="range"
            min={fin.capexRangeKrw[0]}
            max={fin.capexRangeKrw[1]}
            step={50_000_000_000}
            value={capexKrw}
            onChange={(e) => onCapex(Number(e.target.value))}
            className="w-full"
          />
          <div className="text-xs text-gray-600">
            {(capexKrw / 1e8).toLocaleString()}억원
            <span className="ml-1 text-gray-400">({fin.capexLabel})</span>
          </div>
        </div>

        <label className="text-gray-600">연 금리</label>
        <div>
          <input
            type="range"
            min={fin.rateRange[0] * 1000}
            max={fin.rateRange[1] * 1000}
            step={1}
            value={annualRate * 1000}
            onChange={(e) => onRate(Number(e.target.value) / 1000)}
            className="w-full"
          />
          <div className="text-xs text-gray-600">{(annualRate * 100).toFixed(1)}%</div>
        </div>
      </div>
    </section>
  );
}
