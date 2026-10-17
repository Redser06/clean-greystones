import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clusterReports } from '../lib/cluster';
import {
  createReport,
  isDemoEnabled,
  moveReport,
  reportsForSession,
  withImpact,
  withPhoto,
} from '../lib/reportFlow';
import { readStoredReports, writeStoredReports } from '../lib/storage';

function memoryStore() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('report flow', () => {
  it('logs a report in one step with no impact and no photo', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    const report = createReport({ lat: 53.14431, lng: -6.06047, now, id: 'r-1' });
    assert.equal(report.id, 'r-1');
    assert.equal(report.createdAt, now.toISOString());
    assert.equal(report.lat, 53.14431);
    assert.equal(report.lng, -6.06047);
    assert.equal(report.impact, null);
    assert.equal(report.hasPhoto, false);
    assert.equal('note' in report, false);
    assert.equal('confirmations' in report, false);
  });

  it('keeps an optional impact and photo when the resident adds them', () => {
    const report = withPhoto(
      withImpact(
        createReport({ lat: 53.14, lng: -6.06, id: 'r-2', now: new Date('2026-10-17T10:00:00Z') }),
        'wheelchair',
      ),
      true,
    );
    assert.equal(report.impact, 'wheelchair');
    assert.equal(report.hasPhoto, true);
  });

  it('moves the same report when the pin is dragged', () => {
    const report = createReport({ lat: 53.14, lng: -6.06, id: 'r-3', now: new Date('2026-10-17T10:00:00Z') });
    const moved = moveReport(report, 53.1501234, -6.0701234);
    assert.equal(moved.id, report.id);
    assert.equal(moved.createdAt, report.createdAt);
    assert.equal(moved.lat, 53.150123);
    assert.equal(moved.lng, -6.070123);
  });

  it('rejects a report without a location', () => {
    assert.throws(() => createReport({ lat: Number.NaN, lng: -6.06 }));
  });

  it('starts empty unless demo data is explicitly on', () => {
    const now = new Date('2026-10-17T10:00:00Z');
    assert.equal(isDemoEnabled(undefined), false);
    assert.equal(isDemoEnabled('false'), false);
    assert.equal(isDemoEnabled('true'), true);
    const samples = [
      { id: 'demo-a', lat: 1, lng: 2, day: 4, monthOffset: 0 },
      { id: 'demo-b', lat: 1.1, lng: 2.1, day: 9, monthOffset: 0 },
      { id: 'demo-c', lat: 1.2, lng: 2.2, day: 14, monthOffset: 0 },
      { id: 'demo-d', lat: 1.3, lng: 2.3, day: 11, monthOffset: -1 },
    ];
    assert.deepEqual(reportsForSession({ demo: false, stored: null, now, samples, timeZone: 'UTC' }), []);
    const demo = reportsForSession({ demo: true, stored: null, now, samples, timeZone: 'UTC' });
    assert.equal(demo.length, 4);
    assert.equal(demo.some((report) => 'note' in report), false);
    assert.deepEqual(reportsForSession({ demo: true, stored: null, now, samples: [], timeZone: 'UTC' }), []);
    const stored = [createReport({ lat: 1, lng: 2, id: 'kept', now })];
    assert.equal(reportsForSession({ demo: true, stored, now, samples, timeZone: 'UTC' })[0].id, 'kept');
  });

  it('round-trips reports through storage', () => {
    const store = memoryStore();
    assert.equal(readStoredReports(store, 'reports.test'), null);
    const reports = [createReport({ lat: 53.1, lng: -6.1, id: 'saved', now: new Date('2026-10-01T00:00:00Z') })];
    writeStoredReports(store, reports, 'reports.test');
    assert.deepEqual(readStoredReports(store, 'reports.test'), reports);
  });

  it('clusters reports that are on the same stretch of path', () => {
    const clusters = clusterReports(
      [
        { id: 'a', lat: 53.14431, lng: -6.06047 },
        { id: 'b', lat: 53.14433, lng: -6.0605 },
        { id: 'c', lat: 53.1332, lng: -6.0664 },
      ],
      160,
      53.14,
    );
    assert.equal(
      clusters.reduce((sum, cluster) => sum + cluster.count, 0),
      3,
    );
    assert.ok(clusters.some((cluster) => cluster.count === 2));
    assert.ok(clusters.some((cluster) => cluster.count === 1));
  });
});

describe('resident copy', () => {
  it('keeps internal jargon and fake totals out of the interface', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (entry.endsWith('.tsx')) files.push(path);
      }
    };
    walk(join(root, 'components'));
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    const banned = [
      'Bombard',
      'Myth-Buster',
      'Mythbuster',
      'GRAPH G1',
      'NODE N',
      'H3 Cell',
      'geojson',
      '42 Resident',
      'Mapped Poos',
      'API KEY REQUIRED',
      '€250',
      '1-TAP',
      'LIVE EVIDENCE',
      'confirmations',
      'mt1.google.com',
    ];
    for (const phrase of banned) {
      assert.equal(source.includes(phrase), false, phrase);
    }
    assert.equal(source.includes('href="/admin"'), false);
    assert.match(source, /Thanks, logged/);
    assert.match(source, /Tell your councillors/);
    assert.match(source, /Report this spot/);
  });
});
