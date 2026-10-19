import { CivicActionEvent, FoulingReport, ProductMetricsSummary } from '../types';

/**
 * Computes product metrics for the Civic Admin Portal:
 * - Active users: DAU (24h), WAU (7d), MAU (30d), total unique resident tokens
 * - Who has emailed the council (email ledger with submitter tokens & timestamps)
 * - Email action clicks count & breakdown (mailto vs copy vs gmail)
 * - Number of poos logged per day (time-series & charts)
 * - Aggregate engagement & conversion metrics
 */
export function computeProductMetrics(
  reports: FoulingReport[],
  events: CivicActionEvent[] = [],
  referenceDate: Date = new Date()
): ProductMetricsSummary {
  const nowMs = referenceDate.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;

  const dauTokens = new Set<string>();
  const wauTokens = new Set<string>();
  const mauTokens = new Set<string>();
  const allTokens = new Set<string>();

  // Process reports for active tokens and daily counts
  const nonMergedReports = reports.filter((r) => r.status !== 'merged');

  for (const rep of nonMergedReports) {
    const t = new Date(rep.createdAt).getTime();
    const token = rep.submitterToken;

    if (token) allTokens.add(token);
    if (rep.additionalSubmitters) {
      rep.additionalSubmitters.forEach((tok) => allTokens.add(tok));
    }

    if (Number.isFinite(t)) {
      const age = nowMs - t;
      if (age <= dayMs && age >= 0) {
        if (token) dauTokens.add(token);
        if (rep.additionalSubmitters) {
          rep.additionalSubmitters.forEach((tok) => dauTokens.add(tok));
        }
      }
      if (age <= weekMs && age >= 0) {
        if (token) wauTokens.add(token);
        if (rep.additionalSubmitters) {
          rep.additionalSubmitters.forEach((tok) => wauTokens.add(tok));
        }
      }
      if (age <= monthMs && age >= 0) {
        if (token) mauTokens.add(token);
        if (rep.additionalSubmitters) {
          rep.additionalSubmitters.forEach((tok) => mauTokens.add(tok));
        }
      }
    }
  }

  // Process civic events for email clicks and active users
  const emailEvents: CivicActionEvent[] = [];
  let mailtoClicks = 0;
  let copyClicks = 0;
  let gmailClicks = 0;
  const emailSenders = new Set<string>();

  for (const ev of events) {
    const t = new Date(ev.timestamp).getTime();
    const token = ev.submitterToken;

    if (token) allTokens.add(token);

    if (Number.isFinite(t)) {
      const age = nowMs - t;
      if (age <= dayMs && age >= 0 && token) dauTokens.add(token);
      if (age <= weekMs && age >= 0 && token) wauTokens.add(token);
      if (age <= monthMs && age >= 0 && token) mauTokens.add(token);
    }

    if (
      ev.type === 'email_council_mailto' ||
      ev.type === 'email_council_copy' ||
      ev.type === 'email_council_gmail'
    ) {
      emailEvents.push(ev);
      if (token) emailSenders.add(token);

      if (ev.type === 'email_council_mailto') mailtoClicks++;
      else if (ev.type === 'email_council_copy') copyClicks++;
      else if (ev.type === 'email_council_gmail') gmailClicks++;
    }
  }

  // Sort email ledger newest to oldest
  emailEvents.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Compute Daily Poos Logged (last 14 days)
  const dailyBuckets: Record<
    string,
    { count: number; highImpactCount: number; tokens: Set<string> }
  > = {};

  const daysList: {
    date: string;
    dayLabel: string;
    count: number;
    highImpactCount: number;
    distinctSubmitters: number;
  }[] = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowMs - i * dayMs);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('en-IE', { weekday: 'short' });
    dailyBuckets[dateStr] = { count: 0, highImpactCount: 0, tokens: new Set() };
    daysList.push({
      date: dateStr,
      dayLabel,
      count: 0,
      highImpactCount: 0,
      distinctSubmitters: 0,
    });
  }

  for (const rep of nonMergedReports) {
    const dateStr = rep.createdAt.slice(0, 10);
    const isHighImpact =
      rep.severity === 'wheelchair_wheels' ||
      rep.severity === 'buggy_wheels' ||
      rep.severity === 'stepped_in';

    if (dailyBuckets[dateStr]) {
      const added = rep.confirmations || 1;
      dailyBuckets[dateStr].count += added;
      if (isHighImpact) dailyBuckets[dateStr].highImpactCount += added;
      if (rep.submitterToken) dailyBuckets[dateStr].tokens.add(rep.submitterToken);
      if (rep.additionalSubmitters) {
        rep.additionalSubmitters.forEach((tok) => dailyBuckets[dateStr].tokens.add(tok));
      }
    }
  }

  for (const day of daysList) {
    const bucket = dailyBuckets[day.date];
    if (bucket) {
      day.count = bucket.count;
      day.highImpactCount = bucket.highImpactCount;
      day.distinctSubmitters = bucket.tokens.size;
    }
  }

  // Monthly Poos Logged (last 6 months)
  const monthlyMap: Record<
    string,
    { count: number; tokens: Set<string>; label: string }
  > = {};
  for (let m = 5; m >= 0; m--) {
    const d = new Date(nowMs);
    d.setMonth(d.getMonth() - m);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleDateString('en-IE', { month: 'short', year: 'numeric' });
    monthlyMap[key] = { count: 0, tokens: new Set(), label };
  }

  for (const rep of nonMergedReports) {
    const mKey = rep.createdAt.slice(0, 7);
    if (monthlyMap[mKey]) {
      monthlyMap[mKey].count += rep.confirmations || 1;
      if (rep.submitterToken) monthlyMap[mKey].tokens.add(rep.submitterToken);
      if (rep.additionalSubmitters) {
        rep.additionalSubmitters.forEach((tok) => monthlyMap[mKey].tokens.add(tok));
      }
    }
  }

  const monthlyPoos = Object.entries(monthlyMap).map(([month, data]) => ({
    month,
    monthLabel: data.label,
    count: data.count,
    distinctSubmitters: data.tokens.size,
  }));

  const totalPoosLogged = nonMergedReports.reduce(
    (sum, r) => sum + (r.confirmations || 1),
    0
  );

  const totalEmailClicks = mailtoClicks + copyClicks + gmailClicks;
  const uniqueEmailSenders = emailSenders.size;
  const totalUniqueTokens = allTokens.size;

  const emailConversionRate =
    totalUniqueTokens > 0
      ? Math.round((uniqueEmailSenders / totalUniqueTokens) * 100)
      : 0;

  const days14Total = daysList.reduce((acc, d) => acc + d.count, 0);
  const avgPoosPerDay = Number((days14Total / 14).toFixed(1));

  const corroboratedReports = nonMergedReports.filter(
    (r) => (r.confirmations || 1) > 1
  );
  const corroborationRate =
    nonMergedReports.length > 0
      ? Math.round((corroboratedReports.length / nonMergedReports.length) * 100)
      : 0;

  const highImpactReports = nonMergedReports.filter(
    (r) =>
      r.severity === 'wheelchair_wheels' ||
      r.severity === 'buggy_wheels' ||
      r.severity === 'stepped_in'
  );
  const highImpactPct =
    nonMergedReports.length > 0
      ? Math.round((highImpactReports.length / nonMergedReports.length) * 100)
      : 0;

  const nearBin50mReports = nonMergedReports.filter((r) => r.dBinAllM <= 50);
  const nearBin50mPct =
    nonMergedReports.length > 0
      ? Math.round((nearBin50mReports.length / nonMergedReports.length) * 100)
      : 0;

  return {
    dau: dauTokens.size,
    wau: wauTokens.size,
    mau: mauTokens.size,
    totalUniqueTokens,
    totalEmailClicks,
    mailtoClicks,
    copyClicks,
    gmailClicks,
    uniqueEmailSenders,
    emailConversionRate,
    totalPoosLogged,
    avgPoosPerDay,
    dailyPoos: daysList,
    monthlyPoos,
    emailLedger: emailEvents,
    corroborationRate,
    highImpactPct,
    nearBin50mPct,
  };
}
