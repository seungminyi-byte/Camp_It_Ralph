export type ZoningLandUse = 'industrial' | 'semiIndustrial' | 'commercial' | 'green' | 'residential' | 'unknown';
/** Shared wire classification; scoring weights and decisions remain in the engine. */
export function landUseFromName(layer: string, name: string): ZoningLandUse {
  if (layer !== 'LT_C_UQ111') return 'green';
  if (name.includes('준공업')) return 'semiIndustrial';
  if (name.includes('공업')) return 'industrial';
  if (name.includes('상업')) return 'commercial';
  if (name.includes('주거')) return 'residential';
  if (name.includes('녹지')) return 'green';
  return 'unknown';
}
