import { haversineMetres } from './geo';
import type { LitterBin } from '../types';

/** The only distance threshold used when stating a share of reports near a bin. */
export const NEAR_BIN_METRES = 50;

export interface GeoJsonPointCollection {
  features: {
    geometry?: { type?: string; coordinates?: number[] } | null;
    properties?: { amenity?: string; osm_id?: string } | null;
  }[];
}

export interface BinDistanceSummary {
  total: number;
  withinNearBin: number;
  within100m: number;
  within200m: number;
  beyond200m: number;
  /** Rounded share of reports within NEAR_BIN_METRES. Null when there are no reports. */
  withinNearBinPercent: number | null;
}

/** Litter bins only. Recycling bring-banks are not bins people can use for dog fouling. */
export function litterBinsFromGeoJson(collection: GeoJsonPointCollection): LitterBin[] {
  const bins: LitterBin[] = [];
  for (const feature of collection.features) {
    if (feature.properties?.amenity !== 'waste_basket') continue;
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lng, lat] = coords;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    bins.push({
      id: feature.properties.osm_id ?? `${lat.toFixed(5)},${lng.toFixed(5)}`,
      lat,
      lng,
    });
  }
  return bins;
}

export function distanceToNearestLitterBin(
  lat: number,
  lng: number,
  bins: LitterBin[],
): number | null {
  if (bins.length === 0) return null;
  let best = Infinity;
  for (const bin of bins) {
    const metres = haversineMetres(lat, lng, bin.lat, bin.lng);
    if (metres < best) best = metres;
  }
  return best;
}

export function summariseBinDistance(
  points: { lat: number; lng: number }[],
  bins: LitterBin[],
): BinDistanceSummary {
  const distances = points.map((point) => distanceToNearestLitterBin(point.lat, point.lng, bins));
  const known = distances.filter((metres): metres is number => metres !== null);
  const withinNearBin = known.filter((metres) => metres <= NEAR_BIN_METRES).length;
  return {
    total: points.length,
    withinNearBin,
    within100m: known.filter((metres) => metres <= 100).length,
    within200m: known.filter((metres) => metres <= 200).length,
    beyond200m: known.filter((metres) => metres > 200).length,
    withinNearBinPercent:
      points.length === 0 ? null : Math.round((withinNearBin / points.length) * 100),
  };
}

/** Single sentence for the 50 metre share. Use this everywhere that share is shown. */
export function nearBinSentence(summary: BinDistanceSummary): string {
  if (summary.withinNearBinPercent === null) {
    return 'There are no reports to compare with litter bins.';
  }
  return `${summary.withinNearBinPercent}% of reports are within ${NEAR_BIN_METRES} metres of the nearest litter bin.`;
}
