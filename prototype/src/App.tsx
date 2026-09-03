import { useMemo, useState } from 'react';
import { useAppData } from './hooks/useAppData';
import { scoreSite } from './scoring/engine';
import type { LandUse, ScoreInput } from './types';
import { MapView } from './components/MapView';
import { SitePanel } from './components/SitePanel';
import { ScoreCard } from './components/ScoreCard';
import { CompareStrip } from './components/CompareStrip';
import { CaseDrawer } from './components/CaseDrawer';
import { MemoPanel } from './components/MemoPanel';
import { DisclaimerFooter } from './components/DisclaimerFooter';

export interface SiteSelection {
  lat: number;
  lng: number;
  label?: string;
}

export default function App() {
  const { data, error } = useAppData();
  const [site, setSite] = useState<SiteSelection | null>(null);
  const [landUse, setLandUse] = useState<LandUse>('unknown');
  const [capexKrw, setCapexKrw] = useState<number | null>(null);
  const [annualRate, setAnnualRate] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  const input: ScoreInput | null = useMemo(() => {
    if (!data || !site) return null;
    return {
      lat: site.lat,
      lng: site.lng,
      landUse,
      capexKrw: capexKrw ?? data.constants.scoring.finance.defaultCapexKrw,
      annualRate: annualRate ?? data.constants.scoring.finance.defaultAnnualRate,
    };
  }, [data, site, landUse, capexKrw, annualRate]);

  const result = useMemo(
    () => (data && input ? scoreSite(input, data) : null),
    [data, input],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-600">
        데이터 로드 실패: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        데이터 로드 중…
      </div>
    );
  }

  const selectScenario = (id: string) => {
    const sc = data.scenarios.find((s) => s.id === id);
    if (!sc) return;
    setSite({ lat: sc.lat, lng: sc.lng, label: sc.name });
    setLandUse(sc.landUse);
    setFlyTo([sc.lat, sc.lng]);
  };

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <div>
          <h1 className="text-lg font-bold">
            데이터센터 부지 리스크 스크리닝
            <span className="ml-2 text-sm font-normal text-gray-500">
              전력 수전 · 인허가 지연 · 금융비용
            </span>
          </h1>
        </div>
        <button
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
          onClick={() => setDrawerOpen((v) => !v)}
        >
          갈등 사례 {data.cases.length}건
        </button>
      </header>
      <CompareStrip data={data} />
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-[7]">
          <MapView
            data={data}
            site={site}
            flyTo={flyTo}
            onSelect={(lat, lng) => {
              setSite({ lat, lng });
              setLandUse('unknown');
            }}
          />
          <CaseDrawer
            data={data}
            open={drawerOpen}
            onFly={(c) => {
              setFlyTo([c.lat, c.lng]);
              setDrawerOpen(false);
            }}
          />
        </div>
        <aside className="flex w-[420px] flex-none flex-col overflow-y-auto border-l border-gray-200 bg-white">
          <SitePanel
            data={data}
            site={site}
            landUse={landUse}
            capexKrw={capexKrw ?? data.constants.scoring.finance.defaultCapexKrw}
            annualRate={annualRate ?? data.constants.scoring.finance.defaultAnnualRate}
            onScenario={selectScenario}
            onLandUse={setLandUse}
            onCapex={setCapexKrw}
            onRate={setAnnualRate}
          />
          {result && input && (
            <>
              <ScoreCard result={result} data={data} />
              <MemoPanel data={data} input={input} result={result} site={site} />
            </>
          )}
          <DisclaimerFooter data={data} />
        </aside>
      </div>
    </div>
  );
}
