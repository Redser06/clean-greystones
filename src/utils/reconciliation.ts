import {
  DailyFoulingSnapshot,
  FoulingReport,
  SeverityType,
  WeeklyEvidenceSummary,
} from '../types';
import { haversineDistanceMeters } from './graphEngine';

const SEVERITY_WEIGHT: Record<SeverityType, number> = {
  wheelchair_wheels: 4,
  stepped_in: 3,
  buggy_wheels: 2,
  just_poop: 1,
};

export function elevateSeverity(current: SeverityType, incoming: SeverityType): SeverityType {
  return SEVERITY_WEIGHT[incoming] > SEVERITY_WEIGHT[current] ? incoming : current;
}

/**
 * Searches for an existing active report within `thresholdM` (default 15m)
 * and within `maxHours` (default 24h) to avoid cluttering the UI with duplicate pins.
 */
export function findMatchingNearbyReport(
  lat: number,
  lng: number,
  reports: FoulingReport[],
  thresholdM = 15,
  maxHours = 24
): FoulingReport | null {
  const now = Date.now();
  const maxMs = maxHours * 60 * 60 * 1000;

  let closest: FoulingReport | null = null;
  let minDistance = Infinity;

  for (const rep of reports) {
    if (rep.status === 'merged') continue;

    // Check time proximity
    const repTime = new Date(rep.createdAt).getTime();
    if (Number.isFinite(repTime) && Math.abs(now - repTime) > maxMs) {
      continue;
    }

    const dist = haversineDistanceMeters(lat, lng, rep.lat, rep.lng);
    if (dist <= thresholdM && dist < minDistance) {
      minDistance = dist;
      closest = rep;
    }
  }

  return closest;
}

export interface ReconcileResult {
  action: 'merged' | 'created';
  primaryReport: FoulingReport;
  mergedReportId?: string;
  distanceM?: number;
}

/**
 * Reconciles an incoming report against existing active reports.
 * If another resident reported the same spot within 15m, merges the drop,
 * elevates severity if needed, and increments confirmations (+1).
 */
export function reconcileReportLog(
  newReport: FoulingReport,
  existingReports: FoulingReport[],
  thresholdM = 15
): ReconcileResult {
  const match = findMatchingNearbyReport(newReport.lat, newReport.lng, existingReports, thresholdM);

  if (!match) {
    return {
      action: 'created',
      primaryReport: newReport,
    };
  }

  const dist = haversineDistanceMeters(newReport.lat, newReport.lng, match.lat, match.lng);
  const updatedConfirmations = (match.confirmations || 1) + 1;
  const elevatedSev = elevateSeverity(match.severity, newReport.severity);

  const existingAdditional = [...(match.additionalSubmitters || [])];
  if (
    newReport.submitterToken &&
    newReport.submitterToken !== match.submitterToken &&
    !existingAdditional.includes(newReport.submitterToken)
  ) {
    existingAdditional.push(newReport.submitterToken);
  }

  const updatedPrimary: FoulingReport = {
    ...match,
    severity: elevatedSev,
    confirmations: updatedConfirmations,
    lastConfirmedAt: newReport.createdAt,
    additionalSubmitters: existingAdditional,
    note:
      newReport.note && !match.note?.includes(newReport.note)
        ? match.note
          ? `${match.note} · Note: ${newReport.note}`
          : newReport.note
        : match.note,
  };

  return {
    action: 'merged',
    primaryReport: updatedPrimary,
    mergedReportId: newReport.id,
    distanceM: dist,
  };
}

/**
 * Batch-reconciles an entire list of reports, clustering duplicate drops
 * within 15m and 24h so the UI remains completely clean and uncluttered.
 */
export function reconcileEntireReportList(
  reports: FoulingReport[],
  thresholdM = 15,
  maxHours = 24
): { reconciled: FoulingReport[]; mergedCount: number } {
  // Sort oldest to newest so earlier drops become the anchor primary
  const sorted = [...reports].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const primaries: FoulingReport[] = [];
  let mergedCount = 0;

  for (const rep of sorted) {
    if (rep.status === 'merged') {
      primaries.push(rep);
      mergedCount++;
      continue;
    }

    const matchIdx = primaries.findIndex((p) => {
      if (p.status === 'merged') return false;
      const timeDiff = Math.abs(
        new Date(p.createdAt).getTime() - new Date(rep.createdAt).getTime()
      );
      if (timeDiff > maxHours * 60 * 60 * 1000) return false;
      return haversineDistanceMeters(p.lat, p.lng, rep.lat, rep.lng) <= thresholdM;
    });

    if (matchIdx !== -1) {
      const primary = primaries[matchIdx];
      primary.confirmations = (primary.confirmations || 1) + (rep.confirmations || 1);
      primary.severity = elevateSeverity(primary.severity, rep.severity);
      primary.lastConfirmedAt = rep.createdAt;

      const tokens = new Set<string>([
        primary.submitterToken,
        ...(primary.additionalSubmitters || []),
        rep.submitterToken,
        ...(rep.additionalSubmitters || []),
      ]);
      primary.additionalSubmitters = Array.from(tokens);

      primaries.push({
        ...rep,
        status: 'merged',
        mergedIntoId: primary.id,
      });
      mergedCount++;
    } else {
      primaries.push({ ...rep });
    }
  }

  // Restore newest first
  const result = primaries.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    reconciled: result,
    mergedCount,
  };
}

/**
 * Filters reports by time window:
 * - 'today': past 24 hours (clean daily UI)
 * - 'week': past 7 days (cumulative community evidence)
 * - 'all': all historical reports
 */
