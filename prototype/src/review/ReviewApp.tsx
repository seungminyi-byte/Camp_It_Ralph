import { useMemo, useState, useRef, useEffect } from 'react';
import { useAppData } from '../hooks/useAppData';
import { useZoning } from '../hooks/useZoning';
import { useDisaster } from '../hooks/useDisaster';
import { useRestrictions } from '../hooks/useRestrictions';
import { scoreSite } from '../scoring/engine';
import type {
  LandUse,
  LandUseSource,
  ScoreInput,
  SiteSelection,
} from '../types';
import {
  MAX_PINS,
  removePin,
  toScoreInput,
  togglePin,
  type PinnedSite,
} from '../compare/pins';
import { MapView, type FlyToTarget } from '../components/MapView';
import { SitePanel } from '../components/SitePanel';
import { AnalysisDetails } from '../components/AnalysisDetails';
import { SiteSearch } from '../components/SiteSearch';
import { siteVerdict } from '../lib/verdict';
import { CompareDialog } from '../components/CompareDialog';
import { MemoPanel } from '../components/MemoPanel';
import { DisclaimerFooter } from '../components/DisclaimerFooter';
import { BusinessInputs } from '../components/BusinessInputs';
import { defaultProject, emptyConditions } from '../lib/reviewInputs';
import { ResultOverview } from '../components/ResultOverview';
import { PanelResizer } from '../components/PanelResizer';
import {
  defaultPanelWidth,
  PANEL_WIDTH,
  readPanelWidth,
  storePanelWidth,
} from '../lib/panelWidth';

import 'leaflet/dist/leaflet.css';
import './workspace.css';
import { useReviewSession } from './ReviewSession';
import { usePinRefresh } from './usePinRefresh';
import { useEvidenceClock } from './useEvidenceClock';
import { exampleFromSearch, exampleInputs } from './examples';

