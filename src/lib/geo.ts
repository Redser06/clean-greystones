export const GREYSTONES_CENTRE = { lat: 53.1443, lng: -6.0632 };

export function roundCoord(value: number): number {
  return Number(value.toFixed(6));
}

/** Distance in metres between two WGS84 points. */
export function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earth = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
