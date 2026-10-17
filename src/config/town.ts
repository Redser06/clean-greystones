import { litterBinsFromGeoJson, type GeoJsonPointCollection } from '../lib/binDistance';
import { binSourceForTown, selectTown, townIdFromEnv } from './schema';

const townModules = import.meta.glob('../../data/towns/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const binModules = import.meta.glob('../../data/bins/*.geojson', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** Town config for this build. Set VITE_TOWN to a file name in data/towns, without .json. */
export const town = selectTown(townIdFromEnv(import.meta.env.VITE_TOWN), townModules);

export const LITTER_BINS = litterBinsFromGeoJson(
  JSON.parse(binSourceForTown(town.litterBinsFile, binModules)) as GeoJsonPointCollection,
);
