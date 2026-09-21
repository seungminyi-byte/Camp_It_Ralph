// VWorld requires Korean egress; keep the existing Seoul edge deployment.
export const config = { runtime: 'edge', regions: ['icn1'] };
import { fetchVworld, UPSTREAM_TIMEOUT_MS, vworldEnv } from './_vworld.js';
import { ApiError, errorResponse, methodNotAllowed, Operation, queryParams } from './_http.js';

const ALLOWED_LAYERS = new Set([
  'lt_c_uq111', 'lt_c_uq112', 'lt_c_uq113', 'lt_c_uq114',
  'lt_c_ud801', 'lt_c_um710', 'lt_c_uo301', 'lt_c_agrixue101', 'lt_c_uq162',
]);
const ALLOWED_CRS = new Set(['EPSG:3857', 'EPSG:900913', 'EPSG:4326']);
function layerList(value: string): string {
  const parts = value.split(',').map((s) => s.trim().toLowerCase());
  if (!parts.length || parts.length > 4 || new Set(parts).size !== parts.length || !parts.every((p) => ALLOWED_LAYERS.has(p))) throw new ApiError('BAD_REQUEST', 400);
  return parts.join(',');
}
function imageSize(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 512) throw new ApiError('BAD_REQUEST', 400);
  return n;
}
function boundingBox(value: string, crs: string, version: string): string {
  const parts = value.split(',');
  const n = parts.map(Number);
  const limits = crs === 'EPSG:4326' ? (version === '1.3.0' ? [90, 180] : [180, 90]) : [20037508.342789244, 20037508.342789244];
  if (parts.length !== 4 || parts.some((p) => !p.trim()) || !n.every(Number.isFinite) ||
    n[0] >= n[2] || n[1] >= n[3] || n.some((v, i) => Math.abs(v) > limits[i % 2])) throw new ApiError('BAD_REQUEST', 400);
  return n.join(',');
}

/** Validate the PNG container, dimensions, allowed IHDR fields, every CRC, and terminal IEND. */
function validPng(bytes: Uint8Array, width: number, height: number): boolean {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 57 || !signature.every((v, i) => bytes[i] === v)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, hasData = false, hasPalette = false, color = -1;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) return false;
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(kind)) return false;
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(offset + 8 + length)) return false;
    if (offset === 8) {
      if (kind !== 'IHDR' || length !== 13 || view.getUint32(16) !== width || view.getUint32(20) !== height) return false;
      const depth = bytes[24]; color = bytes[25];
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] > 1) return false;
    } else if (kind === 'IHDR') return false;
    if (kind === 'PLTE') { if (!length || length % 3 || length > 768 || hasData) return false; hasPalette = true; }
    if (kind === 'IDAT') { if (color === 3 && !hasPalette) return false; hasData ||= length > 0; }
    if (kind === 'IEND') return length === 0 && hasData && offset + 12 === bytes.length;
    if (!['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(kind) && kind[0] === kind[0].toUpperCase()) return false;
    offset += length + 12;
  }
  return false;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed('GET');
  const operation = new Operation(req.signal, UPSTREAM_TIMEOUT_MS);
  try {
    const q = queryParams(req, true);
    if (q.get('request')?.toLowerCase() !== 'getmap' || q.has('format') && q.get('format')?.toLowerCase() !== 'image/png' || q.has('crs') && q.has('srs')) throw new ApiError('BAD_REQUEST', 400);
    const layers = layerList(q.get('layers') ?? '');
    const styles = q.get('styles') ? layerList(q.get('styles')!) : layers;
    const crs = (q.get('crs') ?? q.get('srs') ?? 'EPSG:3857').toUpperCase();
    const version = q.get('version') ?? '1.3.0';
    if (!ALLOWED_CRS.has(crs) || !['1.1.1', '1.3.0'].includes(version)) throw new ApiError('BAD_REQUEST', 400);
    const bbox = boundingBox(q.get('bbox') ?? '', crs, version);
    const width = imageSize(q.get('width') ?? '256'), height = imageSize(q.get('height') ?? '256');
    const { key, domain } = vworldEnv();
    const upstream = new URL('https://api.vworld.kr/req/wms');
    for (const [name, value] of Object.entries({
      service: 'WMS', request: 'GetMap', version, layers, styles,
      [version === '1.3.0' ? 'crs' : 'srs']: crs,
      bbox, width: String(width), height: String(height), format: 'image/png',
      transparent: q.get('transparent')?.toLowerCase() === 'false' ? 'false' : 'true',
      bgcolor: '0xFFFFFF', exceptions: 'text/xml',
    })) upstream.searchParams.set(name, value);
    const res = await fetchVworld(upstream, key, domain, operation);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!validPng(bytes, width, height)) throw new ApiError('UPSTREAM_INVALID');
    return new Response(bytes, { headers: {
      'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    } });
  } catch (error) { return errorResponse(error); }
  finally { operation.dispose(); }
}
