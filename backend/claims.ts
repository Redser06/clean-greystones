export interface GrantInput {
  email: string | undefined;
  townId: string;
  allowlist: readonly string[];
  currentTowns: readonly string[];
}

export type GrantDecision =
  | { ok: true; claim: { admin: { towns: string[] } } }
  | { ok: false; reason: 'no-email' | 'not-allowlisted' | 'bad-town' };

const TOWN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Comma-separated organiser emails from ADMIN_EMAILS or --emails. Not from the town file. */
export function readAdminEmails(source: string | undefined): string[] {
  if (!source) return [];
  return [...new Set(source.split(',').map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length > 0))];
}

export function adminEmailsFromArgs(argv: readonly string[], envValue: string | undefined): string[] {
  const inline = argv.find((arg) => arg.startsWith('--emails='));
  if (inline) return readAdminEmails(inline.slice('--emails='.length));
  const index = argv.indexOf('--emails');
  if (index >= 0) return readAdminEmails(argv[index + 1]);
  return readAdminEmails(envValue);
}

/** Custom claim written for an allowlisted organiser. The claim is the only admin signal. */
export function decideAdminGrant(input: GrantInput): GrantDecision {
  if (!TOWN_ID.test(input.townId)) return { ok: false, reason: 'bad-town' };
  const email = input.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: 'no-email' };
  const allowed = new Set(input.allowlist.map((entry) => entry.trim().toLowerCase()));
  if (!allowed.has(email)) return { ok: false, reason: 'not-allowlisted' };
  const towns = [...new Set([...input.currentTowns, input.townId])].sort();
  return { ok: true, claim: { admin: { towns } } };
}
