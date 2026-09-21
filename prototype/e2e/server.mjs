import { createServer } from 'node:http';
import { readFileSync, appendFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '../dist');
mkdirSync(resolve(import.meta.dirname, './artifacts'), { recursive: true });
const log = resolve(import.meta.dirname, './artifacts/requests.jsonl');
const json = (res, value) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
const server = createServer((req, res) => {
 const url = new URL(req.url, 'http://127.0.0.1:5208');
 const long = String(req.headers.referer).includes('long-partial');
 appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), path: url.pathname, query: url.search, synthetic: true, long }) + '\n');
 if (url.pathname.startsWith('/api/')) {
  const coordinate = { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) };
  const meta = { coordinate, version: 'vworld-v2-20260921', fetchedAt: new Date().toISOString(), complete: true, failed: [] };
  if (url.pathname === '/api/geocode') return json(res, { lat: 36.4967, lng: 127.3007, label: '세종특별자치시 합성 주소', version: meta.version, fetchedAt: meta.fetchedAt });
  if (url.pathname === '/api/zoning') return json(res, { ...meta, found: true, layer: 'LT_C_UQ111', name: '공업지역', landUse: 'industrial', all: [{ layer: 'LT_C_UQ111', name: '공업지역' }], queried: ['LT_C_UQ111', 'LT_C_UQ112', 'LT_C_UQ113', 'LT_C_UQ114'] });
  if (url.pathname === '/api/restrictions') return json(res, { ...meta, bufferM: 500, hits: long ? [{ layer: 'LT_C_UO301', name: '등록문화재구역 합성 검수용 직접 관찰 HERITAGE_DIRECT_END', buffered: false }, { layer: 'LT_C_UO301', name: '역사문화환경 보존지역 합성 주변 관찰 HERITAGE_NEARBY_END', buffered: true }] : [], queried: ['LT_C_UD801', 'LT_C_UM710', 'LT_C_UO301', 'LT_C_AGRIXUE101', 'LT_C_UQ162', 'LT_C_UO301@500'], ...(long ? { complete: false, failed: ['LT_C_UM710'] } : {}) });
  if (url.pathname === '/api/disaster') return json(res, { ...meta, found: false, layer: 'LT_C_UP201', hits: [], queried: ['LT_C_UP201'] });
  if (url.pathname === '/api/generate') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'x-model': 'fixed-synthetic-response' }); res.end(readFileSync(resolve(import.meta.dirname, './ai.txt'))); return; }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('fixture-not-found'); return;
 }
 const known = ['/', '/project', '/project/', '/team', '/team/', '/review', '/review/'].includes(url.pathname);
 const path = resolve(root, known ? 'index.html' : '.' + url.pathname);
 if (!path.startsWith(root + '/') || !existsSync(path) || !statSync(path).isFile()) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end(readFileSync(resolve(root, '404.html'))); return; }
 const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.csv': 'text/csv', '.webp': 'image/webp' };
 res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }); res.end(readFileSync(path));
});
server.listen(5208, '127.0.0.1', () => console.log('08 synthetic QA server 5208 pid=' + process.pid));
