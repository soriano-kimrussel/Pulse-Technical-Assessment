const KM_PER_DEG_LAT = 111.32;
const CELL_KM = 1;
const CELL_HALF_DIAGONAL_KM = CELL_KM / Math.SQRT2;
const RING_MIN_KM = 1 + CELL_HALF_DIAGONAL_KM + 0.02;
const RING_MAX_KM = 3 - CELL_HALF_DIAGONAL_KM - 0.02;

function kmPerDegLng(lat: number): number {
  return Math.max(KM_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180), 0.01);
}

function moveKm(lat: number, lng: number, distanceKm: number, bearing: number) {
  return {
    lat: lat + (distanceKm * Math.cos(bearing)) / KM_PER_DEG_LAT,
    lng: lng + (distanceKm * Math.sin(bearing)) / kmPerDegLng(lat),
  };
}

export function applyPrivacyOffset(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const cellLat = CELL_KM / KM_PER_DEG_LAT;
  const centreLat = (Math.floor(lat / cellLat) + 0.5) * cellLat;
  const cellLng = CELL_KM / kmPerDegLng(centreLat);
  const centreLng = (Math.floor(lng / cellLng) + 0.5) * cellLng;

  const r2 = RING_MIN_KM ** 2 + Math.random() * (RING_MAX_KM ** 2 - RING_MIN_KM ** 2);
  const bearing = Math.random() * 2 * Math.PI;
  let out = moveKm(centreLat, centreLng, Math.sqrt(r2), bearing);

  if (Math.abs(lat) > 85) {
    out = moveKm(lat, lng, 1 + Math.random() * 2, bearing);
  }

  return {
    lat: round(clamp(out.lat, -90, 90)),
    lng: round(wrapLng(out.lng)),
  };
}

function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
