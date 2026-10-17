import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminEmailsFromArgs, decideAdminGrant } from '../claims';

interface TownFile {
  townId?: string;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'data', 'towns');
const apply = process.argv.includes('--apply');

if (apply) {
  console.error('Refusing to apply claims from this script. Set claims with a service account outside CI, using decideAdminGrant().');
  process.exit(1);
}

const townFlag = process.argv.indexOf('--town');
const townFilter = townFlag >= 0 ? process.argv[townFlag + 1] : undefined;
if (townFlag >= 0 && !townFilter) {
  console.error('Pass a town id after --town.');
  process.exit(1);
}

const allowlist = adminEmailsFromArgs(process.argv, process.env.ADMIN_EMAILS);
const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
const selected = files.filter((name) => !townFilter || name.replace(/\.json$/, '') === townFilter);
if (townFilter && selected.length === 0) {
  console.error(`No town file for ${townFilter}.`);
  process.exit(1);
}
if (allowlist.length === 0) {
  console.log('No organiser emails. Set ADMIN_EMAILS or pass --emails. The public town file does not store them.');
}

for (const name of selected) {
  const town = JSON.parse(readFileSync(join(dir, name), 'utf8')) as TownFile;
  const townId = town.townId ?? name.replace(/\.json$/, '');
  console.log(`town ${townId}: ${allowlist.length} allowlisted organiser(s) from ADMIN_EMAILS or --emails`);
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
