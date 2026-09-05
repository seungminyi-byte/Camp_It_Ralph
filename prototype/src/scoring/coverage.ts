import type { Constants } from '../types';
import { inBbox, isNorthOfBoundary } from './geo';

type CoverageConfig = Constants['scoring']['coverage'];

export type CoverageReason = 'bbox' | 'north' | 'far';

export interface CoverageVerdict {
  outside: boolean;
  reason: CoverageReason | null;
  /** Korean sentence for the card; empty when inside */
  detail: string;
}

export interface NearestEmd {
  label: string;
  distanceKm: number;
}

/**
 * Whether the bundled land data can say anything about this point. Three checks in
 * order: outside the bounding box, north of the MDL/NLL line, or farther from every 읍면동 centroid
 * than `emdOutsideKm` (대마도, 독도, open sea). Anything inside is left to classifySite().
 */
export function classifyCoverage(
  lat: number,
  lng: number,
  nearestEmd: NearestEmd | null,
  cfg: CoverageConfig,
): CoverageVerdict {
  if (!inBbox(lat, lng, cfg.bbox)) {
    const [minLat, minLng, maxLat, maxLng] = cfg.bbox;
    return {
      outside: true,
      reason: 'bbox',
      detail: `자료 범위(위도 ${minLat}~${maxLat}°·경도 ${minLng}~${maxLng}°) 밖 지점입니다.`,
    };
  }
  if (isNorthOfBoundary(lat, lng, cfg.northernBoundary)) {
    return { outside: true, reason: 'north', detail: '군사분계선(휴전선)·NLL 이북 지점입니다.' };
  }
  if (!nearestEmd || nearestEmd.distanceKm > cfg.emdOutsideKm) {
    const where = nearestEmd
      ? `가장 가까운 읍면동 자료(${nearestEmd.label})까지 ${Math.round(nearestEmd.distanceKm)}km — `
      : '';
    return {
      outside: true,
      reason: 'far',
      detail: `${where}육상 자료 범위를 벗어난 지점입니다 (원거리 도서·먼바다·국외).`,
    };
  }
  return { outside: false, reason: null, detail: '' };
}
