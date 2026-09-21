import '../styles/workspace.css';
import { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useAppData } from '../hooks/useAppData';
import { useZoning } from '../hooks/useZoning';
import { useDisaster } from '../hooks/useDisaster';
import { useRestrictions } from '../hooks/useRestrictions';
import { scoreSite } from '../scoring/engine';
import type {
  LandUse,
  LandUseSource,
  ProjectAssumptions,
  ScoreInput,
  SiteSelection,
} from '../types';
import {
  MAX_PINS,
  pinId,
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

interface Props {
  active: boolean;
  onHome: () => void;
}

export default function ReviewWorkspace({ active, onHome }: Props) {
  const { data, error } = useAppData();
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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFocusRequest, setReportFocusRequest] = useState<{
    site: SiteSelection;
    pinId: string | null;
  } | null>(null);
  const [panelWidth, setPanelWidth] = useState(readPanelWidth);
  const panelScroll = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const reportRef = useRef<HTMLDetailsElement>(null);

  // Reset on the route render; a fast return must not revive a deferred close.
  if (!active && (compareOpen || reportOpen || reportFocusRequest)) {
    setCompareOpen(false);
    setReportOpen(false);
    setReportFocusRequest(null);
  }

  useEffect(() => {
    if (!active || !data) return;
    const frame = requestAnimationFrame(() => titleRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active, data]);

  const zoning = useZoning(site);
  const zoningLookup = zoning.status === 'done' ? zoning.lookup : null;
  // Separate request from zoning so a VWorld hiccup on one never blanks the other.
  const restrictions = useRestrictions(
    site,
    data?.constants.scoring.restriction.heritageBufferM ?? 500,
  );
  const restrictionLookup =
    restrictions.status === 'done' ? restrictions.lookup : null;
  const disaster = useDisaster(site);
  const disasterLookup = disaster.status === 'done' ? disaster.lookup : null;

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
    const loading =
      zoning.status === 'loading' ||
      restrictions.status === 'loading' ||
      disaster.status === 'loading';
    return pins.map((pin) =>
      pin.id !== id
        ? pin
        : {
            ...pin,
            conditions,
            landUse,
            manualLandUse,
            ...(loading
              ? {}
              : {
                  zoning: zoningLookup,
                  restrictions: restrictionLookup,
                  disaster: disasterLookup,
                }),
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
    zoning.status,
    restrictions.status,
    disaster.status,
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

  // Focus only after the requested site and its conditions have committed together.
  // Layout cleanup cancels the frame before a new screen or candidate can paint.
  useLayoutEffect(() => {
    if (!active || !reportOpen || !reportFocusRequest || site !== reportFocusRequest.site) return;
    if (reportFocusRequest.pinId !== null && (
      openedPinId !== reportFocusRequest.pinId ||
      !resolvedPins.some((pin) => pin.id === reportFocusRequest.pinId)
    )) return;
    const frame = requestAnimationFrame(() => {
      const report = reportRef.current;
      if (report?.isConnected && report.open) {
        report.scrollIntoView({ block: 'start' });
        report.querySelector<HTMLElement>('#report-title')?.focus();
      }
      setReportFocusRequest(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, reportOpen, reportFocusRequest, openedPinId, resolvedPins, site]);

  if (error) {
    return (
      <main className="entry-status" role="alert">
        <h1>검토 자료를 불러오지 못했습니다.</h1>
        <p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p>
        <div>
          <button className="entry-primary" onClick={() => window.location.reload()}>다시 불러오기</button>
          <button className="entry-secondary" onClick={onHome}>제품 소개로</button>
        </div>
      </main>
    );
  }
  if (!data || !project) {
    return (
      <main className="entry-status" aria-busy="true">
        <h1>검토 자료를 준비하고 있습니다.</h1>
        <p role="status">전력·주변 현황 등 공개자료를 불러오는 중입니다.</p>
        <button className="entry-secondary" onClick={onHome}>제품 소개로</button>
      </main>
    );
  }

  const selectSite = (selection: SiteSelection, zoom?: number) => {
    setReportFocusRequest(null);
    setReportOpen(false);
    setPins(resolvedPins);
    panelScroll.current?.scrollTo({ top: 0 });
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
    setReportFocusRequest(null);
    setReportOpen(false);
    setPins(resolvedPins);
    panelScroll.current?.scrollTo({ top: 0 });
    setSite(pin.selection);
    setConditions(pin.conditions);
    setOpenedPinId(pin.id);
    setManualLandUse(pin.manualLandUse);
    setFlyTo({ lat: pin.selection.lat, lng: pin.selection.lng, zoom: 13 });
  };

  const openCurrentReport = () => {
    if (!active || !site) return;
    setReportOpen(true);
    setReportFocusRequest({ site, pinId: null });
  };
  const openPinReport = (pin: PinnedSite) => {
    if (!active || !resolvedPins.some((candidate) => candidate.id === pin.id)) return;
    openPin(pin);
    setReportOpen(true);
    setReportFocusRequest({ site: pin.selection, pinId: pin.id });
    setCompareOpen(false);
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
        : null,
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
        : null,
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
      <header className="review-toolbar">
        <div>
          <h1 id="review-title" ref={titleRef} tabIndex={-1}>후보 부지 검토</h1>
          <p>주소나 지도에서 검토할 위치를 선택하세요.</p>
        </div>
        <button className="header-saved" onClick={() => setCompareOpen(true)}>
          후보 비교 <b>{resolvedPins.length}/{MAX_PINS}</b>
        </button>
      </header>
      <main
        id="review-main"
        tabIndex={-1}
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
              centroids={data.emdCentroids}
              onPick={selectSite}
            />
          </div>
          <div className="map-canvas">
            <MapView
              active={active}
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
              ? '선택 지점의 분석 결과를 검토 영역에서 확인하세요'
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
            {result && (
              <AnalysisDetails
                result={result}
                data={data}
                onFlyTo={(lat, lng) => setFlyTo({ lat, lng, zoom: 13 })}
              />
            )}
            {result?.site.eligible && input && site && (
              <button className="open-report-cta" onClick={openCurrentReport}>
                보고서 보기 <span>현재 근거 18항목과 전체 확인사항</span>
              </button>
            )}
            <details className="settings-section">
              <summary>
                용도지역 및 부지 정보{' '}
                <span>
                  {landUse === 'unknown'
                    ? '용도지역 미확인'
                    : landUseSource === 'manual'
                      ? '사용자 선택 적용'
                      : landUseSource === 'auto'
                        ? '공개 조회값 적용'
                        : '출처 확인 필요'}
                </span>
              </summary>
              <SitePanel
                site={site}
                landUse={landUse}
                landUseSource={landUseSource}
                zoning={zoning}
                onLandUse={setManualLandUse}
                onResetAuto={() => setManualLandUse(null)}
              />
            </details>
            {result?.site.eligible && input && site && (
              <details
                id="report-section"
                ref={reportRef}
                className="report-section"
                open={reportOpen}
                onToggle={(event) => {
                  setReportOpen(event.currentTarget.open);
                  if (!event.currentTarget.open) setReportFocusRequest(null);
                }}
              >
                <summary>
                  기본 보고서 <span>근거 18항목 · 브라우저 인쇄</span>
                </summary>
                <MemoPanel
                  active={active}
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
        open={active && compareOpen}
        entries={pinEntries}
        onClose={() => setCompareOpen(false)}
        onOpen={openPin}
        onOpenReport={openPinReport}
        onRemove={(id) => {
          if (reportFocusRequest?.pinId === id || openedPinId === id) setReportFocusRequest(null);
          if (openedPinId === id) setReportOpen(false);
          setPins(removePin(resolvedPins, id));
        }}
      />
    </div>
  );
}
