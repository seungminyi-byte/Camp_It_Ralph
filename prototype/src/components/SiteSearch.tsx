import { useMemo, useRef, useState } from 'react';
import type { EmdCentroid, SiteSelection } from '../types';
import { buildEmdIndex, looksLikeLatLng, parseLatLng, searchEmd, type EmdHit } from '../search/emdSearch';
import { GEOCODE_NOT_FOUND, geocodeAddress } from '../lib/geocode';

const ZOOM = { emd: 13, coords: 15, address: 16 };

interface Props {
  centroids: EmdCentroid[];
  onPick: (selection: SiteSelection, zoom: number) => void;
}

export function SiteSearch({ centroids, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  const index = useMemo(() => buildEmdIndex(centroids), [centroids]);
  const results = useMemo(() => searchEmd(index, query), [index, query]);

  const pickEmd = (hit: EmdHit) => {
    const r = hit.entry.row;
    setQuery(hit.entry.display);
    setOpen(false);
    setHighlight(-1);
    setMessage(null);
    onPick(
      { lat: r.lat, lng: r.lng, label: `${hit.entry.display} (읍면동 중심)`, source: 'emd' },
      ZOOM.emd,
    );
  };

  const submit = async () => {
    setMessage(null);
    const q = query.trim();
    if (!q) return;

    const coords = parseLatLng(q);
    if (coords) {
      setOpen(false);
      onPick(
        { ...coords, label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, source: 'coords' },
        ZOOM.coords,
      );
      return;
    }
    if (looksLikeLatLng(q)) {
      // A pair outside Korea would otherwise fall through to geocoding and read as "address not
      // found", which hides the real reason.
      setOpen(false);
      setMessage('자료 범위 밖 좌표입니다 — 판독할 수 없습니다 (위도 33~39°, 경도 124~132° 안에서 입력하세요).');
      return;
    }
    if (highlight >= 0 && results[highlight]) return pickEmd(results[highlight]);

    const exact = results.filter((r) => r.exact);
    if (exact.length === 1) return pickEmd(exact[0]);
    if (results.length > 0) {
      setOpen(true);
      setMessage('후보가 여러 개입니다 — 목록에서 선택하세요.');
      return;
    }

    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    try {
      const hit = await geocodeAddress(q, c.signal);
      setOpen(false);
      onPick({ lat: hit.lat, lng: hit.lng, label: hit.label, source: 'geocode' }, ZOOM.address);
    } catch (e) {
      if (c.signal.aborted) return;
      setMessage(
        e instanceof Error && e.message === GEOCODE_NOT_FOUND
          ? '주소를 찾지 못했습니다. 읍면동명이나 위경도로 검색해 보세요.'
          : '온라인 주소 검색을 사용할 수 없습니다 (오프라인 또는 서버 미배포) — 읍면동명·위경도로 검색하세요.',
      );
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Handle Enter here rather than relying on implicit form submission, so picking a
      // highlighted suggestion with the keyboard behaves the same as clicking it.
      e.preventDefault();
      void submit();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setHighlight((h) => {
        const next = e.key === 'ArrowDown' ? h + 1 : h - 1;
        return (next + results.length) % results.length;
      });
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="flex gap-1"
      >
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(-1);
            setMessage(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="읍면동·주소·위경도 검색"
          aria-label="부지 검색"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="site-search-results"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
        >
          {busy ? '검색 중' : '검색'}
        </button>
      </form>

      {open && results.length > 0 && (
        <ul
          id="site-search-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded border border-gray-300 bg-white shadow"
        >
          {results.map((hit, i) => (
            <li key={`${hit.entry.display}-${hit.entry.row.lat}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pickEmd(hit)}
                className={`block w-full px-2 py-1 text-left text-sm ${
                  i === highlight ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                {hit.entry.display}
              </button>
            </li>
          ))}
        </ul>
      )}

      {message && <p className="mt-1 text-xs text-red-600">{message}</p>}
      <p className="mt-1 text-xs text-gray-400">
        읍면동명 · 도로명/지번 주소(온라인) · 위경도 "37.68, 126.74" · 또는 지도를 클릭하세요.
      </p>
    </div>
  );
}
