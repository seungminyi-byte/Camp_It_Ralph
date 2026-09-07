import { useMemo, useState, useRef } from 'react';
import { useAppData } from './hooks/useAppData';
import { useZoning } from './hooks/useZoning';
import { useDisaster } from './hooks/useDisaster';
import { scoreSite } from './scoring/engine';
import type { LandUse, LandUseSource, ProjectType, ScoreInput, SiteSelection } from './types';
import { MAX_PINS, pinId, removePin, toScoreInput, togglePin, type PinnedSite } from './compare/pins';
import { MapView, type FlyToTarget } from './components/MapView';
import { SitePanel } from './components/SitePanel';
import { AnalysisDetails } from './components/AnalysisDetails';
import { SiteSearch } from './components/SiteSearch';
import { siteVerdict } from './lib/verdict';
import { CompareDialog } from './components/CompareDialog';
import { MemoPanel } from './components/MemoPanel';
import { DisclaimerFooter } from './components/DisclaimerFooter';
import { ProjectScalePicker } from './components/ProjectScalePicker';
import { ResultOverview } from './components/ResultOverview';
import { PanelResizer } from './components/PanelResizer';
import { defaultPanelWidth, PANEL_WIDTH, readPanelWidth, storePanelWidth } from './lib/panelWidth';

