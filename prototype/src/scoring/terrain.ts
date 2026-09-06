import type {
  Constants,
  ReclaimedOverride,
  ScoreResult,
  TerrainGrid,
  TerrainGridFile,
  TerrainSample,
} from '../types';

type TerrainConfig = Constants['scoring']['terrain'];

function decodePlane(b64: string, expected: number, name: string): Uint8Array {
  const bin = atob(b64);
  if (bin.length !== expected) {
    throw new Error(`terrain plane ${name}: ${bin.length} bytes, expected ${expected}`);
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** Decode terrain_grid.json once at load time; scoreSite runs on every slider move. */
export function decodeTerrain(file: TerrainGridFile): TerrainGrid {
  const g = file.grid;
  const size = g.rows * g.cols;
  return {
    lat0: g.lat0,
    lng0: g.lng0,
    step: g.step,
    rows: g.rows,
    cols: g.cols,
    nodata: file.encoding.nodata,
    steepThresholdDeg: file.method.steepThresholdDeg,
    source: file.source,
    attribution: file.attribution,
    landPct: decodePlane(file.planes.landPct, size, 'landPct'),
    slopeP50Deg: decodePlane(file.planes.slopeP50Deg, size, 'slopeP50Deg'),
    steepPct: decodePlane(file.planes.steepPct, size, 'steepPct'),
    elevMean10m: decodePlane(file.planes.elevMean10m, size, 'elevMean10m'),
  };
}

/** Grid cell covering the point, or null outside the grid / where no tile was available. */
export function lookupTerrain(
  grid: TerrainGrid,
  lat: number,
  lng: number,
): TerrainSample | null {
  const row = Math.floor((lat - grid.lat0) / grid.step + 1e-9);
  const col = Math.floor((lng - grid.lng0) / grid.step + 1e-9);
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return null;
  const i = row * grid.cols + col;
  if (grid.landPct[i] === grid.nodata) return null;
  return {
    landPct: grid.landPct[i],
    slopeP50Deg: grid.slopeP50Deg[i],
    steepPct: grid.steepPct[i],
    elevM: grid.elevMean10m[i] * 10,
    row,
    col,
  };
}

export function findReclaimedOverride(
  list: ReclaimedOverride[],
  lat: number,
  lng: number,
): ReclaimedOverride | null {
  for (const o of list) {
    const [minLat, minLng, maxLat, maxLng] = o.bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) return o;
  }
  return null;
}

/**
 * Land / water verdict. SRTM was flown in 2000 and its water mask still covers land reclaimed
 * since (송도, 새만금, 시화), so a water cell is only rescued by objective evidence: a curated
 * override box or a VWorld 용도지역 polygon. A user cannot manually turn open water into land.
 */
export function classifySite(
  sample: TerrainSample | null,
  override: ReclaimedOverride | null,
  cfg: TerrainConfig,
  opts: { zoningFound: boolean | null },
): ScoreResult['site'] {
  if (!sample) {
    return {
      status: 'nodata',
      eligible: false,
      label: '지형 데이터 없음',
      detail: '지형 격자 범위 밖이거나 해당 셀의 표고 자료가 없습니다 (도서·국외 지역).',
      override: null,
    };
  }
  const { landPct } = sample;
  if (landPct >= cfg.coastalMaxLandPct) {
    return {
      status: 'ok',
      eligible: true,
      label: '육지',
      detail: `1km 격자 육지 비율 ${landPct}%`,
      override: null,
    };
  }
  if (landPct > cfg.seaMaxLandPct && opts.zoningFound === true) {
    return {
      status: 'coastal',
      eligible: true,
      label: '연안 육지',
      detail: `1km 격자 육지 비율 ${landPct}%이며 클릭 지점의 용도지역이 확인되었습니다. 해안선에 가까워 경계와 지반 상태를 추가 확인해야 합니다.`,
      override: null,
    };
  }
  const water = `1km 격자 육지 비율 ${landPct}%`;
  if (override) {
    return {
      status: 'reclaimed',
      eligible: true,
      label: '매립·간척지',
      detail: `${water}이지만 ${override.name} 매립지로 등재된 구역입니다 (SRTM 2000년 촬영 기준이라 수역으로 기록). 연약지반·지반고 검토가 필요합니다.`,
      override: override.name,
    };
  }
  if (landPct > cfg.seaMaxLandPct && opts.zoningFound === null) {
    return {
      status: 'coastal',
      eligible: false,
      label: '연안·수변 판정 보류',
      detail: `1km 격자 육지 비율 ${landPct}% — 해안선에 걸친 셀로, 클릭 지점의 용도지역이 확인될 때까지 평가하지 않습니다.`,
      override: null,
    };
  }
  if (opts.zoningFound) {
    return {
      status: 'reclaimed',
      eligible: true,
      label: '매립지·공유수면 가능성',
      detail: `${water}이지만 용도지역이 지정된 구역입니다. 매립지 또는 공유수면 매립 예정지로 보이며 연약지반·지반고 검토가 필요합니다.`,
      override: null,
    };
  }
  return {
    status: 'sea',
    eligible: false,
    label: '판정 부적합 — 해상·수역',
    detail: `${water}이며 클릭 지점에서 육지임을 뒷받침하는 용도지역이 확인되지 않았습니다. 바다 또는 수면으로 판정되어 데이터센터 부지 평가 대상에서 제외합니다.`,
    override: null,
  };
}

/** Slope penalty from the cell's median slope; steepPct decides the "unsuitable" flag. */
export function slopeDeduction(
  sample: TerrainSample,
  cfg: TerrainConfig,
): { points: number; band: string; unsuitable: boolean } {
  const band =
    cfg.slopeDeduction.find((b) => sample.slopeP50Deg <= b.maxP50Deg) ??
    cfg.slopeDeduction[cfg.slopeDeduction.length - 1];
  const unsuitable =
    sample.slopeP50Deg >= cfg.unsuitable.minP50Deg ||
    sample.steepPct >= cfg.unsuitable.minSteepPct;
  return {
    points: unsuitable ? Math.max(band.deduction, cfg.unsuitable.minDeduction) : band.deduction,
    band: band.label,
    unsuitable,
  };
}
