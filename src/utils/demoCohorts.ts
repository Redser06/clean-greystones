import { FoulingReport, SeverityType } from '../types';
import { generateCivicTokenWithPrefix } from './adminAnalytics';

/** Present only in the demo cohort module. Prod bundles must not contain this string. */
export const SEED_MARKER = 'CLEAN_GREYSTONES_SEED_MARKER_v1';

/**
 * 1. Clean Greystones (Dog Fouling) — 12-Month Cohort (Nov 2025 – Oct 2026)
 */
export function buildHistoricalDogFoulingCohort(): FoulingReport[] {
  const zones = [
    {
      areaName: 'South Beach Prom',
      streetName: 'South Beach Promenade (Seafront Walk)',
      lat: 53.1439,
      lng: -6.0603,
      nearestBinId: 'bin-sb-14',
      nearestBinCode: 'Bin #G-14',
      dBinAllM: 6,
      h3Cell: '891e2040c18ffff',
    },
    {
      areaName: 'Church Road',
      streetName: 'Church Road & DART Station Approach',
      lat: 53.1451,
      lng: -6.0635,
      nearestBinId: 'bin-cr-08',
      nearestBinCode: 'Bin #G-08',
      dBinAllM: 9,
      h3Cell: '891e2040d16ffff',
    },
    {
      areaName: 'Harbour Marina Walk',
      streetName: 'Harbour Marina North Boardwalk & Plaza',
      lat: 53.1492,
      lng: -6.0631,
      nearestBinId: 'bin-hm-05',
      nearestBinCode: 'Bin #G-05',
      dBinAllM: 8,
      h3Cell: '891e2040e18ffff',
    },
    {
      areaName: 'Burnaby Park',
      streetName: 'Burnaby Park Footpath & Gate',
      lat: 53.1447,
      lng: -6.0633,
      nearestBinId: 'bin-cr-07',
      nearestBinCode: 'Bin #G-07',
      dBinAllM: 11,
      h3Cell: '891e2040c17ffff',
    },
    {
      areaName: 'The Cove',
      streetName: 'The Cove Coastal Steps',
      lat: 53.141,
      lng: -6.0588,
      nearestBinId: 'bin-cv-01',
      nearestBinCode: 'Bin #G-01',
      dBinAllM: 7,
      h3Cell: '891e2040a19ffff',
    },
    {
      areaName: 'Kindlestown',
      streetName: 'Kindlestown Woods School Walk',
      lat: 53.1465,
      lng: -6.0762,
      nearestBinId: 'bin-cr-19',
      nearestBinCode: 'Bin #G-19',
      dBinAllM: 445,
      h3Cell: '891e2040d10ffff',
    },
    {
      areaName: 'Charlesland Spine',
      streetName: 'Charlesland Spine Cycle & Footpath',
      lat: 53.1332,
      lng: -6.0664,
      nearestBinId: 'bin-sb-10',
      nearestBinCode: 'Bin #G-10',
      dBinAllM: 910,
      h3Cell: '891e2040915ffff',
    },
  ];

  const monthlySpec: { year: number; month: number; count: number }[] = [
    { year: 2025, month: 11, count: 15 },
    { year: 2025, month: 12, count: 14 },
    { year: 2026, month: 1, count: 16 },
    { year: 2026, month: 2, count: 14 },
    { year: 2026, month: 3, count: 16 },
    { year: 2026, month: 4, count: 17 },
    { year: 2026, month: 5, count: 17 },
    { year: 2026, month: 6, count: 18 },
    { year: 2026, month: 7, count: 19 },
    { year: 2026, month: 8, count: 18 },
    { year: 2026, month: 9, count: 16 },
    { year: 2026, month: 10, count: 6 },
  ];

  const diurnalHours = [7, 8, 8, 9, 9, 10, 10, 11, 13, 15, 16, 17, 18, 18, 19, 20, 21];
  const severities: SeverityType[] = [
    'just_poop',
    'stepped_in',
    'just_poop',
    'buggy_wheels',
    'just_poop',
    'stepped_in',
    'wheelchair_wheels',
    'just_poop',
  ];

  const tokenPool = Array.from({ length: 64 }, (_, idx) => {
    const hex = ((idx + 17) * 4099)
      .toString(16)
      .toUpperCase()
      .padStart(6, '0')
      .slice(0, 6);
    return generateCivicTokenWithPrefix('GS', hex);
  });

  const historical: FoulingReport[] = [];
  let seq = 1;

  for (const m of monthlySpec) {
    const weekendDays: number[] = [];
    const weekdayDays: number[] = [];
    for (let d = 1; d <= 28; d++) {
      const dow = new Date(Date.UTC(m.year, m.month - 1, d)).getUTCDay();
      if (dow === 0 || dow === 6) weekendDays.push(d);
      else weekdayDays.push(d);
    }

    for (let i = 0; i < m.count; i++) {
      const useWeekend = i % 11 < 5;
      const dayOfMonth = useWeekend
        ? weekendDays[(i + m.month) % weekendDays.length]
        : weekdayDays[(i * 2 + m.month) % weekdayDays.length];

      const hour = useWeekend
        ? [8, 9, 9, 10, 10, 11, 11, 14, 17, 18][i % 10]
        : diurnalHours[(i + m.month) % diurnalHours.length];

      const minute = (seq * 13) % 60;
      const z = zones[(seq + i) % zones.length];
      const sev = severities[(seq + i * 3) % severities.length];
      const distJitter = z.dBinAllM <= 50 ? (seq % 11) - 2 : (seq % 45) - 10;
      const dBinAllM = Math.max(2, z.dBinAllM + distJitter);

      const createdAt = new Date(
        Date.UTC(m.year, m.month - 1, dayOfMonth, hour, minute, 0)
      ).toISOString();

      historical.push({
        id: `hist-gs-${1000 + seq}`,
        appStream: 'clean_greystones',
        createdAt,
        lat: Number((z.lat + ((seq % 7) - 3) * 0.00012).toFixed(5)),
        lng: Number((z.lng + ((seq % 5) - 2) * 0.00014).toFixed(5)),
        accuracyM: 3.1,
        streetName: z.streetName,
        areaName: z.areaName,
        h3Cell: z.h3Cell,
        severity: sev,
        status: 'spotted',
        confirmations: 1 + (seq % 4),
        note:
          dBinAllM <= 20
            ? `Logged ${dBinAllM}m from ${z.nearestBinCode} during ${
                useWeekend ? 'weekend coastal walk' : 'weekday commute'
              }.`
            : `Outer walking route (${dBinAllM}m from nearest bin).`,
        submitterToken: tokenPool[(seq * 3 + i) % tokenPool.length],
        nearestBinId: z.nearestBinId,
        nearestBinCode: z.nearestBinCode,
        dBinAllM,
        dBinVerifiedM: dBinAllM,
        isSeededDemo: true,
        is_seeded_demo: true,
      });

      seq++;
    }
  }

  return historical;
}

