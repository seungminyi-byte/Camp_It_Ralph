// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SafeExternalLink } from './SafeExternalLink';
import { safeExternalUrl } from '../lib/safeExternalUrl';
import { ChecklistReport } from './ChecklistReport';
import { AnalysisDetails } from './AnalysisDetails';
import { EvidenceList } from './ReviewFacts';
import { MapView } from './MapView';
import { loadAppData, loadScenarios } from '../test/loadData';
import { scoreSite } from '../scoring/engine';
import { buildChecklist } from '../report/checklist';
import type { AppData } from '../types';
vi.mock('../hooks/useNearbySites', () => ({ useNearbySites: () => ({ status: 'idle', lookup: null }) }));
vi.mock('react-leaflet', () => {
  const element = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const map = { getZoom: () => 9, getBounds: () => ({ getSouth: () => 30, getNorth: () => 40, getWest: () => 120, getEast: () => 140 }), getContainer: () => document.body };
  return { Circle: element, CircleMarker: element, MapContainer: element, Marker: element, Polygon: element, Popup: element, TileLayer: () => null, WMSTileLayer: () => null, useMap: () => map, useMapEvents: () => map };
});
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe('safe external source navigation in rendered DOM', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//example.org', 'https://example.org/\nattack', 'https://example.org/%0Aattack', 'https://user:pass@example.org', 'ftp://example.org', 'https:\\example.org', 'https://example.org/\u0085'])('renders unsafe URL %j as ordinary escaped text', async href => {
    expect(safeExternalUrl(href)).toBeNull();
    await act(async () => root.render(<SafeExternalLink href={href}>{'<img src=x onerror=alert(1)>'}</SafeExternalLink>));
    expect(container.querySelector('a')).toBeNull(); expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toBe('<img src=x onerror=alert(1)>');
  });
  it.each(['https://example.org/source', 'http://example.org/source'])('keeps web URL %s with opener isolation', async href => {
    await act(async () => root.render(<SafeExternalLink href={href}>출처</SafeExternalLink>));
    expect(container.querySelector('a')?.href).toBe(href); expect(container.querySelector('a')?.rel).toBe('noopener noreferrer');
  });
  it('applies the boundary in report, detail, evidence and map source consumers', async () => {
    const data = loadAppData(), scenario = loadScenarios()[2];
    const input = { lat: scenario.lat, lng: scenario.lng, landUse: scenario.landUse };
    const result = scoreSite(input, data);
    const malicious = '<img src=x onerror=alert(1)>';
    result.evidence[0] = { ...result.evidence[0], source: malicious, sourceUrl: 'javascript:alert(1)' };
    result.permit.matchedCases = [{ ...data.cases[0], name: malicious, source_url: 'data:text/html,<script>alert(1)</script>' }];
    if (result.permit.newsSignal) result.permit.newsSignal = { ...result.permit.newsSignal, row: { ...result.permit.newsSignal.row, top: result.permit.newsSignal.row.top.map(article => ({ ...article, title: malicious, link: 'javascript:alert(1)' })) } };
    const rows = buildChecklist(result, data, { input, landUseSource: 'manual', zoningName: null });
    rows[0].sources = ['javascript:alert(1)', 'https://example.org/safe'];
    const mapData: AppData = { ...data, cases: result.permit.matchedCases, substations: [], schools: [], protectedZones: null, dataCenters: { version: 1, asOf: '2026-09-21', scope: 'test', classification: { edgeSmall: '', colocation: '', hyperscale: '' }, sites: [{ id: 'malicious', name: malicious, category: 'edgeSmall', categoryReason: '', lat: 36, lng: 127, address: 'test', status: 'operational', openedYear: null, capacityMw: null, capacityKind: null, scaleNote: '', sourceName: malicious, sourceUrl: 'javascript:alert(1)', coordinateBasis: '' }] } };
    await act(async () => root.render(<><ChecklistReport data={data} input={input} result={result} rows={rows} site={{ ...input, source: 'coords' }} landUseSource="manual" zoningName={null} memo={null} generatedBy={null} generatedAt={null} variant="print" /><AnalysisDetails data={data} result={result} onFlyTo={() => {}} /><EvidenceList result={result} /><MapView data={mapData} site={null} flyTo={null} highlightZoneIds={[]} onSelect={() => {}} /></>));
    expect(container.querySelectorAll('script,img')).toHaveLength(0); expect(container.textContent).toContain(malicious);
    for (const link of container.querySelectorAll('a')) { expect(link.href).toMatch(/^https?:\/\//); expect(link.rel).toBe('noopener noreferrer'); }
    expect(container.querySelector('a[href="https://example.org/safe"]')).not.toBeNull();
  });
});
