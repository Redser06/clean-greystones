import { hexToRgbChannels, type TownConfig } from './schema';

/** Applies the town colour, name, and logo before the first React paint. */
export function applyTownBranding(config: TownConfig, doc: Document = document): void {
  doc.documentElement.style.setProperty('--color-primary', hexToRgbChannels(config.branding.primaryColour));
  doc.title = config.branding.name;

  const description = doc.querySelector('meta[name="description"]');
  description?.setAttribute('content', config.branding.description);

  const theme = doc.querySelector('meta[name="theme-color"]');
  theme?.setAttribute('content', config.branding.primaryColour);

  let icon = doc.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = doc.createElement('link');
    icon.setAttribute('rel', 'icon');
    doc.head.append(icon);
  }
  icon.setAttribute('href', config.branding.logo);
  icon.setAttribute('type', 'image/svg+xml');
}
