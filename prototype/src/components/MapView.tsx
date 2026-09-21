import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  WMSTileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { divIcon } from 'leaflet';
import { useNearbySites, type NearbySitesStatus } from '../hooks/useNearbySites';
import type {
  AppData,
  CaseRow,
  Constants,
  DataCenterCategory,
  DataCenterSite,
  ProtectedZone,
  ProtectedZones,
  SiteSelection,
} from '../types';

const CASE_COLOR: Record<CaseRow['status'], string> = {
  무산: '#d8756b',
  중단후재개: '#d89470',
  진행중분쟁: '#c6a260',
  지연후준공: '#74a99b',
  대응중: '#6b7280',
};

const DATA_CENTER_META: Record<
  DataCenterCategory,
  { label: string; color: string; size: number; short: string }
> = {
  edgeSmall: { label: '엣지·소형', color: '#397d8a', size: 22, short: 'E' },
  colocation: { label: '일반 코로케이션', color: '#665c91', size: 26, short: 'C' },
  hyperscale: { label: '초대형', color: '#d65b16', size: 30, short: 'H' },
};

// VWorld 용도지역 layers: 도시지역 / 관리지역 / 농림지역 / 자연환경보전지역 (WMS allows up to 4 per request).
const ZONING_LAYERS = ['lt_c_uq111', 'lt_c_uq112', 'lt_c_uq113', 'lt_c_uq114'].join(',');
// VWorld 규제구역 layers: 개발제한구역 / 상수원보호구역 / 국가유산 지정·보호구역 / 농업진흥지역 (도시자연공원구역 is the
// fifth and does not fit the 4-layer limit; the point lookup still checks it).
const RESTRICTION_LAYERS = ['lt_c_ud801', 'lt_c_um710', 'lt_c_uo301', 'lt_c_agrixue101'].join(',');
// Scenario flyTo lands on zoom 13; below this zoom the overlays are not requested (quota + readability).
const VWORLD_MIN_ZOOM = 12;
// Bundled 보호지역 polygons: drawn from this zoom, largest first, capped so a coastal view stays responsive.
const ZONE_MIN_ZOOM = 10;
const ZONE_MAX_DRAWN = 300;
// Fill colours sampled from VWorld tiles (2026-09); dot/hatch patterns mark sub-categories.
const ZONING_LEGEND: { label: string; color: string; color2?: string }[] = [
  { label: '주거', color: '#fdff00', color2: '#fdcb00' },
  { label: '상업', color: '#fd66cb' },
  { label: '공업', color: '#cb66ff' },
  { label: '녹지·관리·농림', color: '#cbfd66' },
];
const ZONING_ERROR = '용도지역 지도를 불러오지 못했습니다. 잠시 후 다시 켜 주세요.';
const RESTRICTION_ERROR = '규제구역 지도를 불러오지 못했습니다. 잠시 후 다시 켜 주세요.';

type RestrictionTypes = Constants['scoring']['restriction']['types'];

function siteIcon(): ReturnType<typeof divIcon> {
  return divIcon({
    className: '',
    html: '<div class="marker-badge" style="width:26px;height:26px;background:#e77524">P</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function dataCenterIcon(category: DataCenterCategory): ReturnType<typeof divIcon> {
  const meta = DATA_CENTER_META[category];
  return divIcon({
    className: '',
    html: `<div class="dc-map-marker" style="--dc-color:${meta.color};width:${meta.size}px;height:${meta.size}px"><span>${meta.short}</span></div>`,
    iconSize: [meta.size, meta.size],
    iconAnchor: [meta.size / 2, meta.size / 2],
    popupAnchor: [0, -meta.size / 2],
  });
}

function capacityText(site: DataCenterSite): string | null {
  if (site.capacityMw === null) return null;
  const kind = site.capacityKind === 'IT' ? 'IT 용량' : site.capacityKind === 'design' ? '수전 설계' : '시설 전력';
  return `${kind} ${site.capacityMw.toLocaleString('ko-KR')}MW`;
}

function ClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend() {
      onZoom(map.getZoom());
    },
  });
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  return null;
}

