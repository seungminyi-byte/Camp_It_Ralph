import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  WMSTileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { AppData, CaseRow } from '../types';
import type { SiteSelection } from '../App';

const CASE_COLOR: Record<CaseRow['status'], string> = {
  무산: '#dc2626',
  중단후재개: '#ea580c',
  진행중분쟁: '#d97706',
  지연후준공: '#65a30d',
  대응중: '#6b7280',
};

// VWorld 용도지역 layers: 도시지역 / 관리지역 / 농림지역 / 자연환경보전지역 (WMS allows up to 4 per request).
const ZONING_LAYERS = ['lt_c_uq111', 'lt_c_uq112', 'lt_c_uq113', 'lt_c_uq114'].join(',');
// Scenario flyTo lands on zoom 13; below this zoom the overlay is not requested (quota + readability).
const ZONING_MIN_ZOOM = 12;
// Fill colours sampled from VWorld tiles (2026-09); dot/hatch patterns mark sub-categories.
const ZONING_LEGEND: { label: string; color: string; color2?: string }[] = [
  { label: '주거', color: '#fdff00', color2: '#fdcb00' },
  { label: '상업', color: '#fd66cb' },
  { label: '공업', color: '#cb66ff' },
  { label: '녹지·관리·농림', color: '#cbfd66' },
];
const ZONING_ERROR = '용도지역 타일을 불러오지 못했습니다 (VWorld 응답 없음 또는 서버 VWORLD_API_KEY·등록 도메인 확인)';

function siteIcon(): ReturnType<typeof divIcon> {
  return divIcon({
    className: '',
    html: '<div class="marker-badge" style="width:26px;height:26px;background:#1d4ed8">P</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
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

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 13, { duration: 0.8 });
  }, [map, target]);
  return null;
}

interface Props {
  data: AppData;
  site: SiteSelection | null;
  flyTo: [number, number] | null;
  onSelect: (lat: number, lng: number) => void;
}

export function MapView({ data, site, flyTo, onSelect }: Props) {
  const [showSubs, setShowSubs] = useState(true);
  const [showCases, setShowCases] = useState(true);
  const [showSchools, setShowSchools] = useState(false);
  const [showZoning, setShowZoning] = useState(true);
  const [zoom, setZoom] = useState(9);
  const [zoningError, setZoningError] = useState<string | null>(null);
  // Per tile-batch counters: warn only when a whole batch failed (a single 504 is just a slow VWorld).
  const zoningTiles = useRef({ loaded: 0, errored: 0 });

  const named154 = useMemo(
    () => data.substations.filter((s) => s.name),
    [data.substations],
  );

  return (
    <div className="h-full">
      <MapContainer center={[37.4, 127.0]} zoom={9} className="h-full" preferCanvas>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {showZoning && (
          <WMSTileLayer
            url="/api/wms"
            layers={ZONING_LAYERS}
            styles={ZONING_LAYERS}
            format="image/png"
            transparent
            version="1.3.0"
            opacity={0.5}
            minZoom={ZONING_MIN_ZOOM}
            zIndex={5}
            updateWhenIdle
            attribution='용도지역 &copy; <a href="https://www.vworld.kr">VWorld</a>'
            eventHandlers={{
              loading: () => {
                zoningTiles.current = { loaded: 0, errored: 0 };
              },
              tileload: () => {
                zoningTiles.current.loaded += 1;
                setZoningError(null);
              },
              tileerror: () => {
                zoningTiles.current.errored += 1;
              },
              load: () => {
                const { loaded, errored } = zoningTiles.current;
                setZoningError(loaded === 0 && errored > 0 ? ZONING_ERROR : null);
              },
            }}
          />
        )}
        <ClickHandler onSelect={onSelect} />
        <ZoomWatcher onZoom={setZoom} />
        <FlyTo target={flyTo} />
        {showSubs &&
          named154.map((s, i) => (
            <CircleMarker
              key={`sub-${i}`}
              center={[s.lat, s.lng]}
              radius={4}
              pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.7, weight: 1 }}
            >
              <Popup>
                <b>{s.name}</b>
                <br />
                {s.voltage ? `${Number(s.voltage.split(';')[0]) / 1000}kV` : '전압 미상'} · OSM 참고치
              </Popup>
            </CircleMarker>
          ))}
        {showCases &&
          data.cases.map((c) => (
            <CircleMarker
              key={`case-${c.id}`}
              center={[c.lat, c.lng]}
              radius={8}
              pathOptions={{
                color: CASE_COLOR[c.status],
                fillColor: CASE_COLOR[c.status],
                fillOpacity: 0.75,
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
              pathOptions={{ color: '#16a34a', fillOpacity: 0.5, weight: 1 }}
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
      </MapContainer>
      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1 rounded bg-white/95 p-2 text-xs shadow">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} />
          변전소 (OSM)
        </label>
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
        {showZoning && zoom < ZONING_MIN_ZOOM && (
          <div className="text-[11px] text-gray-500">줌 {ZONING_MIN_ZOOM} 이상으로 확대하면 표시</div>
        )}
        {showZoning && zoningError && (
          <div className="max-w-[180px] text-[11px] text-red-600">{zoningError}</div>
        )}
        {showZoning && zoom >= ZONING_MIN_ZOOM && !zoningError && (
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
      </div>
    </div>
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
