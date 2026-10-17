export interface Basemap {
  provider: 'google' | 'osm';
  url: string;
  attribution: string;
}

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

export function osmBasemap(): Basemap {
  return { provider: 'osm', url: OSM_URL, attribution: OSM_ATTRIBUTION };
}

export function googleTileUrl(apiKey: string, session: string): string {
  return `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(apiKey)}`;
}

/**
 * Google Streets when a key can open a tile session. OpenStreetMap otherwise.
 * Never uses the unsigned Google tile host.
 */
export async function basemapForKey(
  apiKey: string | undefined | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Basemap> {
  const key = apiKey?.trim();
  if (!key) return osmBasemap();

  try {
    const response = await fetchImpl(
      `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapType: 'roadmap', language: 'en-GB', region: 'IE' }),
      },
    );
    if (!response.ok) return osmBasemap();
    const data = (await response.json()) as { session?: string };
    if (!data.session) return osmBasemap();
    return {
      provider: 'google',
      url: googleTileUrl(key, data.session),
      attribution: '&copy; Google',
    };
  } catch {
    return osmBasemap();
  }
}
