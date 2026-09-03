const EARTH_R_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(a));
}

export function nearest<T>(
  lat: number,
  lng: number,
  items: T[],
  getLatLng: (item: T) => [number, number],
): { item: T; distanceKm: number } | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const it of items) {
    const [la, ln] = getLatLng(it);
    const dLat = Math.abs(la - lat);
    const dLng = Math.abs(ln - lng);
    if (dLat > 1 || dLng > 1) continue;
    const d = haversineKm(lat, lng, la, ln);
    if (d < bestD) {
      bestD = d;
      best = it;
    }
  }
  if (best === null) {
    for (const it of items) {
      const [la, ln] = getLatLng(it);
      const d = haversineKm(lat, lng, la, ln);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
  }
  return best === null ? null : { item: best, distanceKm: bestD };
}

export function sumWithinKm<T>(
  lat: number,
  lng: number,
  items: T[],
  getLatLng: (item: T) => [number, number],
  radiusKm: number,
  getValue: (item: T) => number,
): number {
  let sum = 0;
  const latPad = radiusKm / 111 + 0.001;
  const lngPad = radiusKm / 88 + 0.001;
  for (const it of items) {
    const [la, ln] = getLatLng(it);
    if (Math.abs(la - lat) > latPad || Math.abs(ln - lng) > lngPad) continue;
    if (haversineKm(lat, lng, la, ln) <= radiusKm) sum += getValue(it);
  }
  return sum;
}
