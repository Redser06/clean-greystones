import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_REPORTS } from '../data/demoSeeds';
import { HISTORICAL_DOG_FOULING_COHORT, HISTORICAL_ROADS_COHORT, SEED_MARKER } from '../utils/demoCohorts';

const root = fileURLToPath(new URL('../..', import.meta.url));

function runVite(env: Record<string, string | undefined>, args: string[]) {
  return spawnSync('npx', ['vite', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function distText(): string {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(join(root, 'dist'));
  return files.map((file) => readFileSync(file)).join('\n');
}

describe('production bundle guard', () => {
  it('refuses a production build when demo mode is on', () => {
    const prodMode = runVite({ VITE_DEMO: 'true', CIVIC_HOSTING_TARGET: undefined }, ['build', '--mode', 'production']);
    assert.notEqual(prodMode.status, 0);
    assert.match(`${prodMode.stderr}\n${prodMode.stdout}`, /VITE_DEMO=true is not allowed/);

    const prodTarget = runVite(
      { VITE_DEMO: 'true', CIVIC_HOSTING_TARGET: 'prod' },
      ['build', '--mode', 'demo'],
    );
    assert.notEqual(prodTarget.status, 0);
    assert.match(`${prodTarget.stderr}\n${prodTarget.stdout}`, /VITE_DEMO=true is not allowed/);
  });

  it('builds prod without seeded report ids, the seed marker, or the old passcodes', () => {
    const built = runVite({ VITE_DEMO: '', CIVIC_HOSTING_TARGET: 'prod' }, ['build', '--mode', 'production']);
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    const bundled = distText();
    const passcodes = [
      ['GREYSTONES', 'MD', '2026'].join('-'),
      ['GREYSTONES', 'ROADS', '2026'].join('-'),
    ];
    for (const passcode of passcodes) {
      assert.equal(bundled.includes(passcode), false, passcode);
    }
    assert.equal(bundled.includes(SEED_MARKER), false);
    const ids = [
      ...INITIAL_REPORTS.map((report) => report.id),
      ...HISTORICAL_DOG_FOULING_COHORT.map((report) => report.id),
      ...HISTORICAL_ROADS_COHORT.map((report) => report.id),
      'demo-beach',
      'demo-church',
      'demo-harbour',
      'demo-last-month',
    ];
    for (const id of ids) {
      assert.equal(bundled.includes(id), false, id);
    }
    const assets = readdirSync(join(root, 'dist/assets'));
    const appChunks = assets.filter((name) => /^App-.*\.js$/.test(name));
    assert.equal(appChunks.length, 1);
    const appChunk = readFileSync(join(root, 'dist/assets', appChunks[0]), 'utf8');
    assert.equal(appChunk.includes('identitytoolkit.googleapis.com'), false);
    assert.equal(appChunk.includes('firebasestorage.googleapis.com'), false);
  });
});