/**
 * 2. Fix Greystones Roads (Potholes & Trenches) — 12-Month Cohort (Nov 2025 – Oct 2026)
 */
export function buildHistoricalRoadsCohort(): FoulingReport[] {
  const zones = [
    {
      areaName: 'R761 Church Rd',
      routeCode: 'R761',
      streetName: 'R761 Church Road & Station Road Corridor',
      lat: 53.1451,
      lng: -6.0635,
      nearestBinId: 'patch-r761-01',
      nearestBinCode: 'Patch #R761-01',
      dBinAllM: 6,
      h3Cell: '891e2040d16ffff',
    },
    {
      areaName: 'R762 Mill Rd & Delgany',
      routeCode: 'R762',
      streetName: 'R762 Mill Road & Delgany Approach',
      lat: 53.1421,
      lng: -6.0689,
      nearestBinId: 'patch-r762-03',
      nearestBinCode: 'Patch #R762-03',
      dBinAllM: 5,
      h3Cell: '891e2040b13ffff',
    },
    {
      areaName: 'R761 Blacklion & Redford',
      routeCode: 'R761',
      streetName: 'R761 Blacklion School & Cycle Corridor',
      lat: 53.1518,
      lng: -6.0714,
      nearestBinId: 'patch-r761-05',
      nearestBinCode: 'Patch #R761-05',
      dBinAllM: 7,
      h3Cell: '891e2040f12ffff',
    },
    {
      areaName: 'Marine Rd & Seafront',
      routeCode: 'L-1024',
      streetName: 'L-1024 Marine Road & Harbour Plaza',
      lat: 53.1468,
      lng: -6.0604,
      nearestBinId: 'trench-ue-07',
      nearestBinCode: 'Trench #UE-07',
      dBinAllM: 6,
      h3Cell: '891e2040d18ffff',
    },
    {
      areaName: 'R774 Charlesland Spine',
      routeCode: 'R774',
      streetName: 'R774 Charlesland Dual Approach & Roundabout',
      lat: 53.1338,
      lng: -6.0668,
      nearestBinId: 'patch-r774-09',
      nearestBinCode: 'Patch #R774-09',
      dBinAllM: 8,
      h3Cell: '891e2040915ffff',
    },
    {
      areaName: 'Burnaby & Killincarrig',
      routeCode: 'L-1028',
      streetName: 'L-1028 Burnaby Road & Killincarrig Cross',
      lat: 53.1445,
      lng: -6.0675,
      nearestBinId: 'trench-fib-10',
      nearestBinCode: 'Trench #FIB-10',
      dBinAllM: 9,
      h3Cell: '891e2040c17ffff',
    },
    {
      areaName: 'Kindlestown & Bellevue',
      routeCode: 'L-1031',
      streetName: 'L-1031 Kindlestown Hill & Bellevue',
      lat: 53.1465,
      lng: -6.0762,
      nearestBinId: 'patch-kill-12',
      nearestBinCode: 'Patch #L1028-12',
      dBinAllM: 410,
      h3Cell: '891e2040d10ffff',
    },
  ];

  const monthlySpec: { year: number; month: number; count: number }[] = [
    { year: 2025, month: 11, count: 16 },
    { year: 2025, month: 12, count: 19 },
    { year: 2026, month: 1, count: 21 },
    { year: 2026, month: 2, count: 20 },
    { year: 2026, month: 3, count: 17 },
    { year: 2026, month: 4, count: 15 },
    { year: 2026, month: 5, count: 14 },
    { year: 2026, month: 6, count: 13 },
    { year: 2026, month: 7, count: 14 },
    { year: 2026, month: 8, count: 13 },
    { year: 2026, month: 9, count: 15 },
    { year: 2026, month: 10, count: 18 },
  ];

  const diurnalHours = [7, 8, 8, 9, 9, 10, 11, 13, 15, 16, 17, 17, 18, 18, 19, 20];
  const severities: SeverityType[] = [
    'just_poop',
    'stepped_in',
    'wheelchair_wheels',
    'buggy_wheels',
    'just_poop',
    'stepped_in',
    'wheelchair_wheels',
    'just_poop',
  ];

  const tokenPool = Array.from({ length: 64 }, (_, idx) => {
    const hex = ((idx + 23) * 4099)
      .toString(16)
      .toUpperCase()
      .padStart(6, '0')
      .slice(0, 6);
    return generateCivicTokenWithPrefix('GR', hex);
  });

  const historical: FoulingReport[] = [];
  let seq = 1;

  for (const m of monthlySpec) {
    const weekendDays: number[] = [];
    const weekdayDays: number[] = [];
    for (let d = 1; d <= 28; d++) {
      const dow = new Date(Date.UTC(m.year, m.month - 1, d)).getUTCDay();
      if (dow === 0 || dow === 6) weekendDays.push(d);
      else weekdayDays.push(d);
    }

    for (let i = 0; i < m.count; i++) {
      const useWeekend = i % 11 < 5;
      const dayOfMonth = useWeekend
        ? weekendDays[(i + m.month) % weekendDays.length]
        : weekdayDays[(i * 2 + m.month) % weekdayDays.length];

      const hour = useWeekend
        ? [8, 9, 9, 10, 10, 11, 12, 14, 16, 17][i % 10]
        : diurnalHours[(i + m.month) % diurnalHours.length];

      const minute = (seq * 17) % 60;
      const z = zones[(seq + i) % zones.length];
      const sev = severities[(seq + i * 3) % severities.length];
      const distJitter = z.dBinAllM <= 50 ? (seq % 9) - 2 : (seq % 45) - 10;
      const dBinAllM = Math.max(2, z.dBinAllM + distJitter);
      const damageEuro =
        sev === 'wheelchair_wheels'
          ? 180 + (seq % 5) * 45
          : sev === 'stepped_in'
          ? (seq % 3 === 0 ? 140 : 0)
          : sev === 'buggy_wheels'
          ? (seq % 4 === 0 ? 75 : 0)
          : 0;

      const createdAt = new Date(
        Date.UTC(m.year, m.month - 1, dayOfMonth, hour, minute, 0)
      ).toISOString();

      historical.push({
        id: `hist-road-${2000 + seq}`,
        appStream: 'greystones_roads',
        createdAt,
        lat: Number((z.lat + ((seq % 7) - 3) * 0.00012).toFixed(5)),
        lng: Number((z.lng + ((seq % 5) - 2) * 0.00014).toFixed(5)),
        accuracyM: 2.6,
        streetName: z.streetName,
        areaName: z.areaName,
        routeCode: z.routeCode,
        h3Cell: z.h3Cell,
        severity: sev,
        status: 'spotted',
        confirmations: 1 + (seq % 5),
        damageEuro,
        depthCm: 5 + (seq % 7),
        note:
          dBinAllM <= 20
            ? `Repeat washout ${dBinAllM}m from ${z.nearestBinCode} (${z.routeCode}).`
            : `Unpatched local carriageway defect (${dBinAllM}m from nearest council patch).`,
        submitterToken: tokenPool[(seq * 3 + i) % tokenPool.length],
        nearestBinId: z.nearestBinId,
        nearestBinCode: z.nearestBinCode,
        dBinAllM,
        dBinVerifiedM: dBinAllM,
        isSeededDemo: true,
        is_seeded_demo: true,
      });

      seq++;
    }
  }

  return historical;
}

export const HISTORICAL_DOG_FOULING_COHORT: FoulingReport[] =
  buildHistoricalDogFoulingCohort();
export const HISTORICAL_ROADS_COHORT: FoulingReport[] =
  buildHistoricalRoadsCohort();

// Default historical cohort for Clean Greystones tests
export const HISTORICAL_GREYSTONES_COHORT: FoulingReport[] =
  HISTORICAL_DOG_FOULING_COHORT;


export const DEMO_COHORT_FINGERPRINT = `${SEED_MARKER}:${HISTORICAL_DOG_FOULING_COHORT.length}:${HISTORICAL_ROADS_COHORT.length}`;
