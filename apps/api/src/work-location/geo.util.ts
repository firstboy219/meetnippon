/** Pure geodesy + office classification helpers (unit tested, no DB). */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface OfficeGeo {
  name: string;
  lat: number | null;
  lng: number | null;
  geofenceRadiusM: number;
}

/** Great-circle distance in metres (Haversine). */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Classification {
  location: 'OFFICE' | 'WFH';
  officeName: string | null;
}

/**
 * Classify a device point as OFFICE (inside some office geofence) or WFH.
 * Returns only the matched office *name* — never the raw coordinates (BRD 7.13
 * privacy: category + office name only).
 */
export function classifyLocation(point: GeoPoint, offices: OfficeGeo[]): Classification {
  let best: { name: string; dist: number } | null = null;
  for (const o of offices) {
    if (o.lat == null || o.lng == null) continue;
    const dist = haversineMeters(point, { lat: o.lat, lng: o.lng });
    if (dist <= o.geofenceRadiusM && (!best || dist < best.dist)) {
      best = { name: o.name, dist };
    }
  }
  return best ? { location: 'OFFICE', officeName: best.name } : { location: 'WFH', officeName: null };
}
