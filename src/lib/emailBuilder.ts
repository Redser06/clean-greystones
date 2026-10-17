import type { EmailTemplate, TownConfig } from '../config/schema';
import { trendClause, type MonthStat } from './monthlyStat';

export interface EmailDraft {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  mailto: string;
  plainText: string;
  canSend: boolean;
}

export function cleanSignOff(value: string, fallback: string): string {
  const cleaned = value.replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  return cleaned || fallback;
}

export function reportNoun(count: number): string {
  return count === 1 ? '1 report' : `${count} reports`;
}

export function buildEmailBody(
  config: Pick<TownConfig, 'email' | 'legal'>,
  tone: EmailTemplate,
  stat: MonthStat,
  signOff: string,
): string {
  return [
    config.email.greeting,
    '',
    config.email.intro,
    '',
    `Residents have logged ${reportNoun(stat.thisMonth)} this month, ${trendClause(stat)}.`,
    '',
    tone.ask,
    '',
    config.legal.offence,
    config.legal.citationUrl,
    '',
    config.legal.fineWording,
    '',
    'Kind regards,',
    cleanSignOff(signOff, config.email.signOffFallback),
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

export function buildCouncillorEmail(
  config: TownConfig,
  input: {
    toneId: string;
    councillorIds: string[];
    contactIds: string[];
    signOff: string;
    stat: MonthStat;
  },
): EmailDraft {
  const tone = config.email.templates.find((option) => option.id === input.toneId) ?? config.email.templates[0];
  const to = config.councillors
    .filter((councillor) => input.councillorIds.includes(councillor.id))
    .map((councillor) => councillor.email);
  const cc = config.councilContacts
    .filter((contact) => contact.email && input.contactIds.includes(contact.id))
    .map((contact) => contact.email as string);
  const subject = tone.subject;
  const body = buildEmailBody(config, tone, input.stat, input.signOff);
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
