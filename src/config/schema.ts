export interface LatLng {
  lat: number;
  lng: number;
}

export interface TownBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface TownCouncillor {
  id: string;
  name: string;
  email: string;
}

export interface TownCouncilContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  phoneLabel?: string;
  defaultCc: boolean;
}

export interface EmailTemplate {
  id: string;
  label: string;
  description: string;
  subject: string;
  ask: string;
}

export interface DemoReportSample {
  id: string;
  lat: number;
  lng: number;
  day: number;
  monthOffset: number;
}

export interface TownConfig {
  id: string;
  name: string;
  region: string;
  timeZone: string;
  storageKey: string;
  exportSlug: string;
  map: {
    centre: LatLng;
    bounds: TownBounds;
    reportZoom: number;
    pictureZoom: number;
  };
  branding: {
    name: string;
    tagline: string;
    description: string;
    primaryColour: string;
    logo: string;
  };
  councillors: TownCouncillor[];
  councilContacts: TownCouncilContact[];
  legal: {
    offence: string;
    citationLabel: string;
    citationUrl: string;
    fineWording: string;
    fixedPaymentNote: string;
    fixedPaymentUrl: string;
    fixedPaymentLabel: string;
  };
  email: {
    greeting: string;
    intro: string;
    signOffFallback: string;
    templates: EmailTemplate[];
  };
  act: {
    intro: string;
  };
  litterBinsFile: string;
  binsNote: string;
  demoReports: DemoReportSample[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const TOWN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTPS_URL = /^https:\/\/\S+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(errors: string[], source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${path} must be a non-empty string`);
    return '';
  }
  return value;
}

function readNumber(errors: string[], source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`);
    return Number.NaN;
  }
  return value;
}

function readBoolean(errors: string[], source: Record<string, unknown>, key: string, path: string): boolean {
  const value = source[key];
  if (typeof value !== 'boolean') {
    errors.push(`${path} must be true or false`);
    return false;
  }
  return value;
}

function insideBounds(point: LatLng, bounds: TownBounds): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

