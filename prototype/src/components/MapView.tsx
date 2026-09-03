import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
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
        <ClickHandler onSelect={onSelect} />
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
