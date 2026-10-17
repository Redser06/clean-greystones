/** Blank or missing values use the bundled Greystones config. */
export function townIdFromEnv(value: string | undefined | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'greystones';
}

function configuredTowns(available: Record<string, unknown>): string {
  return Object.keys(available)
    .map((path) => path.split('/').pop()?.replace(/\.json$/, ''))
    .filter((name): name is string => Boolean(name))
    .sort()
    .join(', ');
}

/** Finds a town file. Shape is checked at build time, not in the browser. */
export function pickTown(id: string, available: Record<string, unknown>): unknown {
  const matches = Object.entries(available).filter(([path]) => path.endsWith(`/${id}.json`));
  if (matches.length !== 1) {
    const known = configuredTowns(available);
    throw new Error(`Unknown town "${id}". Configured towns: ${known || 'none'}.`);
  }
  const value = matches[0][1];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Town file ${id}.json is not an object.`);
  }
  const declared = (value as { id?: unknown }).id;
  if (declared !== id) {
    throw new Error(`Town file ${id}.json declares id "${String(declared)}".`);
  }
  return value;
}

/** Picks the raw GeoJSON string whose file name matches the town config. */
export function binSourceForTown(litterBinsFile: string, sources: Record<string, string>): string {
  const fileName = litterBinsFile.split('/').pop();
  const matches = Object.entries(sources).filter(([path]) => fileName && path.endsWith(`/${fileName}`));
  if (matches.length !== 1) {
    throw new Error(`Litter bin file not found: ${litterBinsFile}`);
  }
  return matches[0][1];
}

export function hexToRgbChannels(hex: string): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) throw new Error(`Expected a #rrggbb colour, received ${hex}`);
  const value = Number.parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}