function uniqueIds(errors: string[], ids: string[], path: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${path} id "${id}" is duplicated`);
    seen.add(id);
  }
}

/** Blank or missing values use the bundled Greystones config. */
export function townIdFromEnv(value: string | undefined | null): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : 'greystones';
}

export function validateTownConfig(value: unknown): TownConfig {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new Error('Town config must be a JSON object');
  }

  const id = readString(errors, value, 'id', 'id');
  if (id && !TOWN_ID.test(id)) errors.push('id must be lowercase letters, numbers, and hyphens');
  const name = readString(errors, value, 'name', 'name');
  const region = readString(errors, value, 'region', 'region');
  const timeZone = readString(errors, value, 'timeZone', 'timeZone');
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
    } catch {
      errors.push(`timeZone "${timeZone}" is not a valid IANA time zone`);
    }
  }
  const storageKey = readString(errors, value, 'storageKey', 'storageKey');
  const exportSlug = readString(errors, value, 'exportSlug', 'exportSlug');
  if (exportSlug && !TOWN_ID.test(exportSlug)) {
    errors.push('exportSlug must be lowercase letters, numbers, and hyphens');
  }

  const map = isRecord(value.map) ? value.map : null;
  if (!map) errors.push('map must be an object');
  const centreSource = map && isRecord(map.centre) ? map.centre : null;
  const boundsSource = map && isRecord(map.bounds) ? map.bounds : null;
  if (map && !centreSource) errors.push('map.centre must be an object');
  if (map && !boundsSource) errors.push('map.bounds must be an object');

  const centre: LatLng = {
    lat: centreSource ? readNumber(errors, centreSource, 'lat', 'map.centre.lat') : Number.NaN,
    lng: centreSource ? readNumber(errors, centreSource, 'lng', 'map.centre.lng') : Number.NaN,
  };
  const bounds: TownBounds = {
    south: boundsSource ? readNumber(errors, boundsSource, 'south', 'map.bounds.south') : Number.NaN,
    west: boundsSource ? readNumber(errors, boundsSource, 'west', 'map.bounds.west') : Number.NaN,
    north: boundsSource ? readNumber(errors, boundsSource, 'north', 'map.bounds.north') : Number.NaN,
    east: boundsSource ? readNumber(errors, boundsSource, 'east', 'map.bounds.east') : Number.NaN,
  };
  if (Number.isFinite(centre.lat) && (centre.lat < -90 || centre.lat > 90)) {
    errors.push('map.centre.lat must be between -90 and 90');
  }
  if (Number.isFinite(centre.lng) && (centre.lng < -180 || centre.lng > 180)) {
    errors.push('map.centre.lng must be between -180 and 180');
  }
  if (Number.isFinite(bounds.south) && Number.isFinite(bounds.north) && bounds.south >= bounds.north) {
    errors.push('map.bounds.south must be less than map.bounds.north');
  }
  if (Number.isFinite(bounds.west) && Number.isFinite(bounds.east) && bounds.west >= bounds.east) {
    errors.push('map.bounds.west must be less than map.bounds.east');
  }
  if (
    [centre.lat, centre.lng, bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite) &&
    !insideBounds(centre, bounds)
  ) {
    errors.push('map.centre must sit inside map.bounds');
  }

  const reportZoom = map ? readNumber(errors, map, 'reportZoom', 'map.reportZoom') : Number.NaN;
  const pictureZoom = map ? readNumber(errors, map, 'pictureZoom', 'map.pictureZoom') : Number.NaN;
  for (const [label, zoom] of [
    ['map.reportZoom', reportZoom],
    ['map.pictureZoom', pictureZoom],
  ] as const) {
    if (Number.isFinite(zoom) && (zoom < 1 || zoom > 19 || !Number.isInteger(zoom))) {
      errors.push(`${label} must be an integer from 1 to 19`);
    }
  }

  const branding = isRecord(value.branding) ? value.branding : null;
  if (!branding) errors.push('branding must be an object');
  const brandingName = branding ? readString(errors, branding, 'name', 'branding.name') : '';
  const tagline = branding ? readString(errors, branding, 'tagline', 'branding.tagline') : '';
  const description = branding ? readString(errors, branding, 'description', 'branding.description') : '';
  const primaryColour = branding ? readString(errors, branding, 'primaryColour', 'branding.primaryColour') : '';
  if (primaryColour && !HEX_COLOUR.test(primaryColour)) {
    errors.push('branding.primaryColour must be a #rrggbb colour');
  }
  const logo = branding ? readString(errors, branding, 'logo', 'branding.logo') : '';
  if (logo && (!logo.startsWith('/') || logo.includes('..'))) {
    errors.push('branding.logo must be an absolute public path');
  }

  const councillors: TownCouncillor[] = [];
  if (!Array.isArray(value.councillors) || value.councillors.length === 0) {
    errors.push('councillors must list at least one person');
  } else {
    value.councillors.forEach((entry, index) => {
      const path = `councillors[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${path} must be an object`);
        return;
      }
      const councillorId = readString(errors, entry, 'id', `${path}.id`);
      const councillorName = readString(errors, entry, 'name', `${path}.name`);
      const email = readString(errors, entry, 'email', `${path}.email`);
      if (email && !EMAIL.test(email)) errors.push(`${path}.email is not an email address`);
      councillors.push({ id: councillorId, name: councillorName, email });
    });
    uniqueIds(errors, councillors.map((councillor) => councillor.id), 'councillors');
  }

  const councilContacts: TownCouncilContact[] = [];
  if (!Array.isArray(value.councilContacts)) {
    errors.push('councilContacts must be an array');
  } else {
    value.councilContacts.forEach((entry, index) => {
      const path = `councilContacts[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${path} must be an object`);
        return;
      }
      const contactId = readString(errors, entry, 'id', `${path}.id`);
      const contactName = readString(errors, entry, 'name', `${path}.name`);
      const email = typeof entry.email === 'string' ? entry.email : undefined;
      const phone = typeof entry.phone === 'string' ? entry.phone : undefined;
      const phoneLabel = typeof entry.phoneLabel === 'string' ? entry.phoneLabel : undefined;
      if (entry.email !== undefined && (typeof email !== 'string' || !EMAIL.test(email))) {
        errors.push(`${path}.email is not an email address`);
      }
      if (entry.phone !== undefined && (typeof phone !== 'string' || phone.trim() === '')) {
        errors.push(`${path}.phone must be a non-empty string`);
      }
      if (!email && !phone) errors.push(`${path} needs an email or a phone number`);
      const defaultCc = readBoolean(errors, entry, 'defaultCc', `${path}.defaultCc`);
      if (defaultCc && !email) errors.push(`${path} cannot be copied on email without an email address`);
      councilContacts.push({ id: contactId, name: contactName, email, phone, phoneLabel, defaultCc });
    });
    uniqueIds(errors, councilContacts.map((contact) => contact.id), 'councilContacts');
  }

  const legalSource = isRecord(value.legal) ? value.legal : null;
  if (!legalSource) errors.push('legal must be an object');
  const legal = {
    offence: legalSource ? readString(errors, legalSource, 'offence', 'legal.offence') : '',
    citationLabel: legalSource ? readString(errors, legalSource, 'citationLabel', 'legal.citationLabel') : '',
    citationUrl: legalSource ? readString(errors, legalSource, 'citationUrl', 'legal.citationUrl') : '',
    fineWording: legalSource ? readString(errors, legalSource, 'fineWording', 'legal.fineWording') : '',
    fixedPaymentNote: legalSource
      ? readString(errors, legalSource, 'fixedPaymentNote', 'legal.fixedPaymentNote')
      : '',
    fixedPaymentUrl: legalSource ? readString(errors, legalSource, 'fixedPaymentUrl', 'legal.fixedPaymentUrl') : '',
    fixedPaymentLabel: legalSource
      ? readString(errors, legalSource, 'fixedPaymentLabel', 'legal.fixedPaymentLabel')
      : '',
  };
  if (legal.citationUrl && !HTTPS_URL.test(legal.citationUrl)) errors.push('legal.citationUrl must be an https URL');
  if (legal.fixedPaymentUrl && !HTTPS_URL.test(legal.fixedPaymentUrl)) {
    errors.push('legal.fixedPaymentUrl must be an https URL');
  }

  const emailSource = isRecord(value.email) ? value.email : null;
  if (!emailSource) errors.push('email must be an object');
  const greeting = emailSource ? readString(errors, emailSource, 'greeting', 'email.greeting') : '';
  const intro = emailSource ? readString(errors, emailSource, 'intro', 'email.intro') : '';
  const signOffFallback = emailSource
    ? readString(errors, emailSource, 'signOffFallback', 'email.signOffFallback')
    : '';
  const templates: EmailTemplate[] = [];
  if (!emailSource || !Array.isArray(emailSource.templates) || emailSource.templates.length === 0) {
    errors.push('email.templates must list at least one template');
  } else {
    emailSource.templates.forEach((entry, index) => {
      const path = `email.templates[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${path} must be an object`);
        return;
      }
      templates.push({
        id: readString(errors, entry, 'id', `${path}.id`),
        label: readString(errors, entry, 'label', `${path}.label`),
        description: readString(errors, entry, 'description', `${path}.description`),
        subject: readString(errors, entry, 'subject', `${path}.subject`),
        ask: readString(errors, entry, 'ask', `${path}.ask`),
      });
    });
    uniqueIds(errors, templates.map((template) => template.id), 'email.templates');
  }

  const act = isRecord(value.act) ? value.act : null;
  if (!act) errors.push('act must be an object');
  const actIntro = act ? readString(errors, act, 'intro', 'act.intro') : '';

  const litterBinsFile = readString(errors, value, 'litterBinsFile', 'litterBinsFile');
  if (litterBinsFile && !/^data\/bins\/[a-z0-9.-]+\.geojson$/.test(litterBinsFile)) {
    errors.push('litterBinsFile must point at a file under data/bins/');
  }
  const binsNote = readString(errors, value, 'binsNote', 'binsNote');

  const demoReports: DemoReportSample[] = [];
  if (!Array.isArray(value.demoReports)) {
    errors.push('demoReports must be an array');
  } else {
    value.demoReports.forEach((entry, index) => {
      const path = `demoReports[${index}]`;
      if (!isRecord(entry)) {
        errors.push(`${path} must be an object`);
        return;
      }
      const sample: DemoReportSample = {
        id: readString(errors, entry, 'id', `${path}.id`),
        lat: readNumber(errors, entry, 'lat', `${path}.lat`),
        lng: readNumber(errors, entry, 'lng', `${path}.lng`),
        day: readNumber(errors, entry, 'day', `${path}.day`),
        monthOffset: readNumber(errors, entry, 'monthOffset', `${path}.monthOffset`),
      };
      if (Number.isFinite(sample.day) && (!Number.isInteger(sample.day) || sample.day < 1 || sample.day > 31)) {
        errors.push(`${path}.day must be an integer from 1 to 31`);
      }
      if (Number.isFinite(sample.monthOffset) && !Number.isInteger(sample.monthOffset)) {
        errors.push(`${path}.monthOffset must be an integer`);
      }
      if (
        [sample.lat, sample.lng, bounds.south, bounds.north, bounds.west, bounds.east].every(Number.isFinite) &&
        bounds.south < bounds.north &&
        bounds.west < bounds.east &&
        !insideBounds(sample, bounds)
      ) {
        errors.push(`${path} must sit inside map.bounds`);
      }
      demoReports.push(sample);
    });
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return {
    id,
    name,
    region,
    timeZone,
    storageKey,
    exportSlug,
    map: { centre, bounds, reportZoom, pictureZoom },
    branding: { name: brandingName, tagline, description, primaryColour, logo },
    councillors,
    councilContacts,
    legal,
    email: { greeting, intro, signOffFallback, templates },
    act: { intro: actIntro },
    litterBinsFile,
    binsNote,
    demoReports,
  };
}

export function selectTown(id: string, available: Record<string, unknown>): TownConfig {
  const matches = Object.entries(available).filter(([path]) => path.endsWith(`/${id}.json`));
  if (matches.length !== 1) {
    const known = Object.keys(available)
      .map((path) => path.split('/').pop()?.replace(/\.json$/, ''))
      .filter((name): name is string => Boolean(name))
      .sort()
      .join(', ');
    throw new Error(`Unknown town "${id}". Configured towns: ${known || 'none'}.`);
  }
  const config = validateTownConfig(matches[0][1]);
  if (config.id !== id) {
    throw new Error(`Town file ${id}.json declares id "${config.id}".`);
  }
  return config;
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