/** Leaflet only watches window resizes; the resizable side panel changes the map's width without one. */
function SizeWatcher() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FlyTo({ target }: { target: FlyToTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    // flyTo interpolates against the container size and yields an NaN centre when the map is
    // zero-sized (hidden pane, collapsed layout). That throws out of the effect and, with no
    // error boundary above, unmounts the whole app — so jump straight there instead.
    const size = map.getSize();
    if (size.x === 0 || size.y === 0) {
      map.setView([target.lat, target.lng], target.zoom, { animate: false });
      return;
    }
    map.flyTo([target.lat, target.lng], target.zoom, { duration: 0.8 });
  }, [map, target]);
  return null;
}

/**
 * One VWorld WMS overlay through /api/wms. Per tile-batch counters: the caller is told a batch failed only when
 * no tile of it loaded (a single 504 is just a slow VWorld).
 */
function VworldOverlay({
  layers,
  attribution,
  zIndex,
  onFailed,
}: {
  layers: string;
  attribution: string;
  zIndex: number;
  onFailed: (failed: boolean) => void;
}) {
  const tiles = useRef({ loaded: 0, errored: 0 });
  return (
    <WMSTileLayer
      url="/api/wms"
      layers={layers}
      styles={layers}
      format="image/png"
      transparent
      version="1.3.0"
      opacity={0.5}
      minZoom={VWORLD_MIN_ZOOM}
      zIndex={zIndex}
      updateWhenIdle
      attribution={attribution}
      eventHandlers={{
        loading: () => {
          tiles.current = { loaded: 0, errored: 0 };
        },
        tileload: () => {
          tiles.current.loaded += 1;
          onFailed(false);
        },
        tileerror: () => {
          tiles.current.errored += 1;
        },
        load: () => {
          const { loaded, errored } = tiles.current;
          onFailed(loaded === 0 && errored > 0);
        },
      }}
    />
  );
}

interface ViewBox {
  zoom: number;
  s: number;
  n: number;
  w: number;
  e: number;
}

function bboxArea(z: ProtectedZone): number {
  return (z.bbox[2] - z.bbox[0]) * (z.bbox[3] - z.bbox[1]);
}

/**
 * Bundled 보호지역 polygons (국립공원·KDPA) for the current viewport: red solid = 법적 입지 제한, amber dashed =
 * 검토 필요; the zones the selected site falls in are drawn heavier.
 */
function ProtectedZoneLayer({
  zones,
  types,
  highlightIds,
}: {
  zones: ProtectedZones;
  types: RestrictionTypes;
  highlightIds: string[];
}) {
  const snapshot = (m: ReturnType<typeof useMap>): ViewBox => {
    const b = m.getBounds();
    return { zoom: m.getZoom(), s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() };
  };
  const map = useMapEvents({
    moveend() {
      setView(snapshot(map));
    },
    zoomend() {
      setView(snapshot(map));
    },
  });
  const [view, setView] = useState<ViewBox>(() => snapshot(map));

  const visible = useMemo(() => {
    if (view.zoom < ZONE_MIN_ZOOM) return [];
    const inView = zones.zones.filter(
      (z) => z.bbox[0] <= view.n && z.bbox[2] >= view.s && z.bbox[1] <= view.e && z.bbox[3] >= view.w,
    );
    inView.sort((a, b) => bboxArea(b) - bboxArea(a));
    return inView.slice(0, ZONE_MAX_DRAWN);
  }, [zones, view]);
  const highlighted = useMemo(() => new Set(highlightIds), [highlightIds]);

  return (
    <>
      {visible.map((z) => {
        const level = types[z.type]?.level ?? 'conditional';
        const on = highlighted.has(z.id);
        const pathOptions =
          level === 'prohibited'
            ? { color: '#b91c1c', weight: on ? 2.5 : 1, fillOpacity: on ? 0.2 : 0.08 }
            : { color: '#d97706', weight: on ? 2.5 : 1, dashArray: '4 3', fillOpacity: on ? 0.15 : 0.06 };
        return (
          <Polygon key={z.id} positions={z.rings} pathOptions={pathOptions}>
            <Popup maxWidth={320}>
              <b>{z.name}</b> — {z.type}
              <br />
              {types[z.type]?.law ?? ''}
              <br />
              <span style={{ color: '#6b7280' }}>
                {level === 'prohibited' ? '법적 입지 제한' : level === 'review' ? '국가유산 관련 확인 필요 · 감점 없음' : level === 'reference' ? '주변 참고 · 점수 반영 없음' : '검토 필요'} · 단순화 도형, 고시 도면 우선
              </span>
            </Popup>
          </Polygon>
        );
      })}
    </>
  );
}

