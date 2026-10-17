import type { Impact, Report } from '../types';
import { roundCoord } from './geo';
import { previousMonth, yearMonth } from './monthlyStat';

export function createReportId(now: Date, random = Math.random()): string {
  return `r-${now.getTime().toString(36)}-${random.toString(36).slice(2, 8)}`;
}

export function createReport(input: {
  lat: number;
  lng: number;
  impact?: Impact | null;
  hasPhoto?: boolean;
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
    hasPhoto: Boolean(input.hasPhoto),
  };
}

export function moveReport(report: Report, lat: number, lng: number): Report {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return report;
  return { ...report, lat: roundCoord(lat), lng: roundCoord(lng) };
}

export function withImpact(report: Report, impact: Impact | null): Report {
  return { ...report, impact };
}

export function withPhoto(report: Report, hasPhoto: boolean): Report {
  return { ...report, hasPhoto };
}

export function isReport(value: unknown): value is Report {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<Report>;
  return (
    typeof report.id === 'string' &&
    typeof report.createdAt === 'string' &&
    typeof report.lat === 'number' &&
    typeof report.lng === 'number' &&
    typeof report.hasPhoto === 'boolean' &&
    (report.impact === null ||
      report.impact === 'on_the_path' ||
      report.impact === 'stepped_in' ||
      report.impact === 'buggy' ||
      report.impact === 'wheelchair')
  );
}

/** Demo coordinates only. No quotes, confirmation counts, or invented totals. */
export function buildDemoReports(now: Date): Report[] {
  const current = yearMonth(now);
  const previous = previousMonth(current.year, current.month);
  const at = (year: number, month: number, day: number, lat: number, lng: number, id: string): Report =>
    createReport({
      id,
      lat,
      lng,
      now: new Date(Date.UTC(year, month - 1, day, 12, 0, 0)),
    });
  return [
    at(current.year, current.month, 4, 53.14431, -6.06047, 'demo-beach'),
    at(current.year, current.month, 9, 53.14527, -6.0639, 'demo-church'),
    at(current.year, current.month, 14, 53.1489, -6.0634, 'demo-harbour'),
    at(previous.year, previous.month, 11, 53.1422, -6.0594, 'demo-last-month'),
  ];
}

export function reportsForSession(options: {
  demo: boolean;
  stored: Report[] | null;
  now: Date;
}): Report[] {
  if (options.stored) return options.stored;
  if (options.demo) return buildDemoReports(options.now);
  return [];
}

export function isDemoEnabled(flag: string | boolean | undefined): boolean {
  return flag === true || flag === 'true';
}
