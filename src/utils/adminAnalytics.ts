import { FoulingReport, SeverityType } from '../types';
import {
  generateAnonymousSubmitterToken,
  isValidSubmitterToken,
  SEVERITY_META,
} from './graphEngine';

const ADMIN_SESSION_STORAGE_KEY = 'clean_greystones_admin_session_v1';
export const DEFAULT_ADMIN_PASSCODE = 'GREYSTONES-MD-2026';

export function verifyAdminPasscode(input: string): boolean {
  const configured =
    (typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ADMIN_PASSCODE) ||
    DEFAULT_ADMIN_PASSCODE;
  return input.trim() === configured;
}

export function isAdminSessionActive(): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  try {
    return window.sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY) === 'authenticated';
  } catch {
    return false;
  }
}

export function setAdminSessionActive(active: boolean): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (active) {
      window.sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, 'authenticated');
    } else {
      window.sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export interface MonthlyBucket {
  monthKey: string; // YYYY-MM
  label: string; // e.g. 'Nov 25'
  season: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
  count: number;
  highImpactCount: number;
  nearBin50mCount: number;
  nearBin50mPct: number;
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
  isValidChecksum: boolean;
  reportCount: number;
  confirmationsTotal: number;
  zonesReported: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface TemporalModelSummary {
  totalAnalyzed: number;
  dateRangeLabel: string;
  weeklyRateAvg: number;
  monthlySeries: MonthlyBucket[];
  seasonalBreakdown: SeasonSummary[];
  seasonalityCoefficientOfVariation: number; // CV across seasons
  isYearRoundStructural: boolean;
  winterToSummerRatioPct: number;
  seasonalityHeadline: string;
  seasonalityExplanation: string;
  dayOfWeekSeries: DayOfWeekBucket[];
  weekdayAvgPerDay: number;
  weekendAvgPerDay: number;
  weekendSpikeMultiplier: number; // e.g. 1.82x
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
 * Deterministic 12-month historical Greystones baseline dataset (Nov 2025 – Oct 2026)
 * so the Admin Time-Series & Seasonality Lab can model year-round vs seasonal behaviour,
 * weekend spikes, and diurnal patrol windows alongside live resident reports.
 */
export function buildHistoricalGreystonesCohort(): FoulingReport[] {
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

  // 12 months from Nov 2025 to Oct 2026 showing strong year-round baseline (13 to 19 incidents/month)
  // Winter months still see 14-16 incidents (dark commute mornings/evenings), Summer sees 17-19.
  const monthlySpec: { year: number; month: number; count: number }[] = [
    { year: 2025, month: 11, count: 15 }, // Nov 25 (Autumn)
    { year: 2025, month: 12, count: 14 }, // Dec 25 (Winter)
    { year: 2026, month: 1, count: 16 },  // Jan 26 (Winter)
    { year: 2026, month: 2, count: 14 },  // Feb 26 (Winter)
    { year: 2026, month: 3, count: 16 },  // Mar 26 (Spring)
    { year: 2026, month: 4, count: 17 },  // Apr 26 (Spring)
    { year: 2026, month: 5, count: 17 },  // May 26 (Spring)
    { year: 2026, month: 6, count: 18 },  // Jun 26 (Summer)
    { year: 2026, month: 7, count: 19 },  // Jul 26 (Summer)
    { year: 2026, month: 8, count: 18 },  // Aug 26 (Summer)
    { year: 2026, month: 9, count: 16 },  // Sep 26 (Autumn)
    { year: 2026, month: 10, count: 6 },  // Early Oct 26 (supplemented by the 15 INITIAL_REPORTS in mid-Oct = 21)
  ];

  // Realistic diurnal hours weighted toward 07:00-10:30 morning dog walks & 17:00-20:00 evening walks
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

  // Pool of 64 distinct resident device tokens so cohort distribution is realistic
  const tokenPool = Array.from({ length: 64 }, (_, idx) => {
    const hex = ((idx + 17) * 4099)
      .toString(16)
      .toUpperCase()
      .padStart(6, '0')
      .slice(0, 6);
    return generateAnonymousSubmitterToken(hex);
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
      // ~46% of incidents fall on Sat/Sun (2 days/wk) vs ~54% across Mon-Fri (5 days/wk) -> ~2.0x weekend daily rate
      const useWeekend = i % 11 < 5;
      const dayOfMonth = useWeekend
        ? weekendDays[(i + m.month) % weekendDays.length]
        : weekdayDays[(i * 2 + m.month) % weekdayDays.length];

      const hour = useWeekend
        ? [8, 9, 9, 10, 10, 11, 11, 14, 17, 18][i % 10]
        : diurnalHours[(i + m.month) % diurnalHours.length];
      const minute = (seq * 13) % 60;

      const iso = `${m.year}-${String(m.month).padStart(2, '0')}-${String(dayOfMonth).padStart(
        2,
        '0'
      )}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;

      const z = zones[(seq + i) % zones.length];
      const jitterLat = ((seq % 7) - 3) * 0.00018;
      const jitterLng = ((seq % 5) - 2) * 0.00022;
      const distJitter = z.dBinAllM <= 20 ? Math.max(2, z.dBinAllM + ((seq % 7) - 3)) : z.dBinAllM + ((seq % 19) - 9);

      historical.push({
        id: `hist-${String(seq).padStart(3, '0')}`,
        createdAt: iso,
        lat: Number((z.lat + jitterLat).toFixed(5)),
        lng: Number((z.lng + jitterLng).toFixed(5)),
        accuracyM: 2.8,
        streetName: z.streetName,
        areaName: z.areaName,
        h3Cell: z.h3Cell,
        severity: severities[(seq + i) % severities.length],
        status: 'spotted',
        confirmations: 1 + (seq % 4),
        note:
          distJitter <= 15
            ? `Historical baseline log (${distJitter}m from ${z.nearestBinCode}).`
            : `Outer route log (${distJitter}m to nearest bin).`,
        submitterToken: tokenPool[(seq * 3 + i) % tokenPool.length],
        nearestBinId: z.nearestBinId,
        nearestBinCode: z.nearestBinCode,
        dBinAllM: distJitter,
        dBinVerifiedM: distJitter,
        isSeededDemo: true,
      });
      seq++;
    }
  }

  return historical;
}

export const HISTORICAL_GREYSTONES_COHORT: FoulingReport[] = buildHistoricalGreystonesCohort();

function getSeason(month1To12: number): 'Winter' | 'Spring' | 'Summer' | 'Autumn' {
  if (month1To12 === 12 || month1To12 === 1 || month1To12 === 2) return 'Winter';
  if (month1To12 >= 3 && month1To12 <= 5) return 'Spring';
  if (month1To12 >= 6 && month1To12 <= 8) return 'Summer';
  return 'Autumn';
}

const MONTH_SHORT = [
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

/**
 * Computes the complete Temporal, Seasonal, Day-of-Week, Diurnal, and Submitter Cohort model
 * for the Admin Backend Analytics Portal.
 */
export function computeTemporalAndSeasonalModel(
  reports: FoulingReport[]
): TemporalModelSummary {
  const active = reports.filter((r) => r.status === 'spotted');
  const total = active.length;
  const safeDiv = Math.max(total, 1);

  // Sort chronologically ascending
  const sorted = [...active].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let dateRangeLabel = 'No reports in current filter';
  let weeklyRateAvg = 0;
  if (sorted.length > 0) {
    const firstDate = new Date(sorted[0].createdAt);
    const lastDate = new Date(sorted[sorted.length - 1].createdAt);
    const spanDays = Math.max(
      7,
      (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    weeklyRateAvg = Number(((total / spanDays) * 7).toFixed(1));
    dateRangeLabel = `${firstDate.toISOString().slice(0, 10)} → ${lastDate
      .toISOString()
      .slice(0, 10)}`;
  }

  // 1. Monthly Series
  const monthMap = new Map<
    string,
    {
      monthKey: string;
      label: string;
      season: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
      count: number;
      highImpactCount: number;
      nearBin50mCount: number;
    }
  >();

  for (const r of sorted) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1; // 1..12
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const existing = monthMap.get(key) ?? {
      monthKey: key,
      label: `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`,
      season: getSeason(m),
      count: 0,
      highImpactCount: 0,
      nearBin50mCount: 0,
    };
    existing.count += 1;
    if (SEVERITY_META[r.severity].isHighImpact) existing.highImpactCount += 1;
    if (r.dBinAllM <= 50) existing.nearBin50mCount += 1;
    monthMap.set(key, existing);
  }

  const monthlySeries: MonthlyBucket[] = Array.from(monthMap.values()).map((m) => ({
    ...m,
    nearBin50mPct: m.count === 0 ? 0 : Math.round((m.nearBin50mCount / m.count) * 100),
  }));

  // 2. Seasonal Breakdown (Winter, Spring, Summer, Autumn)
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
  const seasonMonthsSeen = new Map<'Winter' | 'Spring' | 'Summer' | 'Autumn', Set<string>>([
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

  const seasonalBreakdown: SeasonSummary[] = seasonOrder.map(({ season, monthsLabel }) => {
    const c = seasonCounts.get(season) ?? 0;
    const mCount = Math.max(1, seasonMonthsSeen.get(season)?.size ?? 1);
    const avgPerMonth = Number((c / mCount).toFixed(1));
    const seasonalIndex =
      avgMonthlyOverall > 0 ? Number((avgPerMonth / avgMonthlyOverall).toFixed(2)) : 0;
    return {
      season,
      monthsLabel,
      count: c,
      sharePct: total === 0 ? 0 : Math.round((c / safeDiv) * 100),
      avgPerMonth,
      seasonalIndex,
    };
  });

  // Coefficient of Variation (stdDev / mean) across populated seasons
  const populatedSeasonAvgs = seasonalBreakdown
    .filter((s) => s.count > 0)
    .map((s) => s.avgPerMonth);
  let seasonalityCV = 0;
  if (populatedSeasonAvgs.length >= 2) {
    const mean =
      populatedSeasonAvgs.reduce((acc, v) => acc + v, 0) / populatedSeasonAvgs.length;
    const variance =
      populatedSeasonAvgs.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
      populatedSeasonAvgs.length;
    seasonalityCV = mean > 0 ? Number((Math.sqrt(variance) / mean).toFixed(2)) : 0;
  }

  const winterAvg =
    seasonalBreakdown.find((s) => s.season === 'Winter')?.avgPerMonth ?? 0;
  const summerAvg =
    seasonalBreakdown.find((s) => s.season === 'Summer')?.avgPerMonth ?? 0;
  const winterToSummerRatioPct =
    summerAvg > 0 ? Math.round((winterAvg / summerAvg) * 100) : 100;

  // If CV <= 0.25 and at least 3 seasons have data, it is statistically a Year-Round Structural Baseline
  const isYearRoundStructural =
    populatedSeasonAvgs.length >= 3 && seasonalityCV <= 0.25;

  const seasonalityHeadline = isYearRoundStructural
    ? `Year-Round Structural Baseline (Winter retains ${winterToSummerRatioPct}% of Summer rate · CV ${seasonalityCV})`
    : populatedSeasonAvgs.length < 3
    ? `Short-Window Snapshot (${monthlySeries.length} month${monthlySeries.length === 1 ? '' : 's'} in current filter)`
    : `Moderate Seasonal Variance (CV ${seasonalityCV})`;

  const seasonalityExplanation = isYearRoundStructural
    ? `Incident volume remains persistent across all 4 quarters (Winter avg ${winterAvg}/mo vs Summer avg ${summerAvg}/mo). This refutes the claim that Greystones fouling is a seasonal summer day-tripper phenomenon: it is driven year-round by routine local dog-walking Habits and zero warden fining.`
    : `Enable the 12-Month Full Model Cohort toggle above to inspect multi-season quarterly indices across Winter, Spring, Summer, and Autumn.`;

  // 3. Day of Week (Mon = 0 ... Sun = 6)
  const dayNames = [
    { short: 'Mon', full: 'Monday', isWeekend: false },
    { short: 'Tue', full: 'Tuesday', isWeekend: false },
    { short: 'Wed', full: 'Wednesday', isWeekend: false },
    { short: 'Thu', full: 'Thursday', isWeekend: false },
    { short: 'Fri', full: 'Friday', isWeekend: false },
    { short: 'Sat', full: 'Saturday', isWeekend: true },
    { short: 'Sun', full: 'Sunday', isWeekend: true },
  ];

  const dayCounts = Array.from({ length: 7 }, () => ({ count: 0, highImpact: 0 }));
  for (const r of sorted) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const jsDay = d.getUTCDay(); // 0=Sun..6=Sat
    const monIndex = (jsDay + 6) % 7; // 0=Mon..6=Sun
    dayCounts[monIndex].count += 1;
    if (SEVERITY_META[r.severity].isHighImpact) {
      dayCounts[monIndex].highImpact += 1;
    }
  }

  const dayOfWeekSeries: DayOfWeekBucket[] = dayNames.map((meta, idx) => ({
    dayIndex: idx,
    shortLabel: meta.short,
    fullLabel: meta.full,
    isWeekend: meta.isWeekend,
    count: dayCounts[idx].count,
    sharePct: total === 0 ? 0 : Math.round((dayCounts[idx].count / safeDiv) * 100),
    highImpactCount: dayCounts[idx].highImpact,
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
  const peakDayLabel = peakDay && peakDay.count > 0 ? peakDay.fullLabel : 'N/A';

  const weekendHeadline =
    weekendSpikeMultiplier >= 1.25
      ? `${weekendSpikeMultiplier}× Weekend Spike (${weekendAvgPerDay}/day on Sat–Sun vs ${weekdayAvgPerDay}/day Mon–Fri)`
      : `Evenly Distributed Across Week (${weekendSpikeMultiplier}× Sat–Sun ratio)`;

  // 4. Diurnal Time-of-Day Windows & 24h Histogram
  const windowDefs: Omit<
    DiurnalWindowBucket,
    'count' | 'sharePct' | 'weekdayCount' | 'weekendCount' | 'patrolPriority'
  >[] = [
    {
      id: 'early_morning',
      label: 'Early Commute & Dawn Walk',
      hoursLabel: '06:00 – 08:59',
      startHour: 6,
      endHour: 8,
    },
    {
      id: 'morning_peak',
      label: 'Peak Morning & School / Prom Walk',
      hoursLabel: '09:00 – 11:59',
      startHour: 9,
      endHour: 11,
    },
    {
      id: 'midday',
      label: 'Midday & Lunchtime Walk',
      hoursLabel: '12:00 – 14:59',
      startHour: 12,
      endHour: 14,
    },
    {
      id: 'afternoon',
      label: 'School Pickup & Afternoon',
      hoursLabel: '15:00 – 17:59',
      startHour: 15,
      endHour: 17,
    },
    {
      id: 'evening_dusk',
      label: 'Evening Dusk Walk (Unpoliced)',
      hoursLabel: '18:00 – 20:59',
      startHour: 18,
      endHour: 20,
    },
    {
      id: 'overnight',
      label: 'Late Night / Unlit Footpaths',
      hoursLabel: '21:00 – 05:59',
      startHour: 21,
      endHour: 5,
    },
  ];

  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  const windowAccum = windowDefs.map((w) => ({
    ...w,
    count: 0,
    weekdayCount: 0,
    weekendCount: 0,
  }));

  for (const r of sorted) {
    const d = new Date(r.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const h = d.getUTCHours();
    const jsDay = d.getUTCDay();
    const isWknd = jsDay === 0 || jsDay === 6;
    hourlyCounts[h] += 1;

    let winIdx = 5; // overnight default
    if (h >= 6 && h <= 8) winIdx = 0;
    else if (h >= 9 && h <= 11) winIdx = 1;
    else if (h >= 12 && h <= 14) winIdx = 2;
    else if (h >= 15 && h <= 17) winIdx = 3;
    else if (h >= 18 && h <= 20) winIdx = 4;

    windowAccum[winIdx].count += 1;
    if (isWknd) windowAccum[winIdx].weekendCount += 1;
    else windowAccum[winIdx].weekdayCount += 1;
  }

  const sortedByVolume = [...windowAccum].sort((a, b) => b.count - a.count);
  const topWinId = sortedByVolume[0]?.id;
  const secondWinId = sortedByVolume[1]?.id;

  const diurnalSeries: DiurnalWindowBucket[] = windowAccum.map((w) => {
    const sharePct = total === 0 ? 0 : Math.round((w.count / safeDiv) * 100);
    let patrolPriority: DiurnalWindowBucket['patrolPriority'] = 'LOW';
    if (w.id === topWinId && w.count > 0) patrolPriority = 'CRITICAL';
    else if (w.id === secondWinId && w.count > 0) patrolPriority = 'HIGH';
    else if (sharePct >= 14) patrolPriority = 'MODERATE';
    return {
      ...w,
      sharePct,
      patrolPriority,
    };
  });

  const peakDiurnalWindow =
    diurnalSeries.find((w) => w.id === topWinId) ?? diurnalSeries[1];
  const topTwoSum = (sortedByVolume[0]?.count ?? 0) + (sortedByVolume[1]?.count ?? 0);
  const topTwoWindowsCapturePct =
    total === 0 ? 0 : Math.round((topTwoSum / safeDiv) * 100);

  const maxHourCount = Math.max(...hourlyCounts, 1);
  const hourlyHistogram = hourlyCounts.map((count, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count,
    isPeak: count >= maxHourCount * 0.75 && count > 0,
  }));

  const patrolPrescription = `Deploying 1 Greystones warden pair during just the top 2 diurnal windows (${sortedByVolume[0]?.hoursLabel ?? '09:00–11:59'} & ${sortedByVolume[1]?.hoursLabel ?? '18:00–20:59'}) covers ${topTwoWindowsCapturePct}% of all recorded fouling events.`;

  // 5. Submitter Cryptogram Cohorts
  const cohortMap = new Map<
    string,
    {
      token: string;
      isValidChecksum: boolean;
      reportCount: number;
      confirmationsTotal: number;
      zones: Set<string>;
      firstSeen: string;
      lastSeen: string;
    }
  >();

  let validTokensCount = 0;
  for (const r of sorted) {
    const isValid = isValidSubmitterToken(r.submitterToken);
    if (isValid) validTokensCount += 1;

    const existing = cohortMap.get(r.submitterToken) ?? {
      token: r.submitterToken,
      isValidChecksum: isValid,
      reportCount: 0,
      confirmationsTotal: 0,
      zones: new Set<string>(),
      firstSeen: r.createdAt,
      lastSeen: r.createdAt,
    };
    existing.reportCount += 1;
    existing.confirmationsTotal += r.confirmations;
    existing.zones.add(r.areaName);
    if (r.createdAt < existing.firstSeen) existing.firstSeen = r.createdAt;
    if (r.createdAt > existing.lastSeen) existing.lastSeen = r.createdAt;
    cohortMap.set(r.submitterToken, existing);
  }

  const submitterCohorts: SubmitterCohortRow[] = Array.from(cohortMap.values())
    .map((c) => ({
      token: c.token,
      isValidChecksum: c.isValidChecksum,
      reportCount: c.reportCount,
      confirmationsTotal: c.confirmationsTotal,
      zonesReported: Array.from(c.zones),
      firstSeen: c.firstSeen.slice(0, 10),
      lastSeen: c.lastSeen.slice(0, 10),
    }))
    .sort((a, b) => b.reportCount - a.reportCount);

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
    hourlyHistogram,
    peakDiurnalWindow,
    topTwoWindowsCapturePct,
    patrolPrescription,
    submitterCohorts,
    validTokenPct,
    singleReportSubmittersPct,
  };
}

/**
 * Exports all collected reports to a clean RFC-4180 CSV string for Council FOI / Municipal District packs.
 */
export function exportReportsToCsv(reports: FoulingReport[]): string {
  const headers = [
    'id',
    'created_at_utc',
    'day_of_week',
    'hour_utc',
    'area_name',
    'street_name',
    'lat',
    'lng',
    'h3_cell',
    'severity',
    'nearest_bin_code',
    'distance_to_bin_m',
    'confirmations',
    'submitter_token',
    'token_checksum_valid',
    'is_seeded_demo',
    'note',
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const escapeCsv = (val: string | number | boolean | undefined) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = reports.map((r) => {
    const d = new Date(r.createdAt);
    const dayStr = Number.isNaN(d.getTime()) ? '' : dayNames[d.getUTCDay()];
    const hourStr = Number.isNaN(d.getTime()) ? '' : d.getUTCHours();
    return [
      r.id,
      r.createdAt,
      dayStr,
      hourStr,
      r.areaName,
      r.streetName,
      r.lat,
      r.lng,
      r.h3Cell,
      r.severity,
      r.nearestBinCode,
      r.dBinAllM,
      r.confirmations,
      r.submitterToken,
      isValidSubmitterToken(r.submitterToken),
      Boolean(r.isSeededDemo),
      r.note ?? '',
    ]
      .map(escapeCsv)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
