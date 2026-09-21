// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { loadAppData } from '../test/loadData';
vi.mock('react-leaflet', () => ({ MapContainer: ({ center, zoom }: { center: number[]; zoom: number }) => <output>{center.join(',')}|{zoom}</output>, Circle: () => null, CircleMarker: () => null, Marker: () => null, Polygon: () => null, Popup: () => null, TileLayer: () => null, WMSTileLayer: () => null, useMap: () => null, useMapEvents: () => null }));
vi.mock('../hooks/useNearbySites', () => ({ useNearbySites: () => ({ status: 'idle', result: null, retry: () => {} }) }));
import { MapView } from './MapView';
it('restored selection initializes the map view without resetting a mounted map on later prop updates', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  const box = document.createElement('div'); document.body.append(box); const root = createRoot(box);
  const props = { data: loadAppData(), flyTo: null, highlightZoneIds: [], onSelect: () => {} };
  try {
    await act(async () => root.render(<MapView {...props} site={{ lat: 36.4967, lng: 127.3007, source: 'coords' }} />)); expect(box.querySelector('output')?.textContent).toBe('36.4967,127.3007|13');
    await act(async () => root.render(<MapView {...props} site={{ lat: 37, lng: 128, source: 'map' }} />)); expect(box.querySelector('output')?.textContent).toBe('36.4967,127.3007|13');
    await act(async () => root.render(<MapView key="new-review" {...props} site={{ lat: 37, lng: 128, source: 'coords' }} />)); expect(box.querySelector('output')?.textContent).toBe('37,128|13');
    await act(async () => root.render(<MapView key="empty-review" {...props} site={null} />)); expect(box.querySelector('output')?.textContent).toBe('37.4,127|9');
  } finally { await act(async () => root.unmount()); box.remove(); vi.unstubAllGlobals(); }
});
