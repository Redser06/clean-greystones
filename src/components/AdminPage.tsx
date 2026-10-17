import { useMemo, useState } from 'react';
import { LITTER_BINS } from '../data/litterBins';
import { councilReportCsv, councilReportMarkdown } from '../lib/councilExport';
import { nearBinSentence, summariseBinDistance } from '../lib/binDistance';
import { headlineStat, monthlyReportStat, trendSentence } from '../lib/monthlyStat';
import { isDemoEnabled, reportsForSession } from '../lib/reportFlow';
import { readStoredReports } from '../lib/storage';
import {
  LITTERING_FIXED_PAYMENT_NOTE,
  LITTERING_FIXED_PAYMENT_URL,
  LITTER_ACT_OFFENCE,
  LITTER_ACT_SECTION_22_URL,
} from '../lib/legal';

function loadReports() {
  try {
    const stored = readStoredReports(window.localStorage);
    return reportsForSession({
      demo: isDemoEnabled(import.meta.env.VITE_DEMO_DATA),
      stored,
      now: new Date(),
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
  const stat = monthlyReportStat(reports, now);

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
        <p>{LITTER_ACT_OFFENCE}</p>
        <p>
          <a className="font-medium text-primary underline" href={LITTER_ACT_SECTION_22_URL}>
            Litter Pollution Act 1997, section 22
          </a>
        </p>
        <p>{LITTERING_FIXED_PAYMENT_NOTE}</p>
        <p>
          <a className="font-medium text-primary underline" href={LITTERING_FIXED_PAYMENT_URL}>
            Department notice, 1 September 2026
          </a>
        </p>
      </section>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
          onClick={() =>
            download(
              'greystones-dog-fouling.md',
              councilReportMarkdown(reports, LITTER_BINS, now),
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
            download('greystones-dog-fouling.csv', councilReportCsv(reports, LITTER_BINS), 'text/csv')
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
