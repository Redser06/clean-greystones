import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailySnapshots,
  computeWeeklyEvidenceSummary,
  elevateSeverity,
  filterReportsByTimeRange,
  findMatchingNearbyReport,
  reconcileEntireReportList,
  reconcileReportLog,
} from '../utils/reconciliation';
import { FoulingReport } from '../types';

describe('Clean Greystones Reconciliation & 24h Snapshot Suite', () => {
  const baseTime = Date.now();

  const createMockReport = (overrides: Partial<FoulingReport>): FoulingReport => ({
    id: `rep-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date(baseTime).toISOString(),
    lat: 53.14431,
    lng: -6.06047,
    accuracyM: 2.5,
    streetName: 'South Beach Promenade (near Lifeguard Hut)',
    areaName: 'South Beach Prom',
    h3Cell: '891e2040915ffff',
    severity: 'just_poop',
    status: 'spotted',
    confirmations: 1,
    submitterToken: 'GS-ANON-A1B2-C3D4',
    nearestBinId: 'bin-sb-14',
    nearestBinCode: 'Bin #G-14',
    dBinAllM: 4,
    dBinVerifiedM: 4,
    ...overrides,
  });

  it('elevates severity to highest impact when merging reports', () => {
    assert.equal(elevateSeverity('just_poop', 'stepped_in'), 'stepped_in');
    assert.equal(elevateSeverity('stepped_in', 'buggy_wheels'), 'stepped_in');
    assert.equal(elevateSeverity('buggy_wheels', 'wheelchair_wheels'), 'wheelchair_wheels');
    assert.equal(elevateSeverity('wheelchair_wheels', 'just_poop'), 'wheelchair_wheels');
  });

  it('finds matching nearby report within 15m and 24 hours', () => {
    const existing = createMockReport({
      id: 'rep-existing-1',
      lat: 53.14431,
      lng: -6.06047,
      createdAt: new Date(baseTime - 3600 * 1000).toISOString(), // 1 hour ago
    });

    // 5m away, same hour
    const match = findMatchingNearbyReport(53.14435, -6.06049, [existing], 15, 24);
    assert.ok(match !== null);
    assert.equal(match?.id, 'rep-existing-1');

    // 50m away (different location)
    const farMatch = findMatchingNearbyReport(53.1449, -6.0615, [existing], 15, 24);
    assert.equal(farMatch, null);

    // 5m away, but 30 hours ago (>24h window)
    const oldReport = createMockReport({
      id: 'rep-old',
      createdAt: new Date(baseTime - 30 * 3600 * 1000).toISOString(),
    });
    const oldMatch = findMatchingNearbyReport(53.14431, -6.06047, [oldReport], 15, 24);
    assert.equal(oldMatch, null);
  });

  it('reconciles new report by incrementing confirmations and elevating severity without creating duplicate UI pins', () => {
    const existing = createMockReport({
      id: 'rep-anchor',
      severity: 'just_poop',
      confirmations: 1,
      submitterToken: 'GS-ANON-USER-1111',
    });

    const newReport = createMockReport({
      id: 'rep-second-drop',
      lat: 53.14433, // ~3m away
      lng: -6.06048,
      severity: 'wheelchair_wheels',
      submitterToken: 'GS-ANON-USER-2222',
      note: 'Right in path of my wheelchair',
    });

    const res = reconcileReportLog(newReport, [existing], 15);
    assert.equal(res.action, 'merged');
    assert.equal(res.primaryReport.id, 'rep-anchor');
    assert.equal(res.primaryReport.confirmations, 2);
    assert.equal(res.primaryReport.severity, 'wheelchair_wheels');
    assert.ok(res.primaryReport.additionalSubmitters?.includes('GS-ANON-USER-2222'));
    assert.ok(res.primaryReport.note?.includes('Right in path of my wheelchair'));
  });

  it('filters active reports for today (24 hours) vs week (7 days) to provide a clean daily UI without losing sight of the problem', () => {
    const todayReport = createMockReport({
      id: 'rep-today',
      createdAt: new Date(baseTime - 2 * 3600 * 1000).toISOString(), // 2h ago
    });
    const threeDaysAgo = createMockReport({
      id: 'rep-3days',
      createdAt: new Date(baseTime - 3 * 24 * 3600 * 1000).toISOString(), // 3d ago
    });
    const nineDaysAgo = createMockReport({
      id: 'rep-9days',
      createdAt: new Date(baseTime - 9 * 24 * 3600 * 1000).toISOString(), // 9d ago
    });
    const mergedReport = createMockReport({
      id: 'rep-merged',
      status: 'merged',
      createdAt: new Date(baseTime - 1 * 3600 * 1000).toISOString(),
    });

    const all = [todayReport, threeDaysAgo, nineDaysAgo, mergedReport];

    // Today (24h)
    const todayList = filterReportsByTimeRange(all, 'today');
    assert.equal(todayList.length, 1);
    assert.equal(todayList[0].id, 'rep-today');

    // Week (7d)
    const weekList = filterReportsByTimeRange(all, 'week');
    assert.equal(weekList.length, 2);
    assert.ok(weekList.some((r) => r.id === 'rep-today'));
    assert.ok(weekList.some((r) => r.id === 'rep-3days'));
    assert.equal(weekList.some((r) => r.id === 'rep-9days'), false);
    assert.equal(weekList.some((r) => r.id === 'rep-merged'), false);
  });

  it('batch-reconciles an entire list of reports into uncluttered primaries and merged duplicates', () => {
    const rep1 = createMockReport({
      id: 'r1',
      lat: 53.1443,
      lng: -6.0604,
      createdAt: '2026-10-18T10:00:00Z',
    });
    const rep2 = createMockReport({
      id: 'r2',
      lat: 53.14432, // ~3m away
      lng: -6.06042,
      createdAt: '2026-10-18T11:00:00Z',
      severity: 'stepped_in',
    });
    const rep3 = createMockReport({
      id: 'r3',
      lat: 53.1492, // Harbour, far away
      lng: -6.063,
      createdAt: '2026-10-18T12:00:00Z',
    });

    const { reconciled, mergedCount } = reconcileEntireReportList([rep1, rep2, rep3], 15, 24);
    assert.equal(mergedCount, 1);
    const primary = reconciled.find((r) => r.id === 'r1');
    assert.ok(primary);
    assert.equal(primary.confirmations, 2);
    assert.equal(primary.severity, 'stepped_in');

    const duplicate = reconciled.find((r) => r.id === 'r2');
    assert.ok(duplicate);
    assert.equal(duplicate.status, 'merged');
    assert.equal(duplicate.mergedIntoId, 'r1');
  });

  it('computes 24-hour daily snapshots with distinct submitters and hotspot rankings', () => {
    const day1 = createMockReport({
      createdAt: '2026-10-18T10:00:00Z',
      areaName: 'South Beach Prom',
      streetName: 'South Beach Promenade (near Lifeguard Hut)',
      submitterToken: 'GS-ANON-1111-2222',
    });
    const day2 = createMockReport({
      createdAt: '2026-10-19T08:00:00Z',
      areaName: 'Church Road',
      streetName: 'Church Road (near DART Station & Bakery)',
      submitterToken: 'GS-ANON-3333-4444',
    });

    const snapshots = computeDailySnapshots([day1, day2]);
    assert.ok(snapshots['2026-10-18']);
    assert.ok(snapshots['2026-10-19']);
    assert.equal(snapshots['2026-10-18'].totalReports, 1);
    assert.equal(snapshots['2026-10-18'].distinctSubmitters, 1);
    assert.equal(snapshots['2026-10-18'].topHotspots[0].areaName, 'South Beach Prom');
  });

  it('computes 7-day Weekly Evidence Summary with daily breakdown for councillor email', () => {
    const reps = [
      createMockReport({
        createdAt: new Date(baseTime - 3600 * 1000).toISOString(), // today
        severity: 'stepped_in',
      }),
      createMockReport({
        createdAt: new Date(baseTime - 2 * 24 * 3600 * 1000).toISOString(), // 2 days ago
        severity: 'wheelchair_wheels',
      }),
    ];

    const summary = computeWeeklyEvidenceSummary(reps);
    assert.equal(summary.todayCount, 1);
    assert.equal(summary.totalReports, 2);
    assert.equal(summary.highImpactCount, 2);
    assert.equal(summary.dailyBreakdown.length, 7);
  });
});
