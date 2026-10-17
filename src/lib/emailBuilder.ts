import { ENVIRONMENT_OFFICE_EMAIL, GREYSTONES_COUNCILLORS } from '../data/councillors';
import type { ToneId } from '../types';
import {
  FIXED_PENALTY_WORDING,
  LITTER_ACT_OFFENCE,
  LITTER_ACT_SECTION_22_URL,
} from './legal';
import { trendClause, type MonthStat } from './monthlyStat';

export interface ToneOption {
  id: ToneId;
  label: string;
  description: string;
  subject: string;
  ask: string;
}

export const TONE_OPTIONS: ToneOption[] = [
  {
    id: 'factual',
    label: 'A factual note',
    description: 'Share the reports logged this month and ask for them to be noted.',
    subject: 'Dog fouling reports in Greystones',
    ask: 'I would be grateful if these reports could be noted at the next Greystones Municipal District meeting.',
  },
  {
    id: 'patrols',
    label: 'A request for patrols',
    description: 'Ask for attention on busy footpaths and the seafront.',
    subject: 'Request for patrols in Greystones',
    ask: 'I would be grateful if litter patrols could include the seafront, Church Road and other busy footpaths, especially on weekend mornings.',
  },
  {
    id: 'bins',
    label: 'A request for bins',
    description: 'Ask the council to look at bins on walking routes.',
    subject: 'Request for bins on Greystones walking routes',
    ask: 'I would be grateful if the council could review litter bins on walking routes in Greystones.',
  },
];

export interface EmailDraft {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  mailto: string;
  plainText: string;
  canSend: boolean;
}

export function cleanSignOff(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  return cleaned || 'A Greystones resident';
}

export function reportNoun(count: number): string {
  return count === 1 ? '1 report' : `${count} reports`;
}

export function buildEmailBody(tone: ToneOption, stat: MonthStat, signOff: string): string {
  return [
    'Dear councillors,',
    '',
    'I am a resident of Greystones, Co. Wicklow. I am writing about dog fouling on footpaths, the seafront and other public places.',
    '',
    `Residents have logged ${reportNoun(stat.thisMonth)} this month, ${trendClause(stat)}.`,
    '',
    tone.ask,
    '',
    LITTER_ACT_OFFENCE,
    LITTER_ACT_SECTION_22_URL,
    '',
    FIXED_PENALTY_WORDING,
    '',
    'Kind regards,',
    cleanSignOff(signOff),
  ].join('\n');
}

export function buildMailto(to: string[], cc: string[], subject: string, body: string): string {
  const query = [
    cc.length > 0 ? `cc=${encodeURIComponent(cc.join(','))}` : '',
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ]
    .filter(Boolean)
    .join('&');
  return `mailto:${to.join(',')}?${query}`;
}

export function buildCouncillorEmail(input: {
  toneId: ToneId;
  councillorIds: string[];
  includeEnvironmentOffice: boolean;
  signOff: string;
  stat: MonthStat;
}): EmailDraft {
  const tone = TONE_OPTIONS.find((option) => option.id === input.toneId) ?? TONE_OPTIONS[0];
  const to = GREYSTONES_COUNCILLORS.filter((councillor) =>
    input.councillorIds.includes(councillor.id),
  ).map((councillor) => councillor.email);
  const cc = input.includeEnvironmentOffice ? [ENVIRONMENT_OFFICE_EMAIL] : [];
  const subject = tone.subject;
  const body = buildEmailBody(tone, input.stat, input.signOff);
  const header = [`To: ${to.join(', ')}`];
  if (cc.length > 0) header.push(`Cc: ${cc.join(', ')}`);
  header.push(`Subject: ${subject}`, '', body);
  const plainText = header.join('\n');

  return {
    to,
    cc,
    subject,
    body,
    mailto: to.length > 0 ? buildMailto(to, cc, subject, body) : '',
    plainText,
    canSend: to.length > 0,
  };
}