export function filterReportsByTimeRange(
  reports: FoulingReport[],
  range: 'today' | 'week' | 'all'
): FoulingReport[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;

  return reports.filter((r) => {
    if (r.status === 'merged') return false;
    const time = new Date(r.createdAt).getTime();
    if (!Number.isFinite(time)) return true;
    const age = now - time;

    if (range === 'today') return age <= dayMs;
    if (range === 'week') return age <= weekMs;
    return true;
  });
}

const dublinDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Dublin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Formats an ISO string or Date into YYYY-MM-DD in Europe/Dublin local time (IST/GMT).
 */
export function formatDublinDate(input: string | Date | undefined | null): string {
  if (!input) return dublinDateFormatter.format(new Date());
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    return typeof input === 'string' && input.length >= 10 ? input.slice(0, 10) : dublinDateFormatter.format(new Date());
  }
  return dublinDateFormatter.format(d);
}

/**
 * Builds 24-hour daily snapshots for historical aggregation and auditing.
 */
export function computeDailySnapshots(
  reports: FoulingReport[]
): Record<string, DailyFoulingSnapshot> {
  const buckets: Record<string, FoulingReport[]> = {};

  for (const rep of reports) {
    if (rep.status === 'merged') continue;
    const dateStr = formatDublinDate(rep.createdAt); // YYYY-MM-DD in Europe/Dublin
    if (!buckets[dateStr]) buckets[dateStr] = [];
    buckets[dateStr].push(rep);
  }

  const snapshots: Record<string, DailyFoulingSnapshot> = {};

  for (const [date, reps] of Object.entries(buckets)) {
    const tokens = new Set<string>();
    let highImpactCount = 0;
    let nearBin15mCount = 0;
    let nearBin50mCount = 0;

    const areaCount: Record<string, { areaName: string; streetName: string; count: number }> = {};

    for (const r of reps) {
      tokens.add(r.submitterToken);
      if (r.additionalSubmitters) {
        r.additionalSubmitters.forEach((t) => tokens.add(t));
      }
      if (
        r.severity === 'wheelchair_wheels' ||
        r.severity === 'buggy_wheels' ||
        r.severity === 'stepped_in'
      ) {
        highImpactCount++;
      }
      if (r.dBinAllM <= 15) nearBin15mCount++;
      if (r.dBinAllM <= 50) nearBin50mCount++;

      const key = `${r.areaName}::${r.streetName}`;
      if (!areaCount[key]) {
        areaCount[key] = { areaName: r.areaName, streetName: r.streetName, count: 0 };
      }
      areaCount[key].count += r.confirmations || 1;
    }

    const sortedHotspots = Object.values(areaCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    snapshots[date] = {
      date,
      generatedAt: new Date().toISOString(),
      totalReports: reps.reduce((sum, r) => sum + (r.confirmations || 1), 0),
      distinctSubmitters: tokens.size,
      highImpactCount,
      nearBin15mCount,
      nearBin50mCount,
      nearBin50mPct: reps.length > 0 ? Math.round((nearBin50mCount / reps.length) * 100) : 0,
      topHotspots: sortedHotspots,
      reportIds: reps.map((r) => r.id),
    };
  }

  return snapshots;
}

/**
 * Computes a comprehensive 7-day Weekly Evidence Summary with daily breakdown
 * to include in the Councillor Email and weekly map overlay.
 */
export function computeWeeklyEvidenceSummary(
  reports: FoulingReport[]
): WeeklyEvidenceSummary {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStartStr = formatDublinDate(weekStart);
  const weekEndStr = formatDublinDate(now);

  const weekReports = filterReportsByTimeRange(reports, 'week');
  const todayReports = filterReportsByTimeRange(reports, 'today');

  const tokens = new Set<string>();
  let highImpactCount = 0;
  let nearBin50mCount = 0;
  const hotspotMap: Record<string, { areaName: string; streetName: string; count: number }> = {};

  // Initialize 7 daily buckets
  const days: { date: string; dayLabel: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = formatDublinDate(d);
    const dayLabel = d.toLocaleDateString('en-IE', { weekday: 'short', timeZone: 'Europe/Dublin' });
    days.push({ date: dateStr, dayLabel, count: 0 });
  }

  for (const r of weekReports) {
    tokens.add(r.submitterToken);
    if (r.additionalSubmitters) {
      r.additionalSubmitters.forEach((t) => tokens.add(t));
    }
    if (
      r.severity === 'wheelchair_wheels' ||
      r.severity === 'buggy_wheels' ||
      r.severity === 'stepped_in'
    ) {
      highImpactCount++;
    }
    if (r.dBinAllM <= 50) nearBin50mCount++;

    const key = `${r.areaName}::${r.streetName}`;
    if (!hotspotMap[key]) {
      hotspotMap[key] = { areaName: r.areaName, streetName: r.streetName, count: 0 };
    }
    hotspotMap[key].count += r.confirmations || 1;

    // Day bucket
    const dateStr = formatDublinDate(r.createdAt);
    const dayObj = days.find((d) => d.date === dateStr);
    if (dayObj) {
      dayObj.count += r.confirmations || 1;
    }
  }

  const topHotspots = Object.values(hotspotMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalReportsWithConfirmations = weekReports.reduce(
    (sum, r) => sum + (r.confirmations || 1),
    0
  );

  const todayCountWithConfirmations = todayReports.reduce(
    (sum, r) => sum + (r.confirmations || 1),
    0
  );

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    totalReports: totalReportsWithConfirmations,
    distinctSubmitters: tokens.size,
    todayCount: todayCountWithConfirmations,
    highImpactCount,
    nearBin50mPct:
      weekReports.length > 0 ? Math.round((nearBin50mCount / weekReports.length) * 100) : 0,
    dailyBreakdown: days,
    topHotspots,
  };
}
