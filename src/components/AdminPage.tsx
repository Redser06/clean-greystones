import { useMemo, useState } from 'react';
import { LITTER_BINS, town } from '../config/town';
import { councilReportCsv, councilReportMarkdown } from '../lib/councilExport';
import { nearBinSentence, summariseBinDistance } from '../lib/binDistance';
import { headlineStat, monthlyReportStat, trendSentence } from '../lib/monthlyStat';
import { isDemoEnabled, reportsForSession } from '../lib/reportFlow';
import { readStoredReports } from '../lib/storage';

function loadReports() {
  try {
    const stored = readStoredReports(window.localStorage, town.storageKey);
    return reportsForSession({
      demo: isDemoEnabled(import.meta.env.VITE_DEMO_DATA),
      stored,
      now: new Date(),
      samples: town.demoReports,
      timeZone: town.timeZone,
    });
  } catch {
    return [];
  }
}

function download(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminPage() {
  const [now] = useState(() => new Date());
  const reports = useMemo(() => loadReports(), []);
  const summary = summariseBinDistance(reports, LITTER_BINS);
  const stat = monthlyReportStat(reports, now, town.timeZone);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl bg-canvas px-4 py-6 text-ink">
      <p className="text-sm font-medium text-primary">Admin export</p>
      <h1 className="mt-1 font-display text-2xl font-semibold">Council report</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Bin distances stay here. This page is not linked from the resident app.
      </p>

      <section className="mt-6 space-y-2 rounded-2xl border border-line bg-white p-4" aria-labelledby="admin-reports">
        <h2 id="admin-reports" className="text-sm font-semibold">
          Reports
        </h2>
        <p>
          {headlineStat(stat)}. {trendSentence(stat)}.
        </p>
      </section>

      <section className="mt-3 space-y-2 rounded-2xl border border-line bg-white p-4" aria-labelledby="admin-bins">
        <h2 id="admin-bins" className="text-sm font-semibold">
          Distance to litter bins
        </h2>
        <p>{nearBinSentence(summary)}</p>
        <p className="text-sm text-muted">
          Within 50 metres: {summary.withinNearBin}. Within 100 metres: {summary.within100m}. Within
          200 metres: {summary.within200m}. Beyond 200 metres: {summary.beyond200m}. Litter bins
          mapped: {LITTER_BINS.length}.
        </p>
      </section>

      <section className="mt-3 space-y-2 rounded-2xl border border-line bg-white p-4 text-sm leading-relaxed" aria-labelledby="admin-law">
        <h2 id="admin-law" className="text-sm font-semibold">
          Law
        </h2>
        <p>{town.legal.offence}</p>
        <p>
          <a className="font-medium text-primary underline" href={town.legal.citationUrl}>
            {town.legal.citationLabel}
          </a>
        </p>
        <p>{town.legal.fixedPaymentNote}</p>
        <p>
          <a className="font-medium text-primary underline" href={town.legal.fixedPaymentUrl}>
            {town.legal.fixedPaymentLabel}
          </a>
        </p>
      </section>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
          onClick={() =>
            download(
              `${town.exportSlug}.md`,
              councilReportMarkdown(town, reports, LITTER_BINS, now),
              'text/markdown',
            )
          }
        >
          Download markdown
        </button>
        <button
          type="button"
          className="h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold"
          onClick={() =>
            download(`${town.exportSlug}.csv`, councilReportCsv(reports, LITTER_BINS), 'text/csv')
          }
        >
          Download CSV
        </button>
      </div>

      <p className="mt-6 text-sm">
        <a className="font-semibold text-primary" href="/">
          Resident app
        </a>
      </p>
    </main>
  );
}
