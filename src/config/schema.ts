import { z } from 'zod';
import { pickTown } from './townSelect';

export { binSourceForTown, hexToRgbChannels, townIdFromEnv } from './townSelect';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const TOWN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTPS_URL = /^https:\/\/\S+$/;

const requiredText = z.string().refine((value) => value.trim().length > 0, 'must be a non-empty string');

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const boundsSchema = z.object({
  south: z.number(),
  west: z.number(),
  north: z.number(),
  east: z.number(),
});

const councillorSchema = z.object({
  id: requiredText,
  name: requiredText,
  email: z.string().regex(EMAIL, 'email is not an email address'),
});

const councilContactSchema = z
  .object({
    id: requiredText,
    name: requiredText,
    email: z.string().regex(EMAIL, 'email is not an email address').optional(),
    phone: requiredText.optional(),
    phoneLabel: requiredText.optional(),
    defaultCc: z.boolean(),
  })
  .superRefine((contact, ctx) => {
    if (!contact.email && !contact.phone) {
      ctx.addIssue('needs an email or a phone number');
    }
    if (contact.defaultCc && !contact.email) {
      ctx.addIssue('cannot be copied on email without an email address');
    }
  });

const emailTemplateSchema = z.object({
  id: requiredText,
  label: requiredText,
  description: requiredText,
  subject: requiredText,
  ask: requiredText,
});

const demoReportSchema = z.object({
  id: requiredText,
  lat: z.number(),
  lng: z.number(),
  day: z.number().int().min(1).max(31),
  monthOffset: z.number().int(),
});

export const townConfigSchema = z
  .object({
    id: z.string().regex(TOWN_ID, 'id must be lowercase letters, numbers, and hyphens'),
    name: requiredText,
    region: requiredText,
    timeZone: requiredText.refine((zone) => {
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date());
        return true;
      } catch {
        return false;
      }
    }, 'timeZone is not a valid IANA time zone'),
    storageKey: requiredText,
    exportSlug: z.string().regex(TOWN_ID, 'exportSlug must be lowercase letters, numbers, and hyphens'),
    map: z.object({
      centre: latLngSchema,
      bounds: boundsSchema,
      reportZoom: z.number().int().min(1).max(19),
      pictureZoom: z.number().int().min(1).max(19),
    }),
    branding: z.object({
      name: requiredText,
      tagline: requiredText,
      description: requiredText,
      primaryColour: z.string().regex(HEX_COLOUR, 'branding.primaryColour must be a #rrggbb colour'),
      logo: requiredText.refine(
        (logo) => logo.startsWith('/') && !logo.includes('..'),
        'branding.logo must be an absolute public path',
      ),
    }),
    councillors: z.array(councillorSchema).min(1, 'councillors must list at least one person'),
    councilContacts: z.array(councilContactSchema),
    legal: z.object({
      offence: requiredText,
      citationLabel: requiredText,
      citationUrl: z.string().regex(HTTPS_URL, 'legal.citationUrl must be an https URL'),
      fineWording: requiredText,
      fixedPaymentNote: requiredText,
      fixedPaymentUrl: z.string().regex(HTTPS_URL, 'legal.fixedPaymentUrl must be an https URL'),
      fixedPaymentLabel: requiredText,
    }),
    email: z.object({
      greeting: requiredText,
      intro: requiredText,
      signOffFallback: requiredText,
      templates: z.array(emailTemplateSchema).min(1, 'email.templates must list at least one template'),
    }),
    act: z.object({
      intro: requiredText,
    }),
    litterBinsFile: z
      .string()
      .regex(/^data\/bins\/[a-z0-9.-]+\.geojson$/, 'litterBinsFile must point at a file under data/bins/'),
    binsNote: requiredText,
    demoReports: z.array(demoReportSchema),
  })
  .superRefine((config, ctx) => {
    const { centre, bounds } = config.map;
    if (bounds.south >= bounds.north) ctx.addIssue('map.bounds.south must be less than map.bounds.north');
    if (bounds.west >= bounds.east) ctx.addIssue('map.bounds.west must be less than map.bounds.east');
    if (!insideBounds(centre, bounds)) ctx.addIssue('map.centre must sit inside map.bounds');
    config.demoReports.forEach((sample, index) => {
      if (!insideBounds(sample, bounds)) ctx.addIssue(`demoReports.${index} must sit inside map.bounds`);
    });
    noteDuplicateIds(config.councillors, 'councillors', ctx);
    noteDuplicateIds(config.councilContacts, 'councilContacts', ctx);
    noteDuplicateIds(config.email.templates, 'email.templates', ctx);
  });

export type TownConfig = z.infer<typeof townConfigSchema>;
export type LatLng = TownConfig['map']['centre'];
export type TownBounds = TownConfig['map']['bounds'];
export type TownCouncillor = TownConfig['councillors'][number];
export type TownCouncilContact = TownConfig['councilContacts'][number];
export type EmailTemplate = TownConfig['email']['templates'][number];
export type DemoReportSample = TownConfig['demoReports'][number];

function insideBounds(point: { lat: number; lng: number }, bounds: TownBounds): boolean {
  return (
    point.lat >= bounds.south &&
    point.lat <= bounds.north &&
    point.lng >= bounds.west &&
    point.lng <= bounds.east
  );
}

function noteDuplicateIds(
  items: { id: string }[],
  label: string,
  ctx: { addIssue: (issue: string) => void },
) {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) ctx.addIssue(`${label} id "${item.id}" is duplicated`);
    seen.add(item.id);
  }
}

export function validateTownConfig(value: unknown): TownConfig {
  const parsed = townConfigSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('\n');
    throw new Error(details);
  }
  return parsed.data;
}

export function selectTown(id: string, available: Record<string, unknown>): TownConfig {
  return validateTownConfig(pickTown(id, available));
}
