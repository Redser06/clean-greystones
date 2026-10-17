export interface MonthStat {
  thisMonth: number;
  lastMonth: number;
  delta: number;
}

export function yearMonth(date: Date, timeZone = 'UTC'): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
  };
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function sameMonth(
  createdAt: string,
  target: { year: number; month: number },
  timeZone = 'UTC',
): boolean {
  const stamp = yearMonth(new Date(createdAt), timeZone);
  return stamp.year === target.year && stamp.month === target.month;
}

/** Reports in the current calendar month, and the change against the previous month. */
export function monthlyReportStat(
  reports: { createdAt: string }[],
  now: Date,
  timeZone = 'UTC',
): MonthStat {
  const current = yearMonth(now, timeZone);
  const previous = previousMonth(current.year, current.month);
  const thisMonth = reports.filter((report) => sameMonth(report.createdAt, current, timeZone)).length;
  const lastMonth = reports.filter((report) => sameMonth(report.createdAt, previous, timeZone)).length;
  return { thisMonth, lastMonth, delta: thisMonth - lastMonth };
}

/** Counts on this device only. There is no shared town total yet. */
export function headlineStat(stat: MonthStat): string {
  const noun = stat.thisMonth === 1 ? 'report' : 'reports';
  return `You've logged ${stat.thisMonth} ${noun} this month`;
}

export function trendSentence(stat: MonthStat): string {
  if (stat.thisMonth === 0 && stat.lastMonth === 0) return 'You logged none last month either';
  if (stat.delta > 0) {
    const noun = stat.delta === 1 ? 'report' : 'reports';
    return `${stat.delta} more ${noun} than last month`;
  }
  if (stat.delta < 0) {
    const fewer = Math.abs(stat.delta);
    const noun = fewer === 1 ? 'report' : 'reports';
    return `${fewer} fewer ${noun} than last month`;
  }
  return 'The same as last month';
}

export function trendClause(stat: MonthStat): string {
  if (stat.delta > 0) return `${stat.delta} more than last month`;
  if (stat.delta < 0) return `${Math.abs(stat.delta)} fewer than last month`;
  return 'the same as last month';
}