export default function ReviewApp() {
  const { data, error, retry, warnings } = useAppData();
  const { inputs, store } = useReviewSession();
  const { site, conditions, manualLandUse, projectOverride, pins, openedPinId, selectionRevision, areaUnit } = inputs;
  const setPins = (value: PinnedSite[]) => store.update(s => ({ ...s, pins: value }));
  const setProject = (value: typeof projectOverride) => store.update(s => ({ ...s, projectOverride: value }));
  const setConditions = (value: typeof conditions) => store.update(s => ({ ...s, conditions: value }));
  const [pinSeed, setPinSeed] = useState(() => pins.find(p => p.id === openedPinId));
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'result' | 'map'>('result');
  const [expandedPane, setExpandedPane] = useState<'result' | 'map' | null>(null);
  const focusSelection = useRef(false);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const panelScroll = useRef<HTMLDivElement>(null);
  const reportSection = useRef<HTMLDetailsElement>(null);
  const [exampleRequest, setExampleRequest] = useState(() => ({ kind: exampleFromSearch(window.location.search), revision: 0 }));
  const exampleLoaded = useRef(-1);
  useEffect(() => {
    const request = () => {
      const kind = exampleFromSearch(window.location.search);
      if (kind) setExampleRequest(previous => ({ kind, revision: previous.revision + 1 }));
    };
    window.addEventListener('popstate', request);
    return () => window.removeEventListener('popstate', request);
  }, []);
  useEffect(() => {
    if (!data || exampleLoaded.current === exampleRequest.revision) return;
    const kind = exampleRequest.kind;
    if (!kind) return;
    exampleLoaded.current = exampleRequest.revision;
    store.beginExample(exampleInputs(kind, data.constants));
    queueMicrotask(() => {
      setPinSeed(undefined);
      setFlyTo({ lat: 36.4967, lng: 127.3007, zoom: 13 });
      setCompareOpen(kind === 'compare');
    });
    const url = new URL(window.location.href);
    url.searchParams.delete('example');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [data, store, exampleRequest]);
  useEffect(() => {
    if (!focusSelection.current) return;
    focusSelection.current = false;
    const id = requestAnimationFrame(() => panelScroll.current?.querySelector<HTMLElement>('.result-overview h2')?.focus());
    return () => cancelAnimationFrame(id);
  }, [selectionRevision]);
  const jumpTo = (target: 'report' | 'inputs') => {
    setWorkspaceView('result');
    setExpandedPane('result');
    requestAnimationFrame(() => {
      const detail = target === 'report' ? reportSection.current : panelScroll.current?.querySelector<HTMLDetailsElement>('.business-inputs');
      if (!detail) return;
      detail.open = true;
      detail.scrollIntoView({ block: 'start', behavior: 'instant' });
      (target === 'report' ? detail.querySelector<HTMLButtonElement>('.report-open-button') : detail.querySelector<HTMLElement>('summary'))?.focus({ preventScroll: true });
    });
  };

  const zoning = useZoning(site, selectionRevision, pinSeed?.evidence?.zoning);
  const zoningLookup = zoning.lookup;
  // Separate request from zoning so a VWorld hiccup on one never blanks the other.
  const restrictions = useRestrictions(
    site,
    data?.constants.scoring.restriction.heritageBufferM ?? 500,
    selectionRevision,
    pinSeed?.evidence?.restrictions,
  );
  const restrictionLookup =
    restrictions.lookup;
  const disaster = useDisaster(site, selectionRevision, pinSeed?.evidence?.disaster);
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

  const evidenceRevision = useEvidenceClock([zoningLookup, restrictionLookup, disasterLookup, ...pins.flatMap(pin => [pin.zoning, pin.restrictions, pin.disaster])]);
  const result = useMemo(
    () => {
      // Explicit invalidation signals re-evaluate time-dependent evidence in the engine.
      void evidenceRevision; void compareOpen;
      return data && input ? scoreSite(input, data) : null;
    },
    [data, input, evidenceRevision, compareOpen],
  );

  // Project the current settled evidence onto the opened pin; selection events persist this snapshot.
  const resolvedPins = useMemo(() => {
    if (!site || !result || !openedPinId) return pins;
    const id = openedPinId;
    return pins.map((pin) =>
      pin.id !== id || pin.selection.lat !== site.lat || pin.selection.lng !== site.lng || (pin.conditions === conditions && pin.landUse === landUse && pin.manualLandUse === manualLandUse && pin.zoning === zoningLookup && pin.restrictions === restrictionLookup && pin.disaster === disasterLookup && pin.evidence?.zoning.requestRevision === zoning.requestRevision && pin.evidence.zoning.selectionRevision === zoning.selectionRevision && pin.evidence.zoning.status === zoning.status && pin.evidence.restrictions.requestRevision === restrictions.requestRevision && pin.evidence.restrictions.selectionRevision === restrictions.selectionRevision && pin.evidence.restrictions.status === restrictions.status && pin.evidence.disaster.requestRevision === disaster.requestRevision && pin.evidence.disaster.selectionRevision === disaster.selectionRevision && pin.evidence.disaster.status === disaster.status)
        ? pin
        : {
            ...pin,
            conditions,
            landUse,
            manualLandUse,
            zoning: zoningLookup,
            restrictions: restrictionLookup,
            disaster: disasterLookup,
            evidence: { zoning: { queryKey: zoning.queryKey, selectionRevision: zoning.selectionRevision, requestRevision: zoning.requestRevision, status: zoning.status, lookup: zoningLookup }, restrictions: { queryKey: restrictions.queryKey, selectionRevision: restrictions.selectionRevision, requestRevision: restrictions.requestRevision, status: restrictions.status, lookup: restrictionLookup }, disaster: { queryKey: disaster.queryKey, selectionRevision: disaster.selectionRevision, requestRevision: disaster.requestRevision, status: disaster.status, lookup: disasterLookup } },
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
    zoning.queryKey, zoning.selectionRevision, zoning.requestRevision, zoning.status,
    restrictions.queryKey, restrictions.selectionRevision, restrictions.requestRevision, restrictions.status,
    disaster.queryKey, disaster.selectionRevision, disaster.requestRevision, disaster.status,
  ]);
  useEffect(() => {
    if (openedPinId && resolvedPins.some((p, i) => p !== pins[i])) {
      store.update(s => {
        if (s.openedPinId !== openedPinId || s.selectionRevision !== selectionRevision) return s;
        return { ...s, pins: s.pins.map(p => p.id === openedPinId ? (resolvedPins.find(r => r.id === p.id) ?? p) : p) };
      });
    }
  }, [resolvedPins, pins, openedPinId, selectionRevision, store]);
  usePinRefresh(store, data, [zoning, restrictions, disaster].every(s => s.status !== 'loading'));
  const pinEntries = useMemo(
    () => {
      void evidenceRevision; void compareOpen;
      return data && project
        ? resolvedPins.map((pin) => ({
            pin,
            result: scoreSite(toScoreInput(pin, project), data),
          }))
        : [];
    },
    [data, resolvedPins, project, evidenceRevision, compareOpen],
  );

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-600">
        <div><p role="alert">데이터를 불러오지 못했습니다: {error}</p><button onClick={retry}>데이터 다시 불러오기</button></div>
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
    setWorkspaceView('result');
    setExpandedPane(null);
    focusSelection.current = true;
    if (inputs.exampleMode) store.endExample();
    const availablePins = inputs.exampleMode ? store.snapshot().inputs.pins : resolvedPins;
    setPins(availablePins);
    panelScroll.current?.scrollTo({ top: 0 });
    const matching = availablePins.filter(
      (pin) =>
        pin.selection.lat.toFixed(5) === selection.lat.toFixed(5) &&
        pin.selection.lng.toFixed(5) === selection.lng.toFixed(5),
    );
    const saved = matching.length === 1 ? matching[0] : null;
    setPinSeed(saved ?? undefined);
    store.update(s => ({ ...s, site: selection, conditions: saved?.conditions ?? emptyConditions(), openedPinId: saved?.id ?? null, manualLandUse: saved?.manualLandUse ?? null, selectionRevision: s.selectionRevision + 1 }));
    if (zoom !== undefined)
      setFlyTo({ lat: selection.lat, lng: selection.lng, zoom });
  };

  // Reopening a pin restores its overrides, so the card shows the same grade as the chip.
  const openPin = (pin: PinnedSite) => {
    setWorkspaceView('result');
    setExpandedPane(null);
    focusSelection.current = true;
    setPins(resolvedPins);
    panelScroll.current?.scrollTo({ top: 0 });
    setPinSeed(pin);
    store.update(s => ({ ...s, site: pin.selection, conditions: pin.conditions, openedPinId: pin.id, manualLandUse: pin.manualLandUse, selectionRevision: s.selectionRevision + 1 }));
    setFlyTo({ lat: pin.selection.lat, lng: pin.selection.lng, zoom: 13 });
  };

  const currentPin: PinnedSite | null =
    site && result && result.site.eligible
      ? (() => {
          const base = { selection: site, landUse };
          return {
            id: openedPinId ?? crypto.randomUUID(),
            ...base,
            conditions,
            manualLandUse,
            zoning: zoningLookup,
            restrictions: restrictionLookup,
            disaster: disasterLookup,
            evidence: { zoning: { queryKey: zoning.queryKey, selectionRevision: zoning.selectionRevision, requestRevision: zoning.requestRevision, status: zoning.status, lookup: zoningLookup }, restrictions: { queryKey: restrictions.queryKey, selectionRevision: restrictions.selectionRevision, requestRevision: restrictions.requestRevision, status: restrictions.status, lookup: restrictionLookup }, disaster: { queryKey: disaster.queryKey, selectionRevision: disaster.selectionRevision, requestRevision: disaster.requestRevision, status: disaster.status, lookup: disasterLookup } },
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
      areaUnit={areaUnit}
      onAreaUnit={(unit) => store.update(s => ({ ...s, areaUnit: unit }))}
    />
  );
  const addCurrent = () => {
    if (currentPin && canPin && !isPinned) {
      setPins(togglePin(resolvedPins, currentPin));
      store.update(s => ({ ...s, openedPinId: currentPin.id }));
    }
  };

  return (
    <div className={`dc-workspace print:hidden view-${workspaceView} pane-${expandedPane ?? 'split'}`}>
      {inputs.exampleMode && <div className="review-example-notice" role="region" aria-label="가상 사업조건 예시" style={{ padding: '12px 20px', background: '#fff4df', color: '#4e3820', flexShrink: 0 }}>
        <strong>가상 사업조건 예시 · 실제 부지·가격 제안이 아닙니다</strong>
        <p>세종 좌표의 공개자료는 실제로 조회합니다. 면적·사업비·차입금은 계산을 체험하는 가정이며 실제 필지나 가격과 무관합니다. 기존 검토는 보관됩니다.</p>
        {inputs.exampleMode === 'area' && <button type="button" onClick={() => setConditions({ ...conditions, landAreaM2: 15000 })}>대지를 15,000㎡로 바꿔 충족 확인</button>}
        <button type="button" onClick={() => { store.endExample(); setPinSeed(undefined); setCompareOpen(false); }}>예시 종료 · 기존 검토로 돌아가기</button>
      </div>}
      {warnings?.length > 0 && <div role="status">일부 선택 자료를 불러오지 못했습니다. 미확인으로 표시합니다. <button onClick={retry}>자료 다시 불러오기</button></div>}
      <header className="workspace-toolbar">
        <div className="workspace-search">
          <label className="search-eyebrow" htmlFor="site-search-input">제안받은 후보 주소</label>
          <SiteSearch selection={site} selectionRevision={selectionRevision} centroids={data.emdCentroids} onPick={selectSite} />
        </div>
        <div className="current-selection"><span>현재 검토 중</span><strong title={site?.label}>{site?.label || (site ? `${site.lat.toFixed(5)}, ${site.lng.toFixed(5)}` : '후보를 검색하거나 지도에서 선택하세요')}</strong></div>
        <div className="workspace-shortcuts">
          <button className="header-saved" onClick={() => setCompareOpen(true)}>담은 후보 <b>{resolvedPins.length}</b></button>
          <button className="report-shortcut" disabled={!result} onClick={() => jumpTo('report')}>보고서 · PDF <span aria-hidden="true">↗</span></button>
        </div>
      </header>
      <div className="workspace-view-bar">
        <div className="desktop-view-toggle" role="group" aria-label="넓게 보기">
          <button aria-pressed={expandedPane === null} onClick={() => setExpandedPane(null)}>함께 보기</button>
          <button aria-pressed={expandedPane === 'map'} onClick={() => setExpandedPane('map')}>지도 크게</button>
          <button aria-pressed={expandedPane === 'result'} onClick={() => setExpandedPane('result')}>결과 크게</button>
        </div>
        <div className="workspace-view-toggle" role="group" aria-label="검토 화면 보기">
          <button aria-pressed={workspaceView === 'result'} onClick={() => setWorkspaceView('result')}>검토 결과</button>
          <button aria-pressed={workspaceView === 'map'} onClick={() => setWorkspaceView('map')}>지도 보기</button>
        </div>
        <button className="inputs-shortcut" onClick={() => jumpTo('inputs')}>상세조건 입력 <span>선택</span></button>
        <p className="workspace-guide">주소 선택 → 근거 확인 → 조건·비교 → 보고서</p>
      </div>
      <div
        className="workspace-grid"
        style={{
          gridTemplateColumns: expandedPane ? 'minmax(0, 1fr)' : `minmax(360px, 1fr) 6px min(${panelWidth}px, calc(100% - 366px))`,
        }}
      >
        <div className={`map-column map-tone-${tone}`}><a className="map-skip-link" href="#review-results" onClick={event => { event.preventDefault(); setWorkspaceView('result'); setExpandedPane('result'); requestAnimationFrame(() => { const heading = panelScroll.current?.querySelector<HTMLElement>('h2'); heading?.setAttribute('tabindex', '-1'); heading?.focus(); }); }}>검토 결과로 이동</a>
          <div className="map-canvas">
            <MapView
              data={data}
              site={site}
              selectionRevision={selectionRevision}
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
              ? '선택 지점의 제약과 미확인은 검토 결과에서 확인하세요'
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
        <aside id="review-results" className="analysis-panel" aria-label="부지 분석 패널">
          <div className="panel-scroll" ref={panelScroll}>
            {result ? (
              <ResultOverview
                result={result}
                site={site ?? undefined}
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
                <span className="eyebrow">데이터센터 후보 부지 1차 검토</span>
                <h2>
                  제안받은 부지,
                  <br />
                  검토할 근거를 한눈에.
                </h2>
                <p>
                  주소를 검색하면 주요 제약, 미확인 조건과 다음 확인사항을 정리합니다. 상세 사업조건은 필요할 때 입력하세요.
                </p>
                <div className="empty-start"><strong>주소만으로 기본 검토를 시작합니다.</strong><p>읍면동명이나 위경도로도 선택할 수 있습니다. 내부 사업정보와 AI는 필요하지 않습니다.</p><button onClick={() => document.getElementById('site-search-input')?.focus()}>후보 검색하기 →</button><button className="empty-map-button" onClick={() => setWorkspaceView('map')}>지도에서 선택하기</button></div>
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
              <section className="online-evidence-status" aria-label="온라인 근거 조회 상태"><h3>온라인 근거 조회 상태</h3>
                {[['용도지역', zoning], ['규제구역', restrictions], ['재해위험지구', disaster]].map(([label, rawState]) => {
                  const state = rawState as typeof zoning | typeof restrictions | typeof disaster;
                  return <div key={String(label)} className="mb-2">
                    <span>{String(label)}: {state.status === 'done' ? '조회 완료' : state.status === 'loading' ? '조회 중' : state.status === 'partial' ? '일부 조회 미완료' : state.status === 'idle' ? '조회 범위 밖 · 미확인' : '조회 실패 · 미확인'}</span>
                    {state.lookup?.stale && <p>이전 조회 결과입니다 · 재확인 필요 · 재확인 필요{state.lookup.previousFetchedAt ? ` · 이전 조회 ${state.lookup.previousFetchedAt}` : ''}</p>}
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
                onFlyTo={(lat, lng) => { setWorkspaceView('map'); setFlyTo({ lat, lng, zoom: 13 }); }}
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
                onLandUse={(value) => store.update(s => ({ ...s, manualLandUse: value, selectionRevision: s.selectionRevision + 1 }))}
                onResetAuto={() => store.update(s => ({ ...s, manualLandUse: null, selectionRevision: s.selectionRevision + 1 }))}
              />
            </details>
            {result && input && site && (
              <details ref={reportSection} className="report-section">
                <summary>
                  부지 검토 보고서 · 선택형 AI 의견 <span>PDF 저장 ↗</span>
                </summary>
                <MemoPanel
                  onPreviewOpen={() => setExpandedPane('result')}
                  entries={pinEntries}
                  currentPinId={currentPin && isPinned ? currentPin.id : null}
                  selectionRevision={selectionRevision}
                  requestRevision={JSON.stringify([zoning, restrictions, disaster].map(({ queryKey, selectionRevision: selected, requestRevision, status }) => [queryKey, selected, requestRevision, status]))}
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
      </div>
      <CompareDialog
        open={compareOpen}
        entries={pinEntries}
        currentPinId={currentPin && isPinned ? currentPin.id : null}
        onClose={() => setCompareOpen(false)}
        onOpen={openPin}
        onRemove={(id) => { setPins(removePin(resolvedPins, id)); store.update(s => ({ ...s, openedPinId: s.openedPinId === id ? null : s.openedPinId })); }}
      />
    </div>
  );
}
