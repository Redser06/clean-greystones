export interface Cluster {
  id: string;
  lat: number;
  lng: number;
  count: number;
}

/** Groups nearby reports into one circle. cellMetres is the grid size. referenceLatitude sizes the longitude cells. */
export function clusterReports(
  reports: { id: string; lat: number; lng: number }[],
  cellMetres = 160,
  referenceLatitude = 0,
): Cluster[] {
  const groups = new Map<string, { lat: number; lng: number; count: number }>();
  const latCell = cellMetres / 111320;
  const lngCell = cellMetres / (111320 * Math.cos((referenceLatitude * Math.PI) / 180));

  for (const report of reports) {
    const key = `${Math.floor(report.lat / latCell)}:${Math.floor(report.lng / lngCell)}`;
    const group = groups.get(key) ?? { lat: 0, lng: 0, count: 0 };
    group.lat += report.lat;
    group.lng += report.lng;
    group.count += 1;
    groups.set(key, group);
  }

  return [...groups.entries()].map(([id, group]) => ({
    id,
    lat: group.lat / group.count,
    lng: group.lng / group.count,
    count: group.count,
  }));
}