export default function App() {
  const { data, error } = useAppData();
  const [site, setSite] = useState<SiteSelection | null>(null);
  const [manualLandUse, setManualLandUse] = useState<LandUse | null>(null);
  const [projectType, setProjectType] = useState<ProjectType>('standard');
  const [capexKrw, setCapexKrw] = useState<number | null>(null);
  const [annualRate, setAnnualRate] = useState<number | null>(null);
  const [pins, setPins] = useState<PinnedSite[]>([]);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const panelScroll = useRef<HTMLDivElement>(null);

  const zoning = useZoning(site);
  const zoningLookup = zoning.status === 'done' ? zoning.lookup : null;
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
      disaster: disasterLookup,
    };
  }, [data, site, landUse, projectType, capex, rate, zoningLookup, disasterLookup]);

  const result = useMemo(
    () => (data && input ? scoreSite(input, data) : null),
    [data, input],
  );

  // Pinned sites are re-scored under the current project assumptions: same project, different place.
  const pinEntries = useMemo(
    () => (data ? pins.map((pin) => ({ pin, result: scoreSite(toScoreInput(pin, capex, rate, projectType), data) })) : []),
    [data, pins, capex, rate, projectType],
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
    panelScroll.current?.scrollTo({ top: 0 });
    setSite(selection);
    setManualLandUse(null);
    if (zoom !== undefined) setFlyTo({ lat: selection.lat, lng: selection.lng, zoom });
  };

  // Reopening a pin restores its overrides, so the card shows the same grade as the chip.
  const openPin = (pin: PinnedSite) => {
    panelScroll.current?.scrollTo({ top: 0 });
    setSite(pin.selection);
    setManualLandUse(pin.manualLandUse);
    setFlyTo({ lat: pin.selection.lat, lng: pin.selection.lng, zoom: 13 });
  };

  const currentPin: PinnedSite | null =
    site && result && result.site.eligible
      ? (() => {
          const base = { selection: site, landUse };
          return { id: pinId(base), ...base, manualLandUse, zoning: zoningLookup, disaster: disasterLookup };
        })()
      : null;
  const isPinned = currentPin !== null && pins.some((p) => p.id === currentPin.id);
  const canPin =
    currentPin !== null && zoning.status !== 'loading' && disaster.status !== 'loading' &&
    (isPinned || pins.length < MAX_PINS);
  const pinHint = !site
    ? '지도를 클릭하거나 주소를 검색하세요'
    : result && !result.site.eligible
      ? `${result.site.label} 지점은 비교 대상이 아닙니다`
      : zoning.status === 'loading'
        ? '용도지역 조회 중…'
        : disaster.status === 'loading'
          ? '재해위험지구 조회 중…'
        : !isPinned && pins.length >= MAX_PINS
          ? `최대 ${MAX_PINS}곳까지 담을 수 있습니다`
          : isPinned
            ? '이미 담긴 지점입니다'
            : '현재 지점을 비교에 담기';

  const siteKey = site ? `${site.lat.toFixed(5)},${site.lng.toFixed(5)}` : 'none';

  const incomplete = landUse === 'unknown' || zoning.status === 'loading' || disaster.status !== 'done';
  const tone = result ? siteVerdict(result, incomplete).tone : 'neutral';
  const scalePicker = <ProjectScalePicker data={data} value={projectType} capexKrw={capex}
    annualRate={rate} onCapex={setCapexKrw} onRate={setAnnualRate} onChange={(type) => {
    setProjectType(type);
    setCapexKrw(data.constants.scoring.projectProfiles[type].targetMw * data.constants.scoring.finance.capexPerMwKrw);
    setAnnualRate(data.constants.scoring.finance.defaultAnnualRate);
  }} />;
  const addCurrent = () => { if (currentPin && canPin && !isPinned) setPins(p => togglePin(p, currentPin)); };

  return (
    <div className="dc-workspace print:hidden">
      <header className="app-header">
        <div className="brand-symbol" aria-hidden="true">dc<span>↗</span></div>
        <div className="brand-name"><h1>여기 DC 돼요?</h1><span>데이터센터 부지 인텔리전스</span></div>
        <div className="header-context"><span>부지 탐색</span><i>/</i> 예비 타당성 검토</div>
        <button className="header-saved" onClick={() => setCompareOpen(true)}>담은 후보 <b>{pins.length}</b></button>
      </header>
      <main className="workspace-grid" style={{ gridTemplateColumns: `minmax(360px, 1fr) 6px ${panelWidth}px` }}>
        <div className={`map-column map-tone-${tone}`}>
          <div className="map-search"><span className="search-eyebrow">어디에 짓고 싶으세요?</span><SiteSearch centroids={data.emdCentroids} onPick={selectSite} /></div>
          <div className="map-canvas"><MapView data={data} site={site} flyTo={flyTo} onSelect={(lat, lng) => selectSite({ lat, lng, source: 'map' })} /></div>
          <div className="map-caption"><span className="map-live-dot" />{site ? '선택 지점의 분석 결과를 오른쪽 패널에서 확인하세요' : '지도 위 원하는 지점을 눌러 분석을 시작하세요'}<span>공개자료 기반</span></div>
        </div>
        <PanelResizer
          width={panelWidth}
          min={PANEL_WIDTH.min}
          max={PANEL_WIDTH.max}
          defaultWidth={defaultPanelWidth()}
          onChange={(width) => { setPanelWidth(width); storePanelWidth(width); }}
        />
        <aside className="analysis-panel" aria-label="부지 분석 패널">
          <div className="panel-scroll" ref={panelScroll}>
            {result ? <ResultOverview result={result} loading={zoning.status === 'loading' || disaster.status === 'loading'} incomplete={incomplete}>{scalePicker}</ResultOverview> :
              <section className="empty-state"><span className="eyebrow">SITE ASSESSMENT</span><h2>좋은 부지의 시작,<br />명확한 판단에서.</h2><p>전력부터 인허가까지.<br />지도에서 후보지를 선택해 가능성을 확인하세요.</p><div className="empty-score"><strong>—</strong><span>종합 점수 · 부지 선택 대기</span></div>{scalePicker}<div className="empty-features"><span>01 <b>입지 조건 분석</b></span><span>02 <b>리스크 확인</b></span><span>03 <b>후보지 비교</b></span></div></section>}
            {result && <AnalysisDetails result={result} data={data} onFlyTo={(lat, lng) => setFlyTo({ lat, lng, zoom: 13 })} />}
            <details className="settings-section"><summary>용도지역 및 부지 정보 <span>{landUse === 'unknown' ? '용도지역 미확인' : '용도지역 확인됨'}</span></summary>
              <SitePanel site={site} landUse={landUse} landUseSource={landUseSource} zoning={zoning} onLandUse={setManualLandUse} onResetAuto={() => setManualLandUse(null)} />
            </details>
            {result?.site.eligible && input && site && <details className="report-section"><summary>실사 체크리스트 · AI 검토 <span>PDF 저장 ↗</span></summary><MemoPanel key={siteKey} data={data} input={input} result={result} site={site} landUseSource={landUseSource} zoningName={zoningLookup?.found ? zoningLookup.name : null} /></details>}
            <DisclaimerFooter data={data} />
          </div>
          <div className="panel-action">
            <p role="status">{pins.length ? `${pins.length}곳 담김 · 최대 ${MAX_PINS}곳 비교` : pinHint}</p>
            <div>{pins.length > 0 && <button className="secondary-action" disabled={!canPin || isPinned} title={pinHint} onClick={addCurrent}>{isPinned ? '✓ 담긴 지점' : '+ 현재지점 담기'}</button>}
              <button className="primary-action" disabled={pins.length === 0 && !canPin} title={pins.length ? '담은 후보를 나란히 비교합니다' : pinHint} onClick={() => pins.length ? setCompareOpen(true) : addCurrent()}>{pins.length ? '후보지 비교하기' : '현재지점 담기'}<span aria-hidden="true">{pins.length ? '→' : '+'}</span></button></div>
          </div>
        </aside>
      </main>
      <CompareDialog open={compareOpen} entries={pinEntries} onClose={() => setCompareOpen(false)} onOpen={openPin} onRemove={(id) => setPins(p => removePin(p, id))} />
    </div>
  );
}
