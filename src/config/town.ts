import type { TownConfig } from './schema';
import { pickTown, townIdFromEnv } from './townSelect';

const townModules = import.meta.glob('../../data/towns/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

/** Town config for this build. Set VITE_TOWN to a file name in data/towns, without .json. */
export const town = pickTown(townIdFromEnv(import.meta.env.VITE_TOWN), townModules) as TownConfig;
