import { CivicAppStream, FoulingReport, SeverityType } from '../types';

const ADMIN_SESSION_STORAGE_KEY = 'greystones_civic_common_admin_session_v2';
export const SESSION_EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Computes the SHA-256 hex digest using WebCrypto or Node.js crypto.
 */
export async function computeSha256Hex(input: string): Promise<string> {
  const trimmed = input.trim();
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const data = new TextEncoder().encode(trimmed);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Node.js test environment sync fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('crypto');
    return nodeCrypto.createHash('sha256').update(trimmed).digest('hex');
  } catch {
    return trimmed;
  }
}

export function isAdminSessionActive(): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const session = JSON.parse(raw);
    if (session && typeof session.expiresAt === 'number') {
      if (Date.now() < session.expiresAt) {
        return true;
      }
      // Expired session auto-eviction
      window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

export function setAdminSessionActive(active: boolean = true): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (active) {
      const now = Date.now();
      const sessionData = {
        authenticated: true,
        createdAt: now,
        expiresAt: now + SESSION_EXPIRATION_MS,
      };
      window.sessionStorage.setItem(
        ADMIN_SESSION_STORAGE_KEY,
        JSON.stringify(sessionData)
      );
    } else {
      window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export type AppStreamFilter = 'all' | 'clean_greystones' | 'greystones_roads';

/**
 * Deterministic token generator & validator supporting both sister apps:
 * - Clean Greystones: GS-ANON-XXXX-XXXX
 * - Fix Greystones Roads: GR-ANON-XXXX-XXXX
 */
export function generateCivicTokenWithPrefix(
  prefix: 'GS' | 'GR',
  seedHex: string
): string {
  const rawHex = seedHex
    .toUpperCase()
    .replace(/[^0-9A-F]/g, 'A')
    .padEnd(6, '7')
    .slice(0, 6);
  let sum = 0x5a;
  for (let i = 0; i < rawHex.length; i++) {
    sum = (sum + rawHex.charCodeAt(i) * (i + 3)) & 0xff;
  }
  const checkHex = sum.toString(16).toUpperCase().padStart(2, '0');
  return `${prefix}-ANON-${rawHex.slice(0, 4)}-${rawHex.slice(4, 6)}${checkHex}`;
}

export function isValidAnyCivicToken(token: string): boolean {
  const match = /^(GS|GR)-ANON-([0-9A-F]{4})-([0-9A-F]{2})([0-9A-F]{2})$/.exec(
    token.trim()
  );
  if (!match) return false;
  const prefix = match[1] as 'GS' | 'GR';
  const seedHex = `${match[2]}${match[3]}`;
  return generateCivicTokenWithPrefix(prefix, seedHex) === token.trim();
}

export function inferReportAppStream(report: FoulingReport): CivicAppStream {
  if (report.appStream) return report.appStream;
  if (
    report.submitterToken.startsWith('GR-ANON-') ||
    report.id.startsWith('pot-') ||
    report.id.startsWith('hist-road-') ||
    Boolean(report.routeCode)
  ) {
    return 'greystones_roads';
  }
  return 'clean_greystones';
}

export function getReportSeverityDisplay(report: FoulingReport): {
  emoji: string;
  label: string;
  shortLabel: string;
  isHighImpact: boolean;
} {
  const stream = inferReportAppStream(report);
  if (stream === 'greystones_roads') {
    switch (report.severity) {
      case 'just_poop':
        return {
          emoji: '🕳️',
          label: 'Pothole / Surface Crater',
          shortLabel: 'Pothole',
          isHighImpact: false,
        };
      case 'stepped_in':
        return {
          emoji: '🚧',
          label: 'Sunken Utility Trench / Ponding',
          shortLabel: 'Trench',
          isHighImpact: true,
        };
      case 'buggy_wheels':
        return {
          emoji: '🚲',
          label: 'Cyclist / Buggy Pinch-Point Hazard',
          shortLabel: 'Cycle/Buggy',
          isHighImpact: true,
        };
      case 'wheelchair_wheels':
        return {
          emoji: '🛞',
          label: 'Tyre Puncture / Alloy Rim Strike',
          shortLabel: 'Tyre/Rim',
          isHighImpact: true,
        };
    }
  }

  switch (report.severity) {
    case 'just_poop':
      return {
        emoji: '💩',
        label: 'Dog Poop Spotted',
        shortLabel: 'Poop',
        isHighImpact: false,
      };
    case 'stepped_in':
      return {
        emoji: '👟',
        label: 'Stepped In It (Footwear)',
        shortLabel: 'Stepped In',
        isHighImpact: true,
      };
    case 'buggy_wheels':
      return {
        emoji: '👶',
        label: 'Buggy / Pram Wheels Hit',
        shortLabel: 'Buggy',
        isHighImpact: true,
      };
    case 'wheelchair_wheels':
      return {
        emoji: '♿',
        label: 'Wheelchair Wheels Hit',
        shortLabel: 'Wheelchair',
        isHighImpact: true,
      };
  }
}

export interface MonthlyBucket {
  monthKey: string; // YYYY-MM
  label: string; // e.g. 'Nov 25'
  season: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
  count: number;
  foulingCount: number;
  roadsCount: number;
  highImpactCount: number;
  nearBin50mCount: number;
  nearBin50mPct: number;
  damageEuroTotal: number;
}

export interface SeasonSummary {
  season: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
  monthsLabel: string;
  count: number;
  sharePct: number;
  avgPerMonth: number;
  seasonalIndex: number; // 1.00 = annual monthly average
}

export interface DayOfWeekBucket {
  dayIndex: number; // 0 = Mon ... 6 = Sun
  shortLabel: string; // 'Mon'..'Sun'
  fullLabel: string;
  isWeekend: boolean;
  count: number;
  sharePct: number;
  highImpactCount: number;
}

export interface DiurnalWindowBucket {
  id: string;
  label: string;
  hoursLabel: string;
  startHour: number;
  endHour: number;
  count: number;
  sharePct: number;
  weekdayCount: number;
  weekendCount: number;
  patrolPriority: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
}

export interface SubmitterCohortRow {
  token: string;
  appStream: CivicAppStream;
  isValidChecksum: boolean;
  reportCount: number;
  confirmationsTotal: number;
  damageEuroTotal: number;
  zonesReported: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface TemporalModelSummary {
  totalAnalyzed: number;
  foulingCount: number;
  roadsCount: number;
  totalDamageEuro: number;
  dateRangeLabel: string;
  weeklyRateAvg: number;
  monthlySeries: MonthlyBucket[];
  seasonalBreakdown: SeasonSummary[];
  seasonalityCoefficientOfVariation: number;
  isYearRoundStructural: boolean;
  winterToSummerRatioPct: number;
  seasonalityHeadline: string;
  seasonalityExplanation: string;
  dayOfWeekSeries: DayOfWeekBucket[];
  weekdayAvgPerDay: number;
  weekendAvgPerDay: number;
  weekendSpikeMultiplier: number;
  peakDayLabel: string;
  weekendHeadline: string;
  diurnalSeries: DiurnalWindowBucket[];
  hourlyHistogram: { hour: number; label: string; count: number; isPeak: boolean }[];
  peakDiurnalWindow: DiurnalWindowBucket;
  topTwoWindowsCapturePct: number;
  patrolPrescription: string;
  submitterCohorts: SubmitterCohortRow[];
  validTokenPct: number;
  singleReportSubmittersPct: number;
}

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

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function getSeasonForMonth(month1to12: number): 'Winter' | 'Spring' | 'Summer' | 'Autumn' {
  if (month1to12 === 12 || month1to12 === 1 || month1to12 === 2) return 'Winter';
  if (month1to12 >= 3 && month1to12 <= 5) return 'Spring';
  if (month1to12 >= 6 && month1to12 <= 8) return 'Summer';
  return 'Autumn';
}

export function computeTemporalAndSeasonalModel(
  reports: FoulingReport[],
  appFilter: AppStreamFilter = 'clean_greystones'
): TemporalModelSummary {
  const sorted = [...reports].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const total = sorted.length;
  const safeDiv = total === 0 ? 1 : total;

  let foulingCount = 0;
  let roadsCount = 0;
  for (const r of sorted) {
    if (inferReportAppStream(r) === 'greystones_roads') roadsCount++;
    else foulingCount++;
  }

  const totalDamageEuro = sorted.reduce((acc, r) => acc + (r.damageEuro ?? 0), 0);

  const firstDate = sorted[0] ? new Date(sorted[0].createdAt) : new Date();
  const lastDate = sorted[sorted.length - 1]
    ? new Date(sorted[sorted.length - 1].createdAt)
    : new Date();
  const spanDays = Math.max(
    7,
    Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const weeklyRateAvg = Number(((total / spanDays) * 7).toFixed(1));

  const dateRangeLabel =
    total > 0
      ? `${
          MONTH_SHORT_NAMES[firstDate.getUTCMonth()]
        } ${firstDate.getUTCFullYear()} – ${
          MONTH_SHORT_NAMES[lastDate.getUTCMonth()]
        } ${lastDate.getUTCFullYear()} (${total} records)`
      : 'No records in current filter';

  // 1. Monthly Series
  const monthMap = new Map<
    string,
    {
      year: number;
      month: number;
      count: number;
      foulingCount: number;
      roadsCount: number;
      highImpactCount: number;
      nearBin50mCount: number;
      damageEuroTotal: number;
    }
  >();

  for (const r of sorted) {
    const dt = new Date(r.createdAt);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const existing = monthMap.get(key) ?? {
      year: y,
      month: m,
      count: 0,
      foulingCount: 0,
      roadsCount: 0,
      highImpactCount: 0,
      nearBin50mCount: 0,
      damageEuroTotal: 0,
    };
    existing.count += 1;
    if (inferReportAppStream(r) === 'greystones_roads') {
      existing.roadsCount += 1;
    } else {
      existing.foulingCount += 1;
    }
    if (getReportSeverityDisplay(r).isHighImpact) {
      existing.highImpactCount += 1;
    }
    if (r.dBinAllM <= 50) {
      existing.nearBin50mCount += 1;
    }
    existing.damageEuroTotal += r.damageEuro ?? 0;
    monthMap.set(key, existing);
  }

  const monthlySeries: MonthlyBucket[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, val]) => ({
      monthKey,
      label: `${MONTH_SHORT_NAMES[val.month - 1]} ${String(val.year).slice(-2)}`,
      season: getSeasonForMonth(val.month),
      count: val.count,
      foulingCount: val.foulingCount,
      roadsCount: val.roadsCount,
      highImpactCount: val.highImpactCount,
      nearBin50mCount: val.nearBin50mCount,
      nearBin50mPct:
        val.count === 0 ? 0 : Math.round((val.nearBin50mCount / val.count) * 100),
      damageEuroTotal: val.damageEuroTotal,
    }));

  // 2. Seasonal Breakdown
  const seasonOrder: {
    season: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
    monthsLabel: string;
  }[] = [
    { season: 'Winter', monthsLabel: 'Dec – Feb' },
    { season: 'Spring', monthsLabel: 'Mar – May' },
    { season: 'Summer', monthsLabel: 'Jun – Aug' },
    { season: 'Autumn', monthsLabel: 'Sep – Nov' },
  ];

  const seasonCounts = new Map<'Winter' | 'Spring' | 'Summer' | 'Autumn', number>([
    ['Winter', 0],
    ['Spring', 0],
    ['Summer', 0],
    ['Autumn', 0],
  ]);
  const seasonMonthsSeen = new Map<
    'Winter' | 'Spring' | 'Summer' | 'Autumn',
    Set<string>
  >([
    ['Winter', new Set()],
    ['Spring', new Set()],
    ['Summer', new Set()],
    ['Autumn', new Set()],
  ]);

  for (const m of monthlySeries) {
    seasonCounts.set(m.season, (seasonCounts.get(m.season) ?? 0) + m.count);
    seasonMonthsSeen.get(m.season)?.add(m.monthKey);
  }

  const avgMonthlyOverall =
    monthlySeries.length > 0 ? total / monthlySeries.length : 0;

  const seasonalBreakdown: SeasonSummary[] = seasonOrder.map(
    ({ season, monthsLabel }) => {
      const c = seasonCounts.get(season) ?? 0;
      const mCount = Math.max(1, seasonMonthsSeen.get(season)?.size ?? 1);
      const avgPerMonth = Number((c / mCount).toFixed(1));
      const seasonalIndex =
        avgMonthlyOverall > 0
          ? Number((avgPerMonth / avgMonthlyOverall).toFixed(2))
          : 0;
      return {
        season,
        monthsLabel,
        count: c,
        sharePct: total === 0 ? 0 : Math.round((c / safeDiv) * 100),
        avgPerMonth,
        seasonalIndex,
      };
    }
  );

  const populatedSeasonAvgs = seasonalBreakdown
    .filter((s) => s.count > 0)
    .map((s) => s.avgPerMonth);
  let seasonalityCV = 0;
  if (populatedSeasonAvgs.length >= 2) {
    const mean =
      populatedSeasonAvgs.reduce((acc, v) => acc + v, 0) /
      populatedSeasonAvgs.length;
    const variance =
      populatedSeasonAvgs.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
      populatedSeasonAvgs.length;
    seasonalityCV =
      mean > 0 ? Number((Math.sqrt(variance) / mean).toFixed(2)) : 0;
  }

  const winterAvg =
    seasonalBreakdown.find((s) => s.season === 'Winter')?.avgPerMonth ?? 0;
  const summerAvg =
    seasonalBreakdown.find((s) => s.season === 'Summer')?.avgPerMonth ?? 0;
  const winterToSummerRatioPct =
    summerAvg > 0 ? Math.round((winterAvg / summerAvg) * 100) : 100;

  const isYearRoundStructural =
    populatedSeasonAvgs.length >= 3 && summerAvg >= 10 && winterToSummerRatioPct >= 70;

  let seasonalityHeadline = `Short-Window Snapshot (${monthlySeries.length} month${
    monthlySeries.length === 1 ? '' : 's'
  })`;
  let seasonalityExplanation = `Switch to the 12-Month Model above to inspect the full 4-season trajectory.`;

  if (isYearRoundStructural) {
    if (appFilter === 'greystones_roads') {
      seasonalityHeadline = `Year-Round Trench Baseline + ${winterToSummerRatioPct}% Winter Freeze-Thaw Surge (CV ${seasonalityCV})`;
      seasonalityExplanation = `Summer still records ${summerAvg} road defects/month due to year-round utility trench subsidence (Uisce Éireann / ESB / Fibre cuts), while Winter spikes to ${winterAvg}/month (${winterToSummerRatioPct}% of Summer rate) when frost and heavy rain wash out temporary cold-tar patches.`;
    } else if (appFilter === 'all') {
      seasonalityHeadline = `Combined Civic Baseline — ${winterToSummerRatioPct}% Winter-to-Summer Ratio (${foulingCount} Fouling + ${roadsCount} Road Defects)`;
      seasonalityExplanation = `Across both Greystones apps, Summer averages ${summerAvg} reports/month (seafront dog fouling + utility trench subsidence) and Winter averages ${winterAvg} reports/month (dark commuter dog-fouling + winter freeze-thaw pothole washouts).`;
    } else {
      seasonalityHeadline = `Year-Round Structural Issue — Winter Retains ${winterToSummerRatioPct}% of Summer Rate (CV ${seasonalityCV})`;
      seasonalityExplanation = `Seasonal variance across all 4 quarters is low (CV = ${seasonalityCV}). Winter averages ${winterAvg} reports/month vs ${summerAvg}/month in Summer (${winterToSummerRatioPct}%), proving Greystones dog fouling is a year-round resident compliance issue rather than a summer day-tripper spike.`;
    }
  }

  // 3. Day-of-Week & Weekend Spike
  const dayNames = [
    { short: 'Mon', full: 'Monday', isWeekend: false },
    { short: 'Tue', full: 'Tuesday', isWeekend: false },
    { short: 'Wed', full: 'Wednesday', isWeekend: false },
    { short: 'Thu', full: 'Thursday', isWeekend: false },
    { short: 'Fri', full: 'Friday', isWeekend: false },
    { short: 'Sat', full: 'Saturday', isWeekend: true },
    { short: 'Sun', full: 'Sunday', isWeekend: true },
  ];

  const dowCounts = Array.from({ length: 7 }, () => ({
    count: 0,
    highImpactCount: 0,
  }));

  for (const r of sorted) {
    const jsDay = new Date(r.createdAt).getUTCDay();
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    dowCounts[idx].count += 1;
    if (getReportSeverityDisplay(r).isHighImpact) {
      dowCounts[idx].highImpactCount += 1;
    }
  }

  const dayOfWeekSeries: DayOfWeekBucket[] = dayNames.map((d, idx) => ({
    dayIndex: idx,
    shortLabel: d.short,
    fullLabel: d.full,
    isWeekend: d.isWeekend,
    count: dowCounts[idx].count,
    sharePct:
      total === 0 ? 0 : Math.round((dowCounts[idx].count / safeDiv) * 100),
    highImpactCount: dowCounts[idx].highImpactCount,
  }));

  const weekdayTotal = dayOfWeekSeries
    .filter((d) => !d.isWeekend)
    .reduce((acc, d) => acc + d.count, 0);
  const weekendTotal = dayOfWeekSeries
    .filter((d) => d.isWeekend)
    .reduce((acc, d) => acc + d.count, 0);

  const weekdayAvgPerDay = Number((weekdayTotal / 5).toFixed(1));
  const weekendAvgPerDay = Number((weekendTotal / 2).toFixed(1));
  const weekendSpikeMultiplier =
    weekdayAvgPerDay > 0
      ? Number((weekendAvgPerDay / weekdayAvgPerDay).toFixed(2))
      : 1;

  const peakDay = [...dayOfWeekSeries].sort((a, b) => b.count - a.count)[0];
  const peakDayLabel = peakDay ? `${peakDay.fullLabel} (${peakDay.count})` : 'N/A';

  const weekendHeadline =
    weekendSpikeMultiplier >= 1.25
      ? `${weekendSpikeMultiplier}× Weekend Daily Spike (Sat/Sun avg ${weekendAvgPerDay}/day vs Mon–Fri ${weekdayAvgPerDay}/day)`
      : `Balanced Daily Distribution (${weekendSpikeMultiplier}× Weekend/Weekday ratio)`;

  // 4. Diurnal Time-of-Day Windows & 24-Hour Histogram
  const windowDefs: {
    id: string;
    label: string;
    hoursLabel: string;
    startHour: number;
    endHour: number;
  }[] = [
    {
      id: 'early_commute',
      label: 'Early Morning Walk & DART Commute',
      hoursLabel: '06:00 – 08:59',
      startHour: 6,
      endHour: 8,
    },
    {
      id: 'mid_morning',
      label: 'Mid-Morning Promenade & School Run',
      hoursLabel: '09:00 – 11:59',
      startHour: 9,
      endHour: 11,
    },
    {
      id: 'midday',
      label: 'Lunchtime & Early Afternoon',
      hoursLabel: '12:00 – 14:59',
      startHour: 12,
      endHour: 14,
    },
    {
      id: 'school_afternoon',
      label: 'After-School & Buggy Walk',
      hoursLabel: '15:00 – 17:59',
      startHour: 15,
      endHour: 17,
    },
    {
      id: 'evening_peak',
      label: 'Evening Dusk Walk Peak',
      hoursLabel: '18:00 – 20:59',
      startHour: 18,
      endHour: 20,
    },
    {
      id: 'night_offpeak',
      label: 'Late Night / Unlit Footpaths',
      hoursLabel: '21:00 – 05:59',
      startHour: 21,
      endHour: 5,
    },
  ];

  const windowStats = windowDefs.map((w) => ({
    ...w,
    count: 0,
    weekdayCount: 0,
    weekendCount: 0,
  }));

  const hourlyCounts = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}:00`,
    count: 0,
    isPeak: false,
  }));

  for (const r of sorted) {
    const dt = new Date(r.createdAt);
    const h = dt.getUTCHours();
    const jsDay = dt.getUTCDay();
    const isWknd = jsDay === 0 || jsDay === 6;

    hourlyCounts[h].count += 1;

    let matchedIdx = 5;
    if (h >= 6 && h <= 8) matchedIdx = 0;
    else if (h >= 9 && h <= 11) matchedIdx = 1;
    else if (h >= 12 && h <= 14) matchedIdx = 2;
    else if (h >= 15 && h <= 17) matchedIdx = 3;
    else if (h >= 18 && h <= 20) matchedIdx = 4;

    windowStats[matchedIdx].count += 1;
    if (isWknd) windowStats[matchedIdx].weekendCount += 1;
    else windowStats[matchedIdx].weekdayCount += 1;
  }

  const maxHourly = Math.max(...hourlyCounts.map((x) => x.count), 1);
  hourlyCounts.forEach((hc) => {
    hc.isPeak = hc.count >= maxHourly * 0.7 && hc.count > 0;
  });

  const sortedByCount = [...windowStats].sort((a, b) => b.count - a.count);
  const top1Id = sortedByCount[0]?.id;
  const top2Id = sortedByCount[1]?.id;

  const diurnalSeries: DiurnalWindowBucket[] = windowStats.map((w) => {
    const sharePct = total === 0 ? 0 : Math.round((w.count / safeDiv) * 100);
    let patrolPriority: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' = 'LOW';
    if (w.id === top1Id) patrolPriority = 'CRITICAL';
    else if (w.id === top2Id || sharePct >= 18) patrolPriority = 'HIGH';
    else if (sharePct >= 10) patrolPriority = 'MODERATE';

    return {
      ...w,
      sharePct,
      patrolPriority,
    };
  });

  const peakDiurnalWindow =
    [...diurnalSeries].sort((a, b) => b.count - a.count)[0] ?? diurnalSeries[0];
  const secondDiurnalWindow =
    [...diurnalSeries].sort((a, b) => b.count - a.count)[1] ?? diurnalSeries[1];

  const topTwoWindowsCapturePct = Math.min(
    100,
    (peakDiurnalWindow?.sharePct ?? 0) + (secondDiurnalWindow?.sharePct ?? 0)
  );

  const patrolPrescription =
    appFilter === 'greystones_roads'
      ? `Deploying Greystones MD hot-box asphalt & gully jet-vac crews ahead of ${peakDiurnalWindow.hoursLabel} and ${secondDiurnalWindow.hoursLabel} addresses ${topTwoWindowsCapturePct}% of logged commuter & weekend cycling hazards on R761, R762, and R774.`
      : appFilter === 'all'
      ? `Peak Greystones civic reporting occurs during ${peakDiurnalWindow.hoursLabel} and ${secondDiurnalWindow.hoursLabel} (${topTwoWindowsCapturePct}% of all reports) with a ${weekendSpikeMultiplier}× weekend surge — aligning both Dog Warden patrols and MD Roads inspection windows.`
      : `Deploying 1 Greystones MD Warden during ${peakDiurnalWindow.hoursLabel} and ${secondDiurnalWindow.hoursLabel} (especially Sat/Sun) covers ${topTwoWindowsCapturePct}% of all logged fouling events.`;

  // 5. Submitter Cryptogram Cohorts
  const cohortMap = new Map<
    string,
    {
      token: string;
      appStream: CivicAppStream;
      isValidChecksum: boolean;
      reportCount: number;
      confirmationsTotal: number;
      damageEuroTotal: number;
      zones: Set<string>;
      firstSeen: string;
      lastSeen: string;
    }
  >();

  for (const r of sorted) {
    const tok = r.submitterToken;
    const existing = cohortMap.get(tok);
    if (!existing) {
      cohortMap.set(tok, {
        token: tok,
        appStream: inferReportAppStream(r),
        isValidChecksum: isValidAnyCivicToken(tok),
        reportCount: 1,
        confirmationsTotal: r.confirmations,
        damageEuroTotal: r.damageEuro ?? 0,
        zones: new Set([r.areaName]),
        firstSeen: r.createdAt,
        lastSeen: r.createdAt,
      });
    } else {
      existing.reportCount += 1;
      existing.confirmationsTotal += r.confirmations;
      existing.damageEuroTotal += r.damageEuro ?? 0;
      existing.zones.add(r.areaName);
      if (r.createdAt < existing.firstSeen) existing.firstSeen = r.createdAt;
      if (r.createdAt > existing.lastSeen) existing.lastSeen = r.createdAt;
    }
  }

  const submitterCohorts: SubmitterCohortRow[] = Array.from(cohortMap.values())
    .sort((a, b) => b.reportCount - a.reportCount)
    .map((c) => ({
      token: c.token,
      appStream: c.appStream,
      isValidChecksum: c.isValidChecksum,
      reportCount: c.reportCount,
      confirmationsTotal: c.confirmationsTotal,
      damageEuroTotal: c.damageEuroTotal,
      zonesReported: Array.from(c.zones),
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    }));

  const validTokensCount = sorted.filter((r) =>
    isValidAnyCivicToken(r.submitterToken)
  ).length;
  const validTokenPct =
    total === 0 ? 100 : Math.round((validTokensCount / safeDiv) * 100);

  const singleReportSubmitters = submitterCohorts.filter(
    (c) => c.reportCount <= 2
  ).length;
  const singleReportSubmittersPct =
    submitterCohorts.length === 0
      ? 0
      : Math.round((singleReportSubmitters / submitterCohorts.length) * 100);

  return {
    totalAnalyzed: total,
    foulingCount,
    roadsCount,
    totalDamageEuro,
    dateRangeLabel,
    weeklyRateAvg,
    monthlySeries,
    seasonalBreakdown,
    seasonalityCoefficientOfVariation: seasonalityCV,
    isYearRoundStructural,
    winterToSummerRatioPct,
    seasonalityHeadline,
    seasonalityExplanation,
    dayOfWeekSeries,
    weekdayAvgPerDay,
    weekendAvgPerDay,
    weekendSpikeMultiplier,
    peakDayLabel,
    weekendHeadline,
    diurnalSeries,
    hourlyHistogram: hourlyCounts,
    peakDiurnalWindow,
    topTwoWindowsCapturePct,
    patrolPrescription,
    submitterCohorts,
    validTokenPct,
    singleReportSubmittersPct,
  };
}

/**
 * Generates an RFC-4180 CSV string for Greystones MD Council / FOI / Engineering submission,
 * including `app_stream` ('clean_greystones' | 'greystones_roads'), `damage_euro`, and `depth_cm`.
 */
export function exportReportsToCsv(reports: FoulingReport[]): string {
  const headers = [
    'id',
    'app_stream',
    'created_at_utc',
    'route_code',
    'area_name',
    'street_name',
    'lat',
    'lng',
    'severity',
    'severity_label',
    'depth_cm',
    'damage_euro',
    'nearest_bin_or_patch',
    'distance_to_bin_m',
    'confirmations',
    'submitter_token',
    'token_checksum_valid',
    'is_seeded_demo',
    'note',
  ];

  const escapeCsv = (val: string | number | boolean | undefined) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = reports.map((r) => {
    const stream = inferReportAppStream(r);
    const sevMeta = getReportSeverityDisplay(r);
    return [
      r.id,
      stream,
      r.createdAt,
      r.routeCode ?? '',
      r.areaName,
      r.streetName,
      r.lat,
      r.lng,
      r.severity,
      sevMeta.label,
      r.depthCm ?? '',
      r.damageEuro ?? 0,
      r.nearestBinCode,
      r.dBinAllM,
      r.confirmations,
      r.submitterToken,
      isValidAnyCivicToken(r.submitterToken),
      Boolean(r.isSeededDemo),
      r.note ?? '',
    ]
      .map(escapeCsv)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
