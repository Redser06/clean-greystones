import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPiiAndGuardrails,
  computeBinsVsFoulingAnalysis,
  findNearestBins,
  generateAnonymousSubmitterToken,
  haversineDistanceMeters,
  isValidSubmitterToken,
  selectVerifiedCitations,
} from '../utils/graphEngine';
import {
  computeTemporalAndSeasonalModel,
  DEFAULT_ADMIN_PASSCODE,
  exportReportsToCsv,
  HISTORICAL_DOG_FOULING_COHORT,
  HISTORICAL_GREYSTONES_COHORT,
  HISTORICAL_ROADS_COHORT,
  isValidAnyCivicToken,
  verifyAdminPasscode,
} from '../utils/adminAnalytics';
import {
  EMAIL_TEMPLATES,
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

  it('computes Bins vs Fouling analysis (Node N10) with both near-bin myth-buster, far-from-bin (>200m) lists, and distinct submitter count', () => {
    const analysis = computeBinsVsFoulingAnalysis(INITIAL_REPORTS);
    assert.equal(analysis.totalActiveReports, INITIAL_REPORTS.length);
    assert.ok(analysis.distinctSubmitters >= 8, 'Expected multiple distinct anonymous submitters in seeded data');
    assert.ok(analysis.nearBin15mPct >= 60, 'Expected majority of coastal reports within 15m of a bin');
    assert.ok(analysis.nearBinHotspots.length > 0, 'Expected near-bin hotspots list to be populated');
    assert.ok(analysis.farFromBinHotspots.length > 0, 'Expected far-from-bin (>200m) hotspots list to be populated');
  });

  it('handles production clean-slate (0 reports) cleanly without division by zero', () => {
    const emptyAnalysis = computeBinsVsFoulingAnalysis([]);
    assert.equal(emptyAnalysis.totalActiveReports, 0);
    assert.equal(emptyAnalysis.distinctSubmitters, 0);
    assert.equal(emptyAnalysis.nearBin15mPct, 0);
    assert.equal(emptyAnalysis.verdict, 'inconclusive');
  });

  it('generates and validates provable anonymous submitter tokens (GS-ANON-XXXX-XXXX) with deterministic checksum', () => {
    const token = generateAnonymousSubmitterToken();
    assert.match(token, /^GS-ANON-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.equal(isValidSubmitterToken(token), true);
    assert.equal(isValidSubmitterToken('GS-ANON-0000-ZZZZ'), false);
    assert.equal(
      INITIAL_REPORTS.every((r) => r.isSeededDemo === true && isValidSubmitterToken(r.submitterToken)),
      true,
      'Every pre-seeded demo report must carry a valid GS-ANON token and isSeededDemo flag'
    );
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

  it('computes 12-month Admin Time-Series, Seasonality (year-round structural), Weekend Spike, and Diurnal model', () => {
    const fullCohort = [...INITIAL_REPORTS, ...HISTORICAL_GREYSTONES_COHORT];
    const model = computeTemporalAndSeasonalModel(fullCohort, 'clean_greystones');

    assert.equal(model.totalAnalyzed, fullCohort.length);
    assert.equal(model.monthlySeries.length, 12, 'Expected 12 monthly buckets from Nov 2025 to Oct 2026');
    assert.equal(model.isYearRoundStructural, true, 'Expected year-round structural baseline verdict');
    assert.ok(
      model.winterToSummerRatioPct >= 75,
      `Expected Winter rate to retain >=75% of Summer rate, got ${model.winterToSummerRatioPct}%`
    );
    assert.ok(
      model.weekendSpikeMultiplier >= 1.4,
      `Expected a measurable weekend spike multiplier >= 1.4x, got ${model.weekendSpikeMultiplier}x`
    );
    assert.equal(model.validTokenPct, 100, 'Expected 100% valid GS-ANON cryptograms in cohort');
  });

  it('supports Common Backend Portal filtering across Clean Greystones, Fix Greystones Roads, and Combined All-App streams', () => {
    const combinedPool = [...HISTORICAL_DOG_FOULING_COHORT, ...HISTORICAL_ROADS_COHORT];
    const combinedModel = computeTemporalAndSeasonalModel(combinedPool, 'all');
    assert.equal(combinedModel.foulingCount, HISTORICAL_DOG_FOULING_COHORT.length);
    assert.equal(combinedModel.roadsCount, HISTORICAL_ROADS_COHORT.length);
    assert.equal(combinedModel.totalAnalyzed, combinedPool.length);
    assert.equal(combinedModel.validTokenPct, 100);
    assert.ok(
      combinedPool.every((r) => isValidAnyCivicToken(r.submitterToken)),
      'Expected both GS-ANON and GR-ANON tokens to validate in common backend'
    );
  });

  it('verifies admin passcode and exports RFC-4180 CSV with app_stream and submitter_token columns', () => {
    assert.equal(verifyAdminPasscode(DEFAULT_ADMIN_PASSCODE), true);
    assert.equal(verifyAdminPasscode('GREYSTONES-ROADS-2026'), true);
    assert.equal(verifyAdminPasscode('wrong-passcode'), false);

    const csv = exportReportsToCsv(INITIAL_REPORTS);
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, INITIAL_REPORTS.length + 1);
    assert.ok(lines[0].includes('id,app_stream,created_at_utc'));
    assert.ok(lines[0].includes('submitter_token,token_checksum_valid'));
  });

  it('configures practical_action as the default primary councillor email template', () => {
    assert.equal(EMAIL_TEMPLATES[0].id, 'practical_action');
    assert.ok(EMAIL_TEMPLATES[0].label.includes('Practical Solutions'));
    assert.ok(EMAIL_TEMPLATES[0].shortDesc.includes('2 wardens for Wicklow & Tánaiste'));
  });
});

