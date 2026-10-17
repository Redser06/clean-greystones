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
