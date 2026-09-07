import { useMemo, useState, type CSSProperties } from 'react';
import { useAppData } from './hooks/useAppData';
import { useZoning } from './hooks/useZoning';
import { useDisaster } from './hooks/useDisaster';
import { useRestrictions } from './hooks/useRestrictions';
import { scoreSite } from './scoring/engine';
import type { LandUse, LandUseSource, ProjectType, ScoreInput, SiteSelection } from './types';
import { MAX_PINS, pinId, removePin, toScoreInput, togglePin, type PinnedSite } from './compare/pins';
import { MapView, type FlyToTarget } from './components/MapView';
import { SitePanel } from './components/SitePanel';
import { ScoreCard } from './components/ScoreCard';
import { CompareTray } from './components/CompareTray';
import { MemoPanel } from './components/MemoPanel';
import { DisclaimerFooter } from './components/DisclaimerFooter';
import { PanelResizer } from './components/PanelResizer';
import { PANEL_WIDTH, readPanelWidth, storePanelWidth } from './lib/panelWidth';

export default function App() {
  const { data, error } = useAppData();
  const [site, setSite] = useState<SiteSelection | null>(null);
  const [manualLandUse, setManualLandUse] = useState<LandUse | null>(null);
  const [projectType, setProjectType] = useState<ProjectType>('standard');
  const [capexKrw, setCapexKrw] = useState<number | null>(null);
  const [annualRate, setAnnualRate] = useState<number | null>(null);
  const [pins, setPins] = useState<PinnedSite[]>([]);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);

  const zoning = useZoning(site);
  const zoningLookup = zoning.status === 'done' ? zoning.lookup : null;
  // Separate request from zoning so a VWorld hiccup on one never blanks the other.
  const restrictions = useRestrictions(site, data?.constants.scoring.restriction.heritageBufferM ?? 500);
  const restrictionLookup = restrictions.status === 'done' ? restrictions.lookup : null;
  const disaster = useDisaster(site);
  const disasterLookup = disaster.status === 'done' ? disaster.lookup : null;

  // The dropdown wins once the user touches it; otherwise VWorld fills it in.
  const auto = zoningLookup?.found ? zoningLookup : null;
  const landUse: LandUse = manualLandUse ?? auto?.landUse ?? 'unknown';
  const landUseSource: LandUseSource =
    manualLandUse !== null ? 'manual' : auto ? 'auto' : 'unknown';

  const capex = capexKrw ?? data?.constants.scoring.finance.defaultCapexKrw ?? 0;
  const rate = annualRate ?? data?.constants.scoring.finance.defaultAnnualRate ?? 0;

  const input: ScoreInput | null = useMemo(() => {
    if (!data || !site) return null;
    return {
      lat: site.lat,
      lng: site.lng,
      landUse,
      projectType,
      capexKrw: capex,
      annualRate: rate,
      zoning: zoningLookup,
      restrictions: restrictionLookup,
      disaster: disasterLookup,
    };
  }, [data, site, landUse, projectType, capex, rate, zoningLookup, restrictionLookup, disasterLookup]);

  const result = useMemo(
    () => (data && input ? scoreSite(input, data) : null),
    [data, input],
  );

  // Project the current settled evidence onto the opened pin; selection events persist this snapshot.
  const resolvedPins = useMemo(() => {
    if (!site || !result || zoning.status === 'loading' || restrictions.status === 'loading' || disaster.status === 'loading') return pins;
    const id = pinId({ selection: site, landUse });
    return pins.flatMap((pin) => pin.id !== id ? [pin] : result.site.eligible
      ? [{ ...pin, zoning: zoningLookup, restrictions: restrictionLookup, disaster: disasterLookup }] : []);
  }, [pins, site, result, landUse, zoning.status, restrictions.status, disaster.status, zoningLookup, restrictionLookup, disasterLookup]);
  // Every chip is an engine result under the same current project assumptions.
  const pinEntries = useMemo(
    () => (data ? resolvedPins.map((pin) => ({ pin, result: scoreSite(toScoreInput(pin, capex, rate, projectType), data) })) : []),
    [data, resolvedPins, capex, rate, projectType],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-600">
        데이터를 불러오지 못했습니다: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        데이터 불러오는 중…
      </div>
    );
  }

  const selectSite = (selection: SiteSelection, zoom?: number) => {
    setPins(resolvedPins);
    setSite(selection);
    setManualLandUse(null);
    if (zoom !== undefined) setFlyTo({ lat: selection.lat, lng: selection.lng, zoom });
  };

  // Reopening a pin restores its overrides, so the card shows the same grade as the chip.
  const openPin = (pin: PinnedSite) => {
    setPins(resolvedPins);
    setSite(pin.selection);
    setManualLandUse(pin.manualLandUse);
    setFlyTo({ lat: pin.selection.lat, lng: pin.selection.lng, zoom: 13 });
  };

  const currentPin: PinnedSite | null =
    site && result && result.site.eligible
      ? (() => {
          const base = { selection: site, landUse };
          return { id: pinId(base), ...base, manualLandUse, zoning: zoningLookup, restrictions: restrictionLookup, disaster: disasterLookup };
        })()
      : null;
  const isPinned = currentPin !== null && resolvedPins.some((p) => p.id === currentPin.id);
  const canPin =
    currentPin !== null &&
    zoning.status !== 'loading' &&
    restrictions.status !== 'loading' &&
    disaster.status !== 'loading' &&
    (isPinned || resolvedPins.length < MAX_PINS);
  const pinHint = !site
    ? '지도를 클릭하거나 주소를 검색하세요'
    : result?.site.status === 'outside'
      ? '자료 범위 밖 지점은 비교 대상이 아닙니다'
      : result && !result.site.eligible
      ? `${result.site.label} 지점은 비교 대상이 아닙니다`
      : zoning.status === 'loading'
        ? '용도지역 조회 중…'
        : restrictions.status === 'loading'
        ? '규제구역 조회 중…'
        : disaster.status === 'loading'
          ? '재해위험지구 조회 중…'
        : !isPinned && resolvedPins.length >= MAX_PINS
          ? `최대 ${MAX_PINS}곳까지 담을 수 있습니다`
          : isPinned
            ? '비교에서 해제'
            : '현재 지점을 비교에 담기';

  const resizePanel = (w: number) => {
    setPanelWidth(w);
    storePanelWidth(w);
  };

  const siteKey = site ? `${site.lat.toFixed(5)},${site.lng.toFixed(5)}` : 'none';

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 print:hidden">
      <header className="flex-none border-b border-gray-200 bg-white px-3 py-2 sm:px-4">
        <h1 className="text-base font-bold sm:text-lg">
          여기 DC 돼요?
          <span className="ml-2 hidden text-sm font-normal text-gray-500 sm:inline">
            데이터센터 부지 리스크 스크리닝
          </span>
        </h1>
      </header>
      <CompareTray
        entries={pinEntries}
        currentId={currentPin?.id ?? null}
        isPinned={isPinned}
        canPin={canPin}
        pinHint={pinHint}
        capexKrw={capex}
        annualRate={rate}
        projectLabel={`${data.constants.scoring.projectProfiles[projectType].label} · ${data.constants.scoring.projectProfiles[projectType].targetMw}MW`}
        onPinCurrent={() => {
          if (currentPin) setPins(togglePin(resolvedPins, currentPin));
        }}
        onOpen={openPin}
        onRemove={(id) => setPins(removePin(resolvedPins, id))}
      />
      {/* Under lg the map sits on top at a fixed height and the panel scrolls beneath it. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[42vh] min-h-[200px] w-full flex-none lg:h-auto lg:min-h-0 lg:w-auto lg:min-w-0 lg:flex-[7]">
          <MapView
            data={data}
            site={site}
            flyTo={flyTo}
            highlightZoneIds={result?.restriction.hits.flatMap((h) => (h.zoneId ? [h.zoneId] : [])) ?? []}
            onSelect={(lat, lng) => selectSite({ lat, lng, source: 'map' })}
          />
        </div>
        <PanelResizer
          width={panelWidth}
          min={PANEL_WIDTH.min}
          max={PANEL_WIDTH.max}
          defaultWidth={PANEL_WIDTH.default}
          onChange={resizePanel}
        />
        <aside
          className="site-panel flex w-full min-h-0 flex-1 flex-col overflow-y-auto border-t border-gray-200 bg-white lg:flex-none lg:border-l lg:border-t-0"
          style={{ '--panel-w': `${panelWidth}px` } as CSSProperties}
        >
          <SitePanel
            data={data}
            site={site}
            landUse={landUse}
            landUseSource={landUseSource}
            zoning={zoning}
            capexKrw={capex}
            annualRate={rate}
            projectType={projectType}
            onPick={selectSite}
            onLandUse={setManualLandUse}
            onResetAuto={() => setManualLandUse(null)}
            onCapex={setCapexKrw}
            onRate={setAnnualRate}
            onProjectType={(type) => {
              setProjectType(type);
              const profile = data.constants.scoring.projectProfiles[type];
              setCapexKrw(profile.targetMw * data.constants.scoring.finance.capexPerMwKrw);
            }}
          />
          {result && input && site && (
            <>
              <ScoreCard
                result={result}
                data={data}
                onFlyTo={(lat, lng) => setFlyTo({ lat, lng, zoom: 13 })}
              />
              {result.site.eligible && (
                <MemoPanel
                  key={siteKey}
                  data={data}
                  input={input}
                  result={result}
                  site={site}
                  landUseSource={landUseSource}
                  zoningName={zoningLookup?.found ? zoningLookup.name : null}
                />
              )}
            </>
          )}
          <DisclaimerFooter data={data} />
        </aside>
      </div>
    </div>
  );
}
