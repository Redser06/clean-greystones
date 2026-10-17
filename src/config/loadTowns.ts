import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectTown, townIdFromEnv, type TownConfig } from './schema';

export function readTownCatalog(root: string): Record<string, unknown> {
  const dir = join(root, 'data/towns');
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    throw new Error(`Town config directory not found: ${dir}`);
  }
  const available: Record<string, unknown> = {};
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    available[`data/towns/${name}`] = JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown;
  }
  return available;
}

/** Throws a build error when VITE_TOWN does not name a valid config and bin file. */
export function assertTownBuild(root: string, townEnv: string | undefined): TownConfig {
  const id = townIdFromEnv(townEnv);
  let config: TownConfig;
  try {
    config = selectTown(id, readTownCatalog(root));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The town config could not be read.';
    throw new Error(`VITE_TOWN=${id} cannot be built.\n${message}`, { cause: error });
  }
  if (!existsSync(join(root, config.litterBinsFile))) {
    throw new Error(`VITE_TOWN=${id} cannot be built.\nLitter bin file not found: ${config.litterBinsFile}`);
  }
  return config;
}
