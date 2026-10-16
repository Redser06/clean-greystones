import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPiiAndGuardrails,
  computeBinsVsFoulingAnalysis,
  findNearestBins,
  haversineDistanceMeters,
  selectVerifiedCitations,
} from '../utils/graphEngine';
import {
  GREYSTONES_COUNCILLORS,
  INITIAL_PUBLIC_BINS,
  INITIAL_REPORTS,
  VERIFIED_CITATIONS,
} from '../data/greystonesData';

describe('Clean Greystones Graph Engine & Bin Proximity Suite', () => {
  it('computes accurate Haversine distance in metres for South Beach Promenade pins near Bin #G-14', () => {
    const bin14 = INITIAL_PUBLIC_BINS.find((b) => b.code === 'Bin #G-14')!;
    const dist = haversineDistanceMeters(53.14431, -6.06047, bin14.lat, bin14.lng);
    assert.ok(dist <= 10, `Expected pin to be <= 10m from Bin #G-14, got ${dist}m`);
  });

  it('finds nearest verified bin via Node N6 KNN lookup', () => {
    const res = findNearestBins(53.14431, -6.06047, INITIAL_PUBLIC_BINS);
    assert.equal(res.nearestAll.code, 'Bin #G-14');
    assert.ok(res.dBinAllM <= 10);
  });

  it('computes Bins vs Fouling analysis (Node N10) with both near-bin myth-buster and far-from-bin (>200m) lists', () => {
    const analysis = computeBinsVsFoulingAnalysis(INITIAL_REPORTS);
    assert.equal(analysis.totalActiveReports, INITIAL_REPORTS.length);
    assert.ok(analysis.nearBin15mPct >= 60, 'Expected majority of coastal reports within 15m of a bin');
    assert.ok(analysis.nearBinHotspots.length > 0, 'Expected near-bin hotspots list to be populated');
    assert.ok(analysis.farFromBinHotspots.length > 0, 'Expected far-from-bin (>200m) hotspots list to be populated');
  });

  it('enforces Node N9 guardrail: never returns unverified citations (withholds L10 Beach Bye-Laws unverified clause)', () => {
    const picked = selectVerifiedCitations(VERIFIED_CITATIONS, 'enforcement', 'beach');
    assert.ok(picked.length >= 3);
    assert.ok(picked.every((c) => c.status === 'verified'));
    assert.equal(
      picked.some((c) => c.id === 'L10'),
      false,
      'Unverified citation L10 must never be returned by Node N9'
    );
  });

  it('enforces Node N13 GDPR & anti-shaming guardrails on vehicle registration plates and house numbers', () => {
    const clean = checkPiiAndGuardrails('Fresh mess 5m from Bin #G-14 on South Beach Prom');
    assert.equal(clean.ok, true);

    const withPlate = checkPiiAndGuardrails('Owner drove off in 241-WW-1928 near DART');
    assert.equal(withPlate.ok, false);
    assert.ok(withPlate.warnings[0].includes('Vehicle registration'));

    const withHouse = checkPiiAndGuardrails('Dog lives at 14 Church Road');
    assert.equal(withHouse.ok, false);
  });

  it('includes all 6 official Greystones Municipal District councillors', () => {
    assert.equal(GREYSTONES_COUNCILLORS.length, 6);
    const emails = GREYSTONES_COUNCILLORS.map((c) => c.email);
    assert.ok(emails.includes('sstokes@wicklowcoco.ie'));
    assert.ok(emails.includes('lscott@wicklowcoco.ie'));
    assert.ok(emails.includes('ofinn@wicklowcoco.ie'));
    assert.ok(emails.includes('tfortune@wicklowcoco.ie'));
    assert.ok(emails.includes('lfenelongaskin@wicklowcoco.ie'));
    assert.ok(emails.includes('mbarry@wicklowcoco.ie'));
  });
});
