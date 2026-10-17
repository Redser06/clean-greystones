import rawBins from '../../osm_bins_2026-10-16.geojson?raw';
import { litterBinsFromGeoJson, type GeoJsonPointCollection } from '../lib/binDistance';

export const LITTER_BINS = litterBinsFromGeoJson(JSON.parse(rawBins) as GeoJsonPointCollection);
