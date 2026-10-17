import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NEAR_BIN_METRES,
  distanceToNearestLitterBin,
  litterBinsFromGeoJson,
  nearBinSentence,
  summariseBinDistance,
  type GeoJsonPointCollection,
} from '../lib/binDistance';
import { councilReportMarkdown } from '../lib/councilExport';
import { haversineMetres } from '../lib/geo';
import { createReport } from '../lib/reportFlow';
import type { LitterBin } from '../types';

const geojson = JSON.parse(
  readFileSync(new URL('../../osm_bins_2026-10-16.geojson', import.meta.url), 'utf8'),
) as GeoJsonPointCollection;

describe('bin distance', () => {
  const bins = litterBinsFromGeoJson(geojson);

  it('keeps litter bins and drops recycling bring-banks', () => {
    assert.equal(bins.length, 16);
    assert.equal(geojson.features.length, 21);
    assert.ok(bins.every((bin) => bin.id.startsWith('node/')));
  });

  it('measures a south beach report as near a litter bin', () => {
    const metres = distanceToNearestLitterBin(53.14431, -6.06047, bins);
    assert.ok(metres !== null && metres <= 10);
    assert.equal(haversineMetres(53.14431, -6.06047, 53.14431, -6.06047), 0);
  });

  it('does not treat a recycling bank as a litter bin', () => {
    const recycling = geojson.features.find((feature) => feature.properties?.amenity === 'recycling');
    const [lng, lat] = recycling?.geometry?.coordinates ?? [];
    assert.equal(typeof lat, 'number');
    const metres = distanceToNearestLitterBin(lat as number, lng as number, bins);
    assert.ok(metres !== null && metres > 0);
  });

  it('publishes one percentage, at 50 metres', () => {
    assert.equal(NEAR_BIN_METRES, 50);
    const near = { lat: 53.14431, lng: -6.06047 };
    const far = { lat: 53.1332, lng: -6.0664 };
    const mixed = summariseBinDistance([near, far], bins);
    assert.equal(mixed.total, 2);
    assert.equal(mixed.withinNearBin, 1);
    assert.equal(mixed.withinNearBinPercent, 50);
    assert.equal(mixed.beyond200m, 1);
    assert.equal(nearBinSentence(mixed), '50% of reports are within 50 metres of the nearest litter bin.');

    const empty = summariseBinDistance([], bins);
    assert.equal(empty.withinNearBinPercent, null);
    assert.match(nearBinSentence(empty), /no reports/i);
  });

  it('uses that same sentence in the council export', () => {
    const reports = [
      createReport({ lat: 53.14431, lng: -6.06047, id: 'near', now: new Date('2026-10-04T12:00:00Z') }),
      createReport({ lat: 53.1332, lng: -6.0664, id: 'far', now: new Date('2026-09-11T12:00:00Z') }),
    ];
    const markdown = councilReportMarkdown(reports, bins, new Date('2026-10-17T12:00:00Z'));
    const summary = summariseBinDistance(reports, bins);
    assert.ok(markdown.includes(nearBinSentence(summary)));
    assert.match(markdown, /not a verified dog-fouling penalty amount/);
    assert.match(markdown, /section 22/);
    assert.doesNotMatch(markdown, /€250|Verified dog|Myth-Buster/);
  });

  it('returns null when there are no bins to measure', () => {
    const none: LitterBin[] = [];
    assert.equal(distanceToNearestLitterBin(53.14, -6.06, none), null);
  });
});