export interface FlyToTarget {
  lat: number;
  lng: number;
  zoom: number;
}

interface Props {
  data: AppData;
  site: SiteSelection | null;
  flyTo: FlyToTarget | null;
  /** ids of the bundled zones the current site falls in (drawn heavier) */
  highlightZoneIds: string[];
  onSelect: (lat: number, lng: number) => void;
}

export function MapView({ data, site, flyTo, highlightZoneIds, onSelect }: Props) {
  const [showSubs, setShowSubs] = useState(true);
  const [showDataCenters, setShowDataCenters] = useState(true);
  const [dataCenterCategories, setDataCenterCategories] = useState<
    Record<DataCenterCategory, boolean>
  >({ edgeSmall: true, colocation: true, hyperscale: true });
  const [showCases, setShowCases] = useState(true);
  const [showSchools, setShowSchools] = useState(false);
  const [showZoning, setShowZoning] = useState(true);
  // Off by default: four more VWorld tile layers per view, and the bundled polygons already show the parks.
  const [showRestrictions, setShowRestrictions] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [zoom, setZoom] = useState(9);
  // On phones the layer panel would cover the map, so it collapses behind a button under lg.
  const [layersOpen, setLayersOpen] = useState(false);
  const [zoningError, setZoningError] = useState<string | null>(null);
  const [restrictionError, setRestrictionError] = useState<string | null>(null);
  const [compactLayout, setCompactLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompactLayout(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const nearbySites = useNearbySites(site);

  const named154 = useMemo(
    () => data.substations.filter((s) => s.name),
    [data.substations],
  );
  const visibleDataCenters = useMemo(
    () =>
      (data.dataCenters?.sites ?? [])
        .filter((dc) => dataCenterCategories[dc.category])
        // Larger markers are drawn first so a nearby smaller category remains visible on top.
        .sort(
          (a, b) =>
            DATA_CENTER_META[b.category].size - DATA_CENTER_META[a.category].size,
        ),
    [data.dataCenters, dataCenterCategories],
  );
  const dataCenterCount = useMemo(
    () =>
      (data.dataCenters?.sites ?? []).reduce(
        (counts, dc) => ({ ...counts, [dc.category]: counts[dc.category] + 1 }),
        { edgeSmall: 0, colocation: 0, hyperscale: 0 } as Record<
          DataCenterCategory,
          number
        >,
      ),
    [data.dataCenters],
  );
  const zoneTypes = data.constants.scoring.restriction.types;

  return (
    <div className="h-full">
      <MapContainer center={[37.4, 127.0]} zoom={9} className="h-full" preferCanvas>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="base-map-tiles"
        />
        {showZoning && (
          <VworldOverlay
            layers={ZONING_LAYERS}
            attribution='용도지역 &copy; <a href="https://www.vworld.kr">VWorld</a>'
            zIndex={5}
            onFailed={(failed) => setZoningError(failed ? ZONING_ERROR : null)}
          />
        )}
        {showRestrictions && (
          <VworldOverlay
            layers={RESTRICTION_LAYERS}
            attribution='규제구역 &copy; <a href="https://www.vworld.kr">VWorld</a>'
            zIndex={6}
            onFailed={(failed) => setRestrictionError(failed ? RESTRICTION_ERROR : null)}
          />
        )}
        {showZones && data.protectedZones && (
          <ProtectedZoneLayer zones={data.protectedZones} types={zoneTypes} highlightIds={highlightZoneIds} />
        )}
        <ClickHandler onSelect={onSelect} />
        <ZoomWatcher onZoom={setZoom} />
        <SizeWatcher />
        <FlyTo target={flyTo} />
        {showSubs &&
          named154.map((s, i) => (
            <CircleMarker
              key={`sub-${i}`}
              center={[s.lat, s.lng]}
              radius={4}
              pathOptions={{ color: '#88a8b2', fillColor: '#a9c6cc', fillOpacity: 0.38, weight: 1 }}
            >
              <Popup>
                <b>{s.name}</b>
                <br />
                {s.voltage ? `${Number(s.voltage.split(';')[0]) / 1000}kV` : '전압 미상'} · OSM 참고치
              </Popup>
            </CircleMarker>
          ))}
        {showDataCenters &&
          visibleDataCenters.map((dc) => {
            const meta = DATA_CENTER_META[dc.category];
            const capacity = capacityText(dc);
            return (
              <Marker
                key={dc.id}
                title={dc.name}
                alt={dc.name}
                position={[dc.lat, dc.lng]}
                icon={dataCenterIcon(dc.category)}
                zIndexOffset={
                  dc.category === 'edgeSmall'
                    ? 300
                    : dc.category === 'colocation'
                      ? 200
                      : 100
                }
                riseOnHover
                eventHandlers={{ click: () => setLayersOpen(false) }}
              >
                <Popup
                  maxWidth={340}
                  className="dc-popup"
                  autoPanPaddingTopLeft={compactLayout ? [12, 80] : [20, 220]}
                  autoPanPaddingBottomRight={[20, 20]}
                >
                  <div className="dc-popup-heading">
                    <span style={{ color: meta.color, backgroundColor: `${meta.color}18` }}>{meta.label}</span>
                    <small>공개자료상 운영 · 실시간 미확인</small>
                  </div>
                  <b>{dc.name}</b>
                  <p>{dc.address}</p>
                  <dl>
                    {dc.openedYear && <><dt>운영 시작</dt><dd>{dc.openedYear}년</dd></>}
                    {capacity && <><dt>공개 용량</dt><dd>{capacity}</dd></>}
                    <dt>규모 근거</dt><dd>{dc.scaleNote}</dd>
                    <dt>분류 근거</dt><dd>{dc.categoryReason}</dd>
                  </dl>
                  <small>{dc.coordinateBasis}</small>
                  <a href={dc.sourceUrl} target="_blank" rel="noreferrer">
                    {dc.sourceName} ↗
                  </a>
                </Popup>
              </Marker>
            );
          })}
        {showCases &&
          data.cases.map((c) => (
            <CircleMarker
              key={`case-${c.id}`}
              center={[c.lat, c.lng]}
              radius={8}
              pathOptions={{
                color: CASE_COLOR[c.status],
                fillColor: CASE_COLOR[c.status],
                fillOpacity: 0.30,
                weight: 2,
              }}
            >
              <Popup maxWidth={320}>
                <b>{c.name}</b> — {c.status}
                <br />
                사유: {c.cause}
                <br />
                {c.summary}
                <br />
                <a href={c.source_url} target="_blank" rel="noreferrer">
                  출처 기사
                </a>
              </Popup>
            </CircleMarker>
          ))}
        {showSchools &&
          data.schools.map((s, i) => (
            <CircleMarker
              key={`sch-${i}`}
              center={[s[2], s[3]]}
              radius={2}
              pathOptions={{ color: '#82aa99', fillOpacity: 0.3, weight: 1 }}
            />
          ))}
        {site && (
          <Marker position={[site.lat, site.lng]} icon={siteIcon()}>
            <Popup>{site.label ?? '선택 부지'}</Popup>
          </Marker>
        )}
        {site && (
          <>
            <RadiusRing lat={site.lat} lng={site.lng} km={1} color="#f59e0b" />
            <RadiusRing lat={site.lat} lng={site.lng} km={0.2} color="#ef4444" />
          </>
        )}
        {nearbySites.status === 'done' &&
          nearbySites.result.candidates.flatMap((candidate) =>
            candidate.rings.map((ring, ringIndex) => (
              <Polygon
                key={`candidate-${candidate.id}-${ringIndex}`}
                positions={ring}
                pathOptions={{ color: '#d65f14', fillColor: '#f2a36f', fillOpacity: 0.23, weight: 2 }}
              >
                <Popup maxWidth={280}>
                  <b>{candidate.label}</b>
                  <br />
                  약 {Math.round(candidate.areaPyeong).toLocaleString('ko-KR')}평 · 선택 지점에서 {candidate.distanceKm.toFixed(1)}km
                  <br />
                  <span style={{ color: '#6b7280' }}>연속지적도 도형 기준 추정</span>
                </Popup>
              </Polygon>
            )),
          )}
      </MapContainer>
      <div className="map-control-stack">
      <div className="map-layer-control">
        <button
          type="button"
          onClick={() => setLayersOpen((v) => !v)}
          aria-expanded={layersOpen}
          className="flex w-full items-center justify-between gap-2 font-semibold"
        >
          지도 레이어
          <span aria-hidden>{layersOpen ? '▲' : '▼'}</span>
        </button>
        <div className={`${layersOpen ? 'flex' : 'hidden'} flex-col gap-1`}>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} />
          변전소 (OSM)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showDataCenters}
            onChange={(e) => setShowDataCenters(e.target.checked)}
          />
          인근 데이터센터 ({data.dataCenters?.sites.length ?? 0})
        </label>
        {showDataCenters && (
          <div className="dc-layer-legend">
            {(Object.keys(DATA_CENTER_META) as DataCenterCategory[]).map((category) => {
              const meta = DATA_CENTER_META[category];
              return (
                <label key={category}>
                  <input
                    type="checkbox"
                    checked={dataCenterCategories[category]}
                    onChange={(event) =>
                      setDataCenterCategories((current) => ({
                        ...current,
                        [category]: event.target.checked,
                      }))
                    }
                  />
                  <i style={{ backgroundColor: meta.color }} />
                  <span>{meta.label}</span>
                  <b>{dataCenterCount[category]}</b>
                </label>
              );
            })}
            <small role="status">{data.dataCenters
              ? `공개자료로 확인한 ${data.dataCenters.sites.length}곳 · 자료 확인일 ${data.dataCenters.asOf}. 전체 시설 목록이 아니며 미표시 지역의 시설 유무는 미확인입니다.`
              : '데이터센터 자료 미확인 · 목록을 불러오지 못했습니다. 인근 시설이 없다는 뜻이 아닙니다.'}</small>
          </div>
        )}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showCases} onChange={(e) => setShowCases(e.target.checked)} />
          갈등 사례
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showSchools}
            onChange={(e) => setShowSchools(e.target.checked)}
          />
          학교
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showZoning}
            onChange={(e) => {
              setShowZoning(e.target.checked);
              setZoningError(null);
            }}
          />
          용도지역 (VWorld)
        </label>
        {showZoning && zoom < VWORLD_MIN_ZOOM && (
          <div className="text-[11px] text-gray-500">지도를 {VWORLD_MIN_ZOOM}단계 이상 확대하면 표시</div>
        )}
        {showZoning && zoningError && (
          <div className="max-w-[180px] text-[11px] text-red-600">{zoningError}</div>
        )}
        {showZoning && zoom >= VWORLD_MIN_ZOOM && !zoningError && (
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-gray-200 pt-1 text-[11px]">
            {ZONING_LEGEND.map((z) => (
              <span key={z.label} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm border border-gray-300"
                  style={{
                    background: z.color2
                      ? `linear-gradient(90deg, ${z.color} 50%, ${z.color2} 50%)`
                      : z.color,
                  }}
                />
                {z.label}
              </span>
            ))}
            <span className="col-span-2 text-gray-400">빗금·점 무늬는 세부 용도·구역</span>
          </div>
        )}
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showRestrictions}
            onChange={(e) => {
              setShowRestrictions(e.target.checked);
              setRestrictionError(null);
            }}
          />
          규제구역 (VWorld)
        </label>
        {showRestrictions && zoom < VWORLD_MIN_ZOOM && (
          <div className="text-[11px] text-gray-500">지도를 {VWORLD_MIN_ZOOM}단계 이상 확대하면 표시</div>
        )}
        {showRestrictions && restrictionError && (
          <div className="max-w-[180px] text-[11px] text-red-600">{restrictionError}</div>
        )}
        {showRestrictions && zoom >= VWORLD_MIN_ZOOM && !restrictionError && (
          <div className="max-w-[200px] border-t border-gray-200 pt-1 text-[11px] text-gray-500">
            개발제한구역·상수원보호구역·국가유산 관련 도형·농업진흥지역 (VWorld 기본 색상). 국가유산 도형은 법적 적용 확인이 필요합니다.
          </div>
        )}
        {data.protectedZones && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
            보호지역 도형 (국립공원·KDPA)
          </label>
        )}
        {data.protectedZones && showZones && zoom < ZONE_MIN_ZOOM && (
          <div className="text-[11px] text-gray-500">지도를 {ZONE_MIN_ZOOM}단계 이상 확대하면 표시</div>
        )}
        {data.protectedZones && showZones && zoom >= ZONE_MIN_ZOOM && (
          <div className="flex flex-col gap-0.5 border-t border-gray-200 pt-1 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-red-700 bg-red-100" />
              법적 입지 제한 (국립공원·습지·상수원 등)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-dashed border-amber-600 bg-amber-50" />
              검토 필요 (수변구역·생물권보전지역 등)
            </span>
          </div>
        )}
        </div>
      </div>
      <NearbySiteControl
        key={site ? `${site.lat.toFixed(5)},${site.lng.toFixed(5)}` : 'no-site'}
        site={site}
        nearbySites={nearbySites}
        onSelect={onSelect}
      />
      </div>
    </div>
  );
}

