import { useMemo, useState, useRef } from 'react';
import { useAppData } from './hooks/useAppData';
import { useZoning } from './hooks/useZoning';
import { useDisaster } from './hooks/useDisaster';
import { useRestrictions } from './hooks/useRestrictions';
import { scoreSite } from './scoring/engine';
import type {
  LandUse,
  LandUseSource,
  ProjectAssumptions,
  ScoreInput,
  SiteSelection,
} from './types';
import {
  MAX_PINS,
  pinId,
  removePin,
  toScoreInput,
  togglePin,
  type PinnedSite,
} from './compare/pins';
import { MapView, type FlyToTarget } from './components/MapView';
import { SitePanel } from './components/SitePanel';
import { AnalysisDetails } from './components/AnalysisDetails';
import { SiteSearch } from './components/SiteSearch';
import { siteVerdict } from './lib/verdict';
import { CompareDialog } from './components/CompareDialog';
import { MemoPanel } from './components/MemoPanel';
import { DisclaimerFooter } from './components/DisclaimerFooter';
import { BusinessInputs } from './components/BusinessInputs';
import { defaultProject, emptyConditions } from './lib/reviewInputs';
import { ResultOverview } from './components/ResultOverview';
import { PanelResizer } from './components/PanelResizer';
import {
  defaultPanelWidth,
  PANEL_WIDTH,
  readPanelWidth,
  storePanelWidth,
} from './lib/panelWidth';

