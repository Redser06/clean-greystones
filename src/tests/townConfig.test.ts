import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BootError } from '../components/BootError';
import { assertTownBuild } from '../config/loadTowns';
import { buildDemoReports } from '../lib/reportFlow';
import {
  binSourceForTown,
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
  it('accepts the Greystones file and keeps the councillor emails', () => {
    const town = loadGreystones();
    assert.equal(town.id, 'greystones');
    assert.equal(town.name, 'Greystones');
    assert.equal(town.branding.name, 'Clean Greystones');
    assert.equal(town.branding.primaryColour, '#006948');
    assert.equal(hexToRgbChannels(town.branding.primaryColour), '0 105 72');
    assert.equal(town.timeZone, 'Europe/Dublin');
    assert.equal(town.storageKey, 'clean-greystones.reports.v1');
    assert.deepEqual(
      town.councillors.map((councillor) => councillor.email).sort(),
      [
        'lfenelongaskin@wicklowcoco.ie',
        'lscott@wicklowcoco.ie',
        'mbarry@wicklowcoco.ie',
        'ofinn@wicklowcoco.ie',
        'sstokes@wicklowcoco.ie',
        'tfortune@wicklowcoco.ie',
      ].sort(),
    );
    assert.equal(town.email.templates.length, 3);
    assert.equal(town.legal.fineWording, 'It may result in a fixed penalty.');
    assert.match(town.legal.fixedPaymentNote, /not a verified dog-fouling penalty amount/);
    assert.equal(town.councilContacts.find((contact) => contact.defaultCc)?.email, 'envcomplaints@wicklowcoco.ie');
    assert.ok(existsSync(join(root, town.litterBinsFile)));
    assert.ok(existsSync(join(root, 'public', town.branding.logo.slice(1))));

    const demo = buildDemoReports(new Date('2026-10-17T12:00:00Z'), town.demoReports, town.timeZone);
    assert.equal(demo.length, 4);
    assert.equal(demo.filter((report) => report.createdAt.startsWith('2026-10')).length, 3);
    assert.equal(demo.filter((report) => report.createdAt.startsWith('2026-09')).length, 1);
  });

  it('rejects a broken colour, email, empty councillor list, or a centre outside the bounds', () => {
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

    const raw = binSourceForTown('data/bins/greystones.geojson', {
      '../../data/bins/greystones.geojson': '{"type":"FeatureCollection","features":[]}',
    });
    assert.match(raw, /FeatureCollection/);
    assert.throws(() => binSourceForTown('data/bins/missing.geojson', {}), /not found/);
  });

  it('keeps town names, emails, and the brand colour out of components', () => {
    const files: string[] = [join(root, 'src/App.tsx'), join(root, 'index.html')];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.tsx')) files.push(path);
      }
    };
    walk(join(root, 'src/components'));
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    const banned = ['Greystones', 'greystones', 'wicklow', '#006948', '53.144', 'sstokes'];
    for (const phrase of banned) {
      assert.equal(source.includes(phrase), false, phrase);
    }
  });

  it('lists every env var in .env.example with an empty value, and ignores .env files', () => {
    const example = readFileSync(join(root, '.env.example'), 'utf8');
    const assignments = example.split('\n').filter((line) => /^[A-Z0-9_]+=/.test(line));
    assert.deepEqual(assignments, ['VITE_TOWN=', 'VITE_GOOGLE_MAPS_API_KEY=', 'VITE_DEMO_DATA=']);
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

  it('does not request web fonts or offer a photo that is not stored', () => {
    const files = [join(root, 'index.html')];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx|ts|css|html)$/.test(entry)) files.push(path);
      }
    };
    walk(join(root, 'src/components'));
    walk(join(root, 'src/lib'));
    walk(join(root, 'src/config'));
    files.push(join(root, 'src/index.css'), join(root, 'src/main.tsx'), join(root, 'src/App.tsx'));
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const phrase of ['fonts.googleapis.com', 'fonts.gstatic.com', 'report-photo', 'Add a photo']) {
      assert.equal(source.includes(phrase), false, phrase);
    }
  });
});
