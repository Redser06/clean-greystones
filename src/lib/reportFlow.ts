import type { DemoReportSample } from '../config/schema';
import type { Impact, Report } from '../types';
import { roundCoord } from './geo';
import { yearMonth } from './monthlyStat';

export function createReportId(now: Date, random = Math.random()): string {
  return `r-${now.getTime().toString(36)}-${random.toString(36).slice(2, 8)}`;
}

export function createReport(input: {
  lat: number;
  lng: number;
  impact?: Impact | null;
  now?: Date;
  id?: string;
}): Report {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new Error('A report needs a location');
  }
  const now = input.now ?? new Date();
  return {
    id: input.id ?? createReportId(now),
    createdAt: now.toISOString(),
    lat: roundCoord(input.lat),
    lng: roundCoord(input.lng),
    impact: input.impact ?? null,
  };
}

export function moveReport(report: Report, lat: number, lng: number): Report {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return report;
  return { ...report, lat: roundCoord(lat), lng: roundCoord(lng) };
}

export function withImpact(report: Report, impact: Impact | null): Report {
  return { ...report, impact };
}

export function isReport(value: unknown): value is Report {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<Report>;
  return (
    typeof report.id === 'string' &&
    typeof report.createdAt === 'string' &&
    typeof report.lat === 'number' &&
    typeof report.lng === 'number' &&
    (report.impact === null ||
      report.impact === 'on_the_path' ||
      report.impact === 'stepped_in' ||
      report.impact === 'buggy' ||
      report.impact === 'wheelchair')
  );
}

function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + offset;
  const nextYear = Math.floor(index / 12);
  return { year: nextYear, month: index - nextYear * 12 + 1 };
}

/** Demo coordinates only. No quotes, confirmation counts, or invented totals. */
export function buildDemoReports(now: Date, samples: DemoReportSample[], timeZone: string): Report[] {
  const current = yearMonth(now, timeZone);
  return samples.map((sample) => {
    const stamp = shiftMonth(current.year, current.month, sample.monthOffset);
    return createReport({
      id: sample.id,
      lat: sample.lat,
      lng: sample.lng,
      now: new Date(Date.UTC(stamp.year, stamp.month - 1, sample.day, 12, 0, 0)),
    });
  });
}

export function reportsForSession(options: {
  demo: boolean;
  stored: Report[] | null;
  now: Date;
  samples?: DemoReportSample[];
  timeZone?: string;
}): Report[] {
  if (options.stored) return options.stored;
  if (options.demo) return buildDemoReports(options.now, options.samples ?? [], options.timeZone ?? 'UTC');
  return [];
}

export function isDemoEnabled(flag: string | boolean | undefined): boolean {
  return flag === true || flag === 'true';
}
