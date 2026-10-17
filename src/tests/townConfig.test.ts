import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BootError } from '../components/BootError';
import { assertTownBuild } from '../config/loadTowns';
import {
  hexToRgbChannels,
  selectTown,
  townIdFromEnv,
  validateTownConfig,
  type TownConfig,
} from '../config/schema';

const root = fileURLToPath(new URL('../..', import.meta.url));

function loadGreystones(): TownConfig {
  return validateTownConfig(JSON.parse(readFileSync(join(root, 'data/towns/greystones.json'), 'utf8')));
}

function cloneTown(): TownConfig {
  return structuredClone(loadGreystones());
}

describe('town config', () => {
  it('accepts the Greystones file, including the backend fields', () => {
    const town = loadGreystones();
    assert.equal(town.id, 'greystones');
    assert.equal(town.townId, 'greystones');
    assert.equal(town.firebaseProject, 'greystones-civic');
    assert.equal(town.hosting.clean.prod, 'clean-greystones');
    assert.equal(town.hosting.clean.demo, 'clean-greystones-demo');
    assert.equal(town.hosting.potholes.prod, 'greystones-roads');
    assert.equal(town.hosting.potholes.demo, 'greystones-roads-demo');
    assert.deepEqual(town.adminAllowlist, []);
    assert.deepEqual(
      town.apps.map((app) => `${app.key}:${app.id}`),
      ['clean:litter', 'potholes:roads'],
    );
    assert.equal(town.name, 'Greystones');
    assert.equal(town.branding.primaryColour, '#006948');
    assert.equal(hexToRgbChannels(town.branding.primaryColour), '0 105 72');
    assert.equal(town.timeZone, 'Europe/Dublin');
    assert.equal(town.councillors.length, 6);
    assert.ok(existsSync(join(root, town.litterBinsFile)));
    assert.ok(existsSync(join(root, 'public', town.branding.logo.slice(1))));
  });

  it('rejects a broken colour, email, empty councillor list, centre, project, town id, or app list', () => {
    const badColour = cloneTown();
    badColour.branding.primaryColour = 'green';
    assert.throws(() => validateTownConfig(badColour), /primaryColour/);

    const badEmail = cloneTown();
    badEmail.councillors[0].email = 'not-an-email';
    assert.throws(() => validateTownConfig(badEmail), /email/);

    const nobody = cloneTown();
    nobody.councillors = [];
    assert.throws(() => validateTownConfig(nobody), /at least one person/);

    const outside = cloneTown();
    outside.map.centre = { lat: 0, lng: 0 };
    assert.throws(() => validateTownConfig(outside), /inside map.bounds/);

    const badProject = cloneTown();
    badProject.firebaseProject = 'NOPE';
    assert.throws(() => validateTownConfig(badProject), /firebaseProject/);

    const mismatch = cloneTown();
    mismatch.townId = 'bray';
    assert.throws(() => validateTownConfig(mismatch), /townId must match id/);

    const sameSite = cloneTown();
    sameSite.hosting.clean.demo = sameSite.hosting.clean.prod;
    assert.throws(() => validateTownConfig(sameSite), /demo and prod hosting sites must be different/);

    const badAllow = cloneTown();
    badAllow.adminAllowlist = ['not-an-email'];
    assert.throws(() => validateTownConfig(badAllow), /adminAllowlist/);

    const oneApp = cloneTown();
    oneApp.apps = [oneApp.apps[0]];
    assert.throws(() => validateTownConfig(oneApp), /litter and roads/);
  });

  it('selects a town from the env var and defaults to greystones', () => {
    assert.equal(townIdFromEnv(undefined), 'greystones');
    assert.equal(townIdFromEnv('  '), 'greystones');
    assert.equal(townIdFromEnv(' bray '), 'bray');

    const available = { '../../data/towns/greystones.json': loadGreystones() };
    assert.equal(selectTown('greystones', available).name, 'Greystones');
    assert.throws(() => selectTown('bray', available), /Unknown town "bray"/);
    assert.equal(assertTownBuild(root, undefined).id, 'greystones');
    assert.throws(() => assertTownBuild(root, 'bray'), /VITE_TOWN=bray cannot be built/);
  });

  it('lists every env var in .env.example with an empty value, and ignores .env files', () => {
    const example = readFileSync(join(root, '.env.example'), 'utf8');
    const assignments = example.split('\n').filter((line) => /^[A-Z0-9_]+=/.test(line));
    assert.deepEqual(assignments, [
      'VITE_TOWN=',
      'VITE_GOOGLE_MAPS_API_KEY=',
      'VITE_DEMO=',
      'VITE_FIREBASE_API_KEY=',
      'VITE_FIREBASE_AUTH_DOMAIN=',
      'VITE_FIREBASE_PROJECT_ID=',
      'VITE_FIREBASE_STORAGE_BUCKET=',
      'VITE_FIREBASE_MESSAGING_SENDER_ID=',
      'VITE_FIREBASE_APP_ID=',
    ]);
    assert.equal(example.includes('AIza'), false);
    const gitignore = readFileSync(join(root, '.gitignore'), 'utf8');
    assert.match(gitignore, /^\.env\*$/m);
    assert.match(gitignore, /^!\.env\.example$/m);
  });

  it('shows a readable screen when a town cannot be loaded', () => {
    const html = renderToStaticMarkup(
      createElement(BootError, { message: 'Unknown town "nope". Configured towns: greystones.' }),
    );
    assert.match(html, /This build could not load a town/);
    assert.match(html, /Unknown town/);
    assert.match(html, /nope/);
    assert.match(html, /VITE_TOWN/);
  });

  it('keeps zod out of the browser modules', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx|ts)$/.test(entry)) files.push(path);
      }
    };
    walk(join(root, 'src'));
    for (const file of files) {
      const testsDir = `${join('src', 'tests')}${sep}`;
      const schemaFile = join('config', 'schema.ts');
      if (file.includes(testsDir) || file.endsWith(schemaFile)) continue;
      const source = readFileSync(file, 'utf8');
      assert.equal(/from ['"]zod['"]/.test(source), false, file);
    }
  });

  it('reads the demo flag only from src/config/mode.ts', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx|ts)$/.test(entry)) files.push(path);
      }
    };
    walk(join(root, 'src'));
    const modeFile = join(root, 'src/config/mode.ts');
    const modeSource = readFileSync(modeFile, 'utf8');
    assert.match(modeSource, /VITE_DEMO === 'true'|env\?\.VITE_DEMO/);
    assert.match(modeSource, /=== 'true'/);
    for (const file of files) {
      if (file === modeFile || file.includes(`${sep}tests${sep}`)) continue;
      const source = readFileSync(file, 'utf8');
      assert.equal(source.includes('VITE_DEMO'), false, file);
    }
  });
});
