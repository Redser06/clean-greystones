import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPiiAndGuardrails,
  computeBinsVsFoulingAnalysis,
  findNearestBins,
  generateAnonymousSubmitterToken,
  haversineDistanceMeters,
  inferGreystonesLocation,
  isValidSubmitterToken,
  reencodePhotoToSafeJpeg,
  selectVerifiedCitations,
  SEVERITY_META,
} from '../utils/graphEngine';
import {
  computeTemporalAndSeasonalModel,
  exportReportsToCsv,
  HISTORICAL_DOG_FOULING_COHORT,
  HISTORICAL_GREYSTONES_COHORT,
  HISTORICAL_ROADS_COHORT,
  isValidAnyCivicToken,
  isAdminSessionActive,
} from '../utils/adminAnalytics';
import {
  EMAIL_TEMPLATES,
  GREYSTONES_COUNCILLORS,
  INITIAL_PUBLIC_BINS,
  INITIAL_REPORTS,
  VERIFIED_CITATIONS,
} from '../data/greystonesData';
import { PublicBin } from '../types';
import { isValidCrowdsourcedReport } from '../utils/firebaseSync';
import { computeDailySnapshots, formatDublinDate } from '../utils/reconciliation';

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

  it('exports RFC-4180 CSV with app_stream and submitter_token columns', () => {
    const csv = exportReportsToCsv(INITIAL_REPORTS);
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, INITIAL_REPORTS.length + 1);
    assert.ok(lines[0].includes('id,app_stream,created_at_utc'));
    assert.ok(lines[0].includes('submitter_token,token_checksum_valid'));
  });

  it('configures practical_action as the default primary councillor email template and write_your_own as the only other option', () => {
    assert.equal(EMAIL_TEMPLATES.length, 2);
    assert.equal(EMAIL_TEMPLATES[0].id, 'practical_action');
    assert.ok(EMAIL_TEMPLATES[0].label.includes('Practical Solutions'));
    assert.equal(EMAIL_TEMPLATES[1].id, 'write_your_own');
    assert.ok(EMAIL_TEMPLATES[1].label.includes('Write Your Own'));

    // Old templates removed from frontend array
    const templateIds = EMAIL_TEMPLATES.map((t) => t.id as string);
    assert.equal(templateIds.includes('bin_mythbuster'), false);
    assert.equal(templateIds.includes('wheel_contamination'), false);
    assert.equal(templateIds.includes('hotspot_evidence'), false);
    assert.equal(templateIds.includes('request_bin'), false);
  });

  it('supports manually logged bin locations and recalculates nearest bin distances dynamically', () => {
    const manualBin: PublicBin = {
      id: 'bin-cliff-walk-custom',
      code: 'Bin #G-99',
      lat: 53.151,
      lng: -6.068,
      locationName: 'Cliff Walk Start Trailhead (Manually Logged)',
      kind: 'dog_waste',
      source: 'council',
      status: 'verified',
      yesVotes: 1,
      noVotes: 0,
      lastConfirmedAt: '2026-10-20T21:00:00Z',
      capacityStatus: 'EMPTY',
    };

    const combinedBins = [...INITIAL_PUBLIC_BINS, manualBin];
    const nearest = findNearestBins(53.1509, -6.0679, combinedBins);

    assert.equal(nearest.nearestVerified.id, 'bin-cliff-walk-custom');
    assert.equal(nearest.nearestVerified.code, 'Bin #G-99');
    assert.ok(nearest.dBinVerifiedM < 25, `Expected distance < 25m, got ${nearest.dBinVerifiedM}m`);
  });

  it('supports accidental report deletion: removes report and updates hotspot metrics cleanly', () => {
    const initialCount = INITIAL_REPORTS.length;
    const toDeleteId = INITIAL_REPORTS[0].id;
    const filteredReports = INITIAL_REPORTS.filter((r) => r.id !== toDeleteId);

    assert.equal(filteredReports.length, initialCount - 1);
    assert.equal(filteredReports.some((r) => r.id === toDeleteId), false);

    const updatedAnalysis = computeBinsVsFoulingAnalysis(filteredReports);
    assert.equal(updatedAnalysis.totalActiveReports, initialCount - 1);
  });

  it('validates unique report ID format for communal multi-device sync', () => {
    const generateId = () => `rep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const id1 = generateId();
    const id2 = generateId();

    assert.notEqual(id1, id2);
    assert.match(id1, /^rep-[a-z0-9]+-[a-z0-9]+$/);
    assert.match(id2, /^rep-[a-z0-9]+-[a-z0-9]+$/);
  });

  it('provides complete accessible metadata without mid-word ellipsis for all 4 fouling types', () => {
    const types = ['just_poop', 'stepped_in', 'buggy_wheels', 'wheelchair_wheels'] as const;
    for (const t of types) {
      const meta = SEVERITY_META[t];
      assert.ok(meta.emoji && meta.emoji.length > 0);
      assert.ok(meta.label && meta.label.length > 0);
      assert.ok(meta.subtext && meta.subtext.length > 0);
      assert.ok(!meta.label.includes('...'), 'Label must not contain ellipsis');
      assert.ok(!meta.shortLabel.includes('...'), 'Short label must not contain ellipsis');
    }
  });

  it('safely gates organiser tools using isAdminSessionActive()', () => {
    assert.equal(typeof isAdminSessionActive(), 'boolean');
    assert.equal(isAdminSessionActive(), false);
  });

  it('infers location from device coordinates: snaps within Greystones and provides coordinate fallback outside Greystones', () => {
    // Within Greystones South Beach
    const local = inferGreystonesLocation(53.14431, -6.06047);
    assert.equal(local.streetName, 'South Beach Promenade (near Lifeguard Hut)');
    assert.equal(local.areaName, 'South Beach Prom');

    // Outside Greystones (e.g. Dublin Spire >3000m away)
    const outside = inferGreystonesLocation(53.3498, -6.2603);
    assert.ok(outside.streetName.includes('Current Location (53.3498° N, 6.2603° W)'));
    assert.equal(outside.areaName, 'Current Location');
  });

  it('accurately resolves distinct segments along the Charlesland Spine when moving the pin', () => {
    // 1. SuperValu / R774 North Roundabout
    const north = inferGreystonesLocation(53.1365, -6.0662);
    assert.equal(north.areaName, 'Charlesland');
    assert.equal(north.streetName, 'Charlesland Spine (SuperValu & R774 Roundabout)');

    // 2. Court & Park Walkway
    const court = inferGreystonesLocation(53.1348, -6.0668);
    assert.equal(court.areaName, 'Charlesland');
    assert.equal(court.streetName, 'Charlesland Spine (Court & Park Walkway)');

    // 3. Community Centre & Wood (Mid Spine)
    const mid = inferGreystonesLocation(53.1325, -6.0675);
    assert.equal(mid.areaName, 'Charlesland');
    assert.equal(mid.streetName, 'Charlesland Spine (Community Centre & Wood)');

    // 4. Grove & The Green
    const grove = inferGreystonesLocation(53.1302, -6.0690);
    assert.equal(grove.areaName, 'Charlesland');
    assert.equal(grove.streetName, 'Charlesland Spine (Grove & The Green)');

    // 5. Crescent & Southern Link
    const south = inferGreystonesLocation(53.1278, -6.0712);
    assert.equal(south.areaName, 'Charlesland');
    assert.equal(south.streetName, 'Charlesland Spine (Crescent & Southern Link)');

    // Verify all 5 locations along the spine have distinct street names rather than a single fixed label
    const spineNames = new Set([north.streetName, court.streetName, mid.streetName, grove.streetName, south.streetName]);
    assert.equal(spineNames.size, 5, 'Every segment along the Charlesland Spine must resolve to its specific location');

    // Verify nearest bin distances dynamically update as the pin moves along the Spine
    const binDistNorth = findNearestBins(53.1365, -6.0662, INITIAL_PUBLIC_BINS).dBinAllM;
    const binDistMid = findNearestBins(53.1325, -6.0675, INITIAL_PUBLIC_BINS).dBinAllM;
    const binDistSouth = findNearestBins(53.1278, -6.0712, INITIAL_PUBLIC_BINS).dBinAllM;

    assert.ok(binDistNorth < binDistMid, 'North spine should be closer to town bins than mid spine');
    assert.ok(binDistMid < binDistSouth, 'Mid spine should be closer to town bins than south spine');
    assert.ok(binDistSouth > 1500, 'South spine is over 1.5km from public litter bins');
  });

  it('validates crowdsourced report schema and rejects poisoned or out-of-bounds payloads (B2)', () => {
    const valid = INITIAL_REPORTS[0];
    assert.equal(isValidCrowdsourcedReport(valid), true);

    // Reject missing or non-string createdAt (prevents rep.createdAt.slice TypeError DoS)
    assert.equal(isValidCrowdsourcedReport({ ...valid, createdAt: 12345 }), false);
    assert.equal(isValidCrowdsourcedReport({ ...valid, createdAt: null }), false);

    // Reject unknown severity enum (prevents SEVERITY_META[severity].isHighImpact TypeError DoS)
    assert.equal(isValidCrowdsourcedReport({ ...valid, severity: 'nuclear_waste' }), false);

    // Reject coordinates outside Greystones / North Wicklow bounding box
    assert.equal(isValidCrowdsourcedReport({ ...valid, lat: 0, lng: 0 }), false);
    assert.equal(isValidCrowdsourcedReport({ ...valid, lat: 53.99, lng: -6.06 }), false);

    // Reject invalid confirmations count
    assert.equal(isValidCrowdsourcedReport({ ...valid, confirmations: 0 }), false);
    assert.equal(isValidCrowdsourcedReport({ ...valid, confirmations: NaN }), false);

    // Reject non-JPEG photoDataUrl
    assert.equal(
      isValidCrowdsourcedReport({ ...valid, photoDataUrl: 'data:image/tiff;base64,AAAA' }),
      false
    );
    assert.equal(
      isValidCrowdsourcedReport({ ...valid, photoDataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }),
      true
    );
  });

  it('rejects photo files on decode failure, HEIC/TIFF formats, or non-JPEG re-encode (never falls back to raw EXIF file)', async () => {
    const rawExifLeakDataUrl = 'data:image/jpeg;base64,RAW_EXIF_GPS_LEAK_PAYLOAD_DO_NOT_KEEP';

    // 1. Decode failure (e.g., corrupted image or browser Image.onerror) must reject, never returning rawDataUrl
    await assert.rejects(
      async () => {
        await reencodePhotoToSafeJpeg(
          { name: 'photo.jpg', type: 'image/jpeg' },
          rawExifLeakDataUrl,
          async () => {
            throw new Error('Image.onerror decode failure');
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /could not be processed to strip location metadata/i);
        assert.equal(err.message.includes('RAW_EXIF_GPS_LEAK_PAYLOAD_DO_NOT_KEEP'), false);
        return true;
      }
    );

    // 2. Also test default browser Image path when Image.onerror fires
    const originalImage = (globalThis as any).Image;
    const originalDocument = (globalThis as any).document;
    try {
      (globalThis as any).document = {
        createElement: () => ({
          width: 0,
          height: 0,
          getContext: () => null,
        }),
      };
      (globalThis as any).Image = class MockFailingImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_val: string) {
          if (this.onerror) this.onerror();
        }
      };

      await assert.rejects(
        async () => {
          await reencodePhotoToSafeJpeg(
            { name: 'corrupt.jpg', type: 'image/jpeg' },
            rawExifLeakDataUrl
          );
        },
        /could not be processed to strip location metadata/i
      );
    } finally {
      (globalThis as any).Image = originalImage;
      (globalThis as any).document = originalDocument;
    }

    // 3. HEIC and TIFF files are rejected immediately before keeping raw bytes
    await assert.rejects(
      async () => {
        await reencodePhotoToSafeJpeg(
          { name: 'IMG_1234.HEIC', type: 'image/heic' },
          'data:image/heic;base64,AAAA'
        );
      },
      /HEIC and TIFF photos cannot be safely stripped of GPS metadata/i
    );

    await assert.rejects(
      async () => {
        await reencodePhotoToSafeJpeg(
          { name: 'scan.tiff', type: 'image/tiff' },
          'data:image/tiff;base64,AAAA'
        );
      },
      /HEIC and TIFF photos cannot be safely stripped of GPS metadata/i
    );

    // 4. Non-JPEG canvas output (e.g. PNG fallback) is rejected
    await assert.rejects(
      async () => {
        await reencodePhotoToSafeJpeg(
          { name: 'photo.png', type: 'image/png' },
          'data:image/png;base64,AAAA',
          async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
        );
      },
      /could not be converted to a safe JPEG/i
    );

    // 5. Valid stripped JPEG succeeds
    const safeJpeg = await reencodePhotoToSafeJpeg(
      { name: 'dog_fouling.jpg', type: 'image/jpeg' },
      rawExifLeakDataUrl,
      async () => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/'
    );
    assert.equal(safeJpeg, 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/');
    assert.ok(safeJpeg.startsWith('data:image/jpeg;base64,'));
  });

  it('neutralizes spreadsheet formula injection in CSV export (H2)', () => {
    const maliciousReport = {
      ...INITIAL_REPORTS[0],
      note: '=cmd|\'/C calc\'!A0',
      streetName: '+SUM(1,1), Church Road',
    };
    const csv = exportReportsToCsv([maliciousReport]);
    assert.ok(csv.includes("'=cmd|'/C calc'!A0"), 'Formula starting with = must be prefixed with a single quote');
    assert.ok(csv.includes('"\'+SUM(1,1), Church Road"'), 'Formula starting with + and containing comma must be prefixed and quoted');
  });

  it('buckets dates in Europe/Dublin local time including IST summer offset (L3)', () => {
    // 23:30 UTC on July 15 is 00:30 IST on July 16 in Greystones (Europe/Dublin)
    const dublinDate = formatDublinDate('2026-07-15T23:30:00.000Z');
    assert.equal(dublinDate, '2026-07-16');

    const snapshots = computeDailySnapshots([
      {
        ...INITIAL_REPORTS[0],
        id: 'rep-ist-test',
        createdAt: '2026-07-15T23:30:00.000Z',
        status: 'spotted',
      },
    ]);
    assert.ok(snapshots['2026-07-16'], 'Late-evening IST report must bucket into the local Dublin date');
  });
});