export default function App() {
  const { data, error } = useAppData();
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [site, setSite] = useState<SiteSelection | null>(null);
  const [manualLandUse, setManualLandUse] = useState<LandUse | null>(null);
  const [projectOverride, setProject] = useState<ProjectAssumptions | null>(
    null,
  );
  const [conditions, setConditions] = useState(emptyConditions);
  const [openedPinId, setOpenedPinId] = useState<string | null>(null);
  const [pins, setPins] = useState<PinnedSite[]>([]);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const panelScroll = useRef<HTMLDivElement>(null);

  const zoning = useZoning(site, selectionRevision);
  const zoningLookup = zoning.lookup;
  // Separate request from zoning so a VWorld hiccup on one never blanks the other.
  const restrictions = useRestrictions(
    site,
    data?.constants.scoring.restriction.heritageBufferM ?? 500,
    selectionRevision,
  );
  const restrictionLookup =
    restrictions.lookup;
  const disaster = useDisaster(site, selectionRevision);
  const disasterLookup = disaster.lookup;

  // The dropdown wins once the user touches it; otherwise VWorld fills it in.
  const auto = zoningLookup?.found ? zoningLookup : null;
  const landUse: LandUse = manualLandUse ?? auto?.landUse ?? 'unknown';
  const landUseSource: LandUseSource =
    manualLandUse !== null ? 'manual' : auto ? 'auto' : 'unknown';

  const project = useMemo(
    () => projectOverride ?? (data ? defaultProject(data.constants) : null),
    [projectOverride, data],
  );

  const input: ScoreInput | null = useMemo(() => {
    if (!data || !site || !project) return null;
    return {
      lat: site.lat,
      lng: site.lng,
      landUse,
      landUseSource,
      project,
      conditions,
      zoning: zoningLookup,
      restrictions: restrictionLookup,
      disaster: disasterLookup,
    };
  }, [
    data,
    site,
    landUse,
    landUseSource,
    project,
    conditions,
    zoningLookup,
    restrictionLookup,
    disasterLookup,
  ]);

  const result = useMemo(
    () => (data && input ? scoreSite(input, data) : null),
    [data, input],
  );

  // Project the current settled evidence onto the opened pin; selection events persist this snapshot.
  const resolvedPins = useMemo(() => {
    if (!site || !result || !openedPinId) return pins;
    const id = openedPinId;
    return pins.map((pin) =>
      pin.id !== id || pin.selection.lat !== site.lat || pin.selection.lng !== site.lng
        ? pin
        : {
            ...pin,
            conditions,
            landUse,
            manualLandUse,
            zoning: zoningLookup,
            restrictions: restrictionLookup,
            disaster: disasterLookup,
          },
    );
  }, [
    pins,
    site,
    result,
    openedPinId,
    conditions,
    landUse,
    manualLandUse,
    zoningLookup,
    restrictionLookup,
    disasterLookup,
  ]);
  const pinEntries = useMemo(
    () =>
      data && project
        ? resolvedPins.map((pin) => ({
            pin,
            result: scoreSite(toScoreInput(pin, project), data),
          }))
        : [],
    [data, resolvedPins, project],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-600">
        데이터를 불러오지 못했습니다: {error}
      </div>
    );
  }
  if (!data || !project) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        데이터 불러오는 중…
      </div>
    );
  }

  const selectSite = (selection: SiteSelection, zoom?: number) => {
    setPins(resolvedPins);
    panelScroll.current?.scrollTo({ top: 0 });
    setSelectionRevision((revision) => revision + 1);
    setSite(selection);
    const matching = resolvedPins.filter(
      (pin) =>
        pin.selection.lat.toFixed(5) === selection.lat.toFixed(5) &&
        pin.selection.lng.toFixed(5) === selection.lng.toFixed(5),
    );
    const saved = matching.length === 1 ? matching[0] : null;
    setConditions(saved?.conditions ?? emptyConditions());
    setOpenedPinId(saved?.id ?? null);
    setManualLandUse(saved?.manualLandUse ?? null);
    if (zoom !== undefined)
      setFlyTo({ lat: selection.lat, lng: selection.lng, zoom });
  };

  // Reopening a pin restores its overrides, so the card shows the same grade as the chip.
  const openPin = (pin: PinnedSite) => {
    setPins(resolvedPins);
    panelScroll.current?.scrollTo({ top: 0 });
    setSelectionRevision((revision) => revision + 1);
    setSite(pin.selection);
    setConditions(pin.conditions);
    setOpenedPinId(pin.id);
    setManualLandUse(pin.manualLandUse);
    setFlyTo({ lat: pin.selection.lat, lng: pin.selection.lng, zoom: 13 });
  };

  const currentPin: PinnedSite | null =
    site && result && result.site.eligible
      ? (() => {
          const base = { selection: site, landUse };
          return {
            id: openedPinId ?? pinId(base),
            ...base,
            conditions,
            manualLandUse,
            zoning: zoningLookup,
            restrictions: restrictionLookup,
            disaster: disasterLookup,
          };
        })()
      : null;
  const isPinned =
    currentPin !== null && resolvedPins.some((p) => p.id === currentPin.id);
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
                  ? '이미 담긴 지점입니다'
                  : '현재 지점을 비교에 담기';

  const siteKey = site
    ? `${site.lat.toFixed(5)},${site.lng.toFixed(5)}`
    : 'none';

  const missingEvidence = [
    landUse === 'unknown' ? '공식 용도지역' : null,
    zoning.status === 'loading'
      ? '용도지역 조회 완료'
      : zoning.status === 'error'
        ? '용도지역 조회 오류 재확인'
        : zoning.status === 'partial' ? '용도지역 일부 조회 미완료' : null,
    restrictions.status === 'loading'
      ? '규제구역 조회 완료'
      : restrictions.status === 'error'
        ? '규제구역 조회 오류 재확인'
        : restrictionLookup?.complete === false
          ? '규제구역 일부 조회 미완료'
          : null,
    disaster.status === 'loading'
      ? '재해위험지구 조회 완료'
      : disaster.status === 'error'
        ? '재해위험지구 조회 오류 재확인'
        : disaster.status === 'partial' ? '재해위험지구 일부 조회 미완료' : null,
  ].filter((item): item is string => item !== null);
  const incomplete = missingEvidence.length > 0;
  const tone = result ? siteVerdict(result, incomplete).tone : 'neutral';
  const scalePicker = (
    <BusinessInputs
      data={data}
      project={project}
      conditions={conditions}
      hasSite={!!site}
      onProject={setProject}
      onConditions={setConditions}
    />
  );
  const addCurrent = () => {
    if (currentPin && canPin && !isPinned) {
      setPins(togglePin(resolvedPins, currentPin));
      setOpenedPinId(currentPin.id);
    }
  };

  return (
    <div className="dc-workspace print:hidden">
      <header className="app-header">
        <div className="brand-symbol" aria-hidden="true">
          dc<span>↗</span>
        </div>
        <div className="brand-name">
          <h1>여기 DC 돼요?</h1>
          <span>데이터센터 부지 사전검토</span>
        </div>
        <div className="header-context">
          <span>후보 부지</span>
          <i>/</i> 1차 사업검토
        </div>
        <button className="header-saved" onClick={() => setCompareOpen(true)}>
          담은 후보 <b>{resolvedPins.length}</b>
        </button>
      </header>
      <main
        className="workspace-grid"
        style={{
          gridTemplateColumns: `minmax(360px, 1fr) 6px ${panelWidth}px`,
        }}
      >
        <div className={`map-column map-tone-${tone}`}>
          <div className="map-search">
            <span className="search-eyebrow">
              제안받은 후보 주소를 입력하세요
            </span>
            <SiteSearch
              selection={site}
              selectionRevision={selectionRevision}
              centroids={data.emdCentroids}
              onPick={selectSite}
            />
          </div>
          <div className="map-canvas">
            <MapView
              data={data}
              site={site}
              flyTo={flyTo}
              highlightZoneIds={
                result?.restriction.hits.flatMap((h) =>
                  h.zoneId ? [h.zoneId] : [],
                ) ?? []
              }
              onSelect={(lat, lng) => selectSite({ lat, lng, source: 'map' })}
            />
          </div>
          <div className="map-caption">
            <span className="map-live-dot" />
            {site
              ? '선택 지점의 분석 결과를 오른쪽 패널에서 확인하세요'
              : '지도 위 원하는 지점을 눌러 분석을 시작하세요'}
            <span>공개자료 기반</span>
          </div>
        </div>
        <PanelResizer
          width={panelWidth}
          min={PANEL_WIDTH.min}
          max={PANEL_WIDTH.max}
          defaultWidth={defaultPanelWidth()}
          onChange={(width) => {
            setPanelWidth(width);
            storePanelWidth(width);
          }}
        />
        <aside className="analysis-panel" aria-label="부지 분석 패널">
          <div className="panel-scroll" ref={panelScroll}>
            {result ? (
              <ResultOverview
                result={result}
                loading={
                  zoning.status === 'loading' ||
                  restrictions.status === 'loading' ||
                  disaster.status === 'loading'
                }
                incomplete={incomplete}
                missingEvidence={missingEvidence}
              >
                {scalePicker}
              </ResultOverview>
            ) : (
              <section className="empty-state">
                <span className="eyebrow">SITE ASSESSMENT</span>
                <h2>
                  제안받은 부지,
                  <br />
                  검토할 근거를 한눈에.
                </h2>
                <p>
                  주소와 사업조건을 입력하면 주요 제약, 부족한 면적, 미확인
                  비용과 다음 확인사항을 정리합니다.
                </p>
                <div className="empty-score">
                  <strong>—</strong>
                  <span>후보 부지 선택 대기</span>
                </div>
                {scalePicker}
                <div className="empty-features">
                  <span>
                    01 <b>입지 조건 분석</b>
                  </span>
                  <span>
                    02 <b>리스크 확인</b>
                  </span>
                  <span>
                    03 <b>후보지 비교</b>
                  </span>
                </div>
              </section>
            )}
            {site && (
              <section className="border-b border-gray-200 p-4 text-sm" aria-label="온라인 근거 조회 상태">
                {[['용도지역', zoning], ['규제구역', restrictions], ['재해위험지구', disaster]].map(([label, rawState]) => {
                  const state = rawState as typeof zoning | typeof restrictions | typeof disaster;
                  return <div key={String(label)} className="mb-2">
                    <span>{String(label)}: {state.status === 'done' ? '조회 완료' : state.status === 'loading' ? '조회 중' : state.status === 'partial' ? '일부 조회 미완료' : state.status === 'idle' ? '조회 범위 밖 · 미확인' : '조회 실패 · 미확인'}</span>
                    {state.lookup?.stale && <p>이전 조회의 관찰을 보존하고 있습니다 · 재확인 필요{state.lookup.previousFetchedAt ? ` · 이전 조회 ${state.lookup.previousFetchedAt}` : ''}</p>}
                    {state.lookup?.fetchedAt && <p className="text-xs">조회시각 {state.lookup.fetchedAt} · 원자료 기준일과 다름</p>}
                    <button type="button" disabled={state.status === 'idle'} className="ml-2 underline" onClick={state.retry}>{String(label)} 다시 조회</button>
                  </div>;
                })}
                <p className="text-xs">실패·부분 조회는 미해당을 뜻하지 않습니다. 지도 타일 표시 상태와 근거 조회 상태는 별개입니다.</p>
              </section>
            )}
            {result && (
              <AnalysisDetails
                result={result}
                data={data}
                onFlyTo={(lat, lng) => setFlyTo({ lat, lng, zoom: 13 })}
              />
            )}
            <details className="settings-section">
              <summary>
                용도지역 및 부지 정보{' '}
                <span>
                  {landUse === 'unknown'
                    ? '용도지역 미확인'
                    : '용도지역 확인됨'}
                </span>
              </summary>
              <SitePanel
                site={site}
                landUse={landUse}
                landUseSource={landUseSource}
                zoning={zoning}
                onLandUse={(value) => { setManualLandUse(value); setSelectionRevision((revision) => revision + 1); }}
                onResetAuto={() => { setManualLandUse(null); setSelectionRevision((revision) => revision + 1); }}
              />
            </details>
            {result?.site.eligible && input && site && (
              <details className="report-section">
                <summary>
                  부지 검토 보고서 · 선택형 AI 의견 <span>PDF 저장 ↗</span>
                </summary>
                <MemoPanel
                  key={siteKey}
                  data={data}
                  input={input}
                  result={result}
                  site={site}
                  landUseSource={landUseSource}
                  zoningName={zoningLookup?.found ? zoningLookup.name : null}
                />
              </details>
            )}
            <DisclaimerFooter data={data} />
          </div>
          <div className="panel-action">
            <p role="status">
              {resolvedPins.length
                ? `${resolvedPins.length}곳 담김 · 최대 ${MAX_PINS}곳 비교`
                : pinHint}
            </p>
            <div>
              {resolvedPins.length > 0 && (
                <button
                  className="secondary-action"
                  disabled={!canPin || isPinned}
                  title={pinHint}
                  onClick={addCurrent}
                >
                  {isPinned ? '✓ 담긴 지점' : '+ 현재지점 담기'}
                </button>
              )}
              <button
                className="primary-action"
                disabled={resolvedPins.length === 0 && !canPin}
                title={
                  resolvedPins.length
                    ? '담은 후보를 나란히 비교합니다'
                    : pinHint
                }
                onClick={() =>
                  resolvedPins.length ? setCompareOpen(true) : addCurrent()
                }
              >
                {resolvedPins.length ? '후보지 비교하기' : '현재지점 담기'}
                <span aria-hidden="true">
                  {resolvedPins.length ? '→' : '+'}
                </span>
              </button>
            </div>
          </div>
        </aside>
      </main>
      <CompareDialog
        open={compareOpen}
        entries={pinEntries}
        onClose={() => setCompareOpen(false)}
        onOpen={openPin}
        onRemove={(id) => setPins(removePin(resolvedPins, id))}
      />
    </div>
  );
}