function NearbySiteControl({
  site,
  nearbySites,
  onSelect,
}: {
  site: SiteSelection | null;
  nearbySites: NearbySitesStatus;
  onSelect: (lat: number, lng: number) => void;
}) {
  const [open, setOpen] = useState(site !== null);
  return (
    <details
      className="nearby-site-control"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
        <summary>
          <span>
            <b>인근 추천부지</b>
            <small>엣지·소형 · 1,000평 이상</small>
          </span>
          <i aria-hidden="true">⌄</i>
        </summary>
        <div className="nearby-site-body">
          {!site && <p className="nearby-site-empty">예상 부지를 지도에서 선택하면 주변 15km를 탐색합니다.</p>}
          {site && nearbySites.status === 'loading' && (
            <p className="nearby-site-empty"><span className="candidate-spinner" />1,000평 이상 필지를 찾는 중…</p>
          )}
          {site && nearbySites.status === 'error' && (
            <p className="nearby-site-empty">
              {nearbySites.code === 'not-deployed'
                ? '로컬 프리뷰 서버에 추천 API가 아직 연결되지 않았습니다.'
                : '추천 후보를 불러오지 못했습니다. 잠시 후 지점을 다시 선택해 주세요.'}
            </p>
          )}
          {nearbySites.status === 'done' && nearbySites.result.candidates.length === 0 && (
            <p className="nearby-site-empty">반경 {nearbySites.result.searchRadiusKm}km 안에서 면적 기준을 충족한 후보를 찾지 못했습니다.</p>
          )}
          {nearbySites.status === 'done' && nearbySites.result.candidates.length > 0 && (
            <>
              <ol className="nearby-site-list">
                {nearbySites.result.candidates.map((candidate, index) => (
                  <li key={candidate.id}>
                    <span className="candidate-rank">{index + 1}</span>
                    <div>
                      <strong>{candidate.label}</strong>
                      <p>
                        <b>약 {Math.round(candidate.areaPyeong).toLocaleString('ko-KR')}평</b>
                        <span>{candidate.distanceKm.toFixed(1)}km 거리</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(candidate.center.lat, candidate.center.lng)}
                    >
                      검토
                    </button>
                  </li>
                ))}
              </ol>
              <p className="nearby-site-note">
                면적 기준 1차 탐색 후보 · 도형 추정면적이며 용도·접도·권리관계와 토지대장 면적 확인 필요
                {nearbySites.result.truncated ? ' · 필지가 많은 지역은 일부 범위만 반영' : ''}
              </p>
            </>
          )}
        </div>
    </details>
  );
}

function RadiusRing({
  lat,
  lng,
  km,
  color,
}: {
  lat: number;
  lng: number;
  km: number;
  color: string;
}) {
  return (
    <Circle
      center={[lat, lng]}
      radius={km * 1000}
      pathOptions={{ color, fillOpacity: 0.03, weight: 1, dashArray: '4 4' }}
    />
  );
}
