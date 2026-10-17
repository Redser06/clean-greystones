import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countForEvidence, deliverCouncillorEmail, SAMPLE_EMAIL_RECIPIENT } from '../data/evidence';
import { isDemo } from '../config/mode';
import { nextRateWindow } from '../data/firestorePaths';
import { exportReportsToCsv, withSampleMarker } from '../utils/adminAnalytics';
import { INITIAL_REPORTS, SEED_MARKER } from '../data/demoSeeds';
import { HISTORICAL_DOG_FOULING_COHORT, HISTORICAL_ROADS_COHORT } from '../utils/demoCohorts';
import type { FoulingReport } from '../types';

describe('demo gate', () => {
  it('is off unless the flag is exactly true', () => {
    assert.equal(isDemo, false);
    assert.equal(SEED_MARKER.includes('SEED_MARKER'), true);
  });

  it('countForEvidence throws in demo and excludes seeded and other-device rows', () => {
    const own = 'GS-ANON-OWN1-OWN1';
    const rows: FoulingReport[] = [
      { ...INITIAL_REPORTS[0], submitterToken: own, isSeededDemo: true, is_seeded_demo: true },
      { ...INITIAL_REPORTS[1], id: 'real-own', submitterToken: own, isSeededDemo: false, is_seeded_demo: false },
      { ...INITIAL_REPORTS[2], id: 'real-other', submitterToken: 'GS-ANON-OTHR-OTHR', isSeededDemo: false, is_seeded_demo: false },
      { ...INITIAL_REPORTS[3], id: 'snake-seed', submitterToken: own, isSeededDemo: false, is_seeded_demo: true },
    ];
    assert.throws(() => countForEvidence(rows, own, true), /unavailable in demo mode/);
    assert.equal(countForEvidence(rows, own, false), 1);
    assert.equal(countForEvidence(rows, own), 1);
  });

  it('refuses a sendable councillor email in demo', () => {
    const to = ['sstokes@wicklowcoco.ie', 'lscott@wicklowcoco.ie'];
    const cc = ['envcomplaints@wicklowcoco.ie', 'simon.harris@oireachtas.ie'];
    const demo = deliverCouncillorEmail(to, cc, true);
    assert.equal(demo.sendable, false);
    assert.equal(demo.sample, 'SAMPLE');
    assert.deepEqual(demo.toEmails, [SAMPLE_EMAIL_RECIPIENT]);
    assert.deepEqual(demo.ccEmails, []);
    const recipients = [...demo.toEmails, ...demo.ccEmails].join(' ');
    assert.equal(recipients.includes('wicklowcoco.ie'), false);
    assert.equal(recipients.includes('oireachtas.ie'), false);
    const live = deliverCouncillorEmail(to, cc, false);
    assert.equal(live.sendable, true);
    assert.equal(live.sample, undefined);
    assert.deepEqual(live.toEmails, to);
    assert.deepEqual(live.ccEmails, cc);
    const app = readFileSync(join(fileURLToPath(new URL('..', import.meta.url)), 'App.tsx'), 'utf8');
    assert.equal(/catch\s*\{[^}]*totalActiveReports/.test(app), false);
    assert.equal(app.includes('deliverCouncillorEmail'), true);
  });

  it('stamps SAMPLE on demo exports and marks every seed is_seeded_demo', () => {
    assert.equal(INITIAL_REPORTS.every((report) => report.is_seeded_demo === true && report.isSeededDemo === true), true);
    assert.equal(
      [...HISTORICAL_DOG_FOULING_COHORT, ...HISTORICAL_ROADS_COHORT].every((report) => report.is_seeded_demo === true),
      true,
    );
    const csv = exportReportsToCsv(INITIAL_REPORTS.slice(0, 1), true);
    assert.equal(csv.split('\n')[0], 'SAMPLE');
    const plain = exportReportsToCsv(INITIAL_REPORTS.slice(0, 1), false);
    assert.equal(plain.startsWith('SAMPLE'), false);
    assert.equal(withSampleMarker({ exportedAt: 'now' }, true).sample, 'SAMPLE');
    assert.equal(withSampleMarker({ exportedAt: 'now' }, false).sample, undefined);
  });

  it('resets the rate window and stops at the cap', () => {
    const first = nextRateWindow({ nowMs: 0, previous: null });
    assert.deepEqual(first, { count: 1, windowStartMs: 0 });
    const eighth = { count: 8, windowStartMs: 0 };
    assert.deepEqual(nextRateWindow({ nowMs: 1000, previous: eighth }), { limited: true });
    assert.deepEqual(nextRateWindow({ nowMs: 60 * 60 * 1000, previous: eighth }), {
      count: 1,
      windowStartMs: 60 * 60 * 1000,
    });
  });
});
