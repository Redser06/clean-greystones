import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideAdminGrant } from '../claims';

interface TownFile {
  townId?: string;
  adminAllowlist?: string[];
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'data', 'towns');
const apply = process.argv.includes('--apply');

if (apply) {
  console.error('Refusing to apply claims from this script. Set claims with a service account outside CI, using decideAdminGrant().');
  process.exit(1);
}

const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
for (const name of files) {
  const town = JSON.parse(readFileSync(join(dir, name), 'utf8')) as TownFile;
  const townId = town.townId ?? name.replace(/\.json$/, '');
  const allowlist = town.adminAllowlist ?? [];
  console.log(`town ${townId}: ${allowlist.length} allowlisted organiser(s)`);
  for (const email of allowlist) {
    const decision = decideAdminGrant({
      email,
      townId,
      allowlist,
      currentTowns: [],
    });
    console.log(`  ${email} -> ${decision.ok ? decision.claim.admin.towns.join(',') : decision.reason}`);
  }
}
