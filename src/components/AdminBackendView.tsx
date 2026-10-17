import React, { useMemo, useState } from 'react';
import { FoulingReport, SeverityType } from '../types';
import {
  computeBinsVsFoulingAnalysis,
  SEVERITY_META,
} from '../utils/graphEngine';
import {
  computeTemporalAndSeasonalModel,
  DEFAULT_ADMIN_PASSCODE,
  exportReportsToCsv,
  HISTORICAL_GREYSTONES_COHORT,
  isAdminSessionActive,
  setAdminSessionActive,
  verifyAdminPasscode,
} from '../utils/adminAnalytics';

interface AdminBackendViewProps {
  liveReports: FoulingReport[];
  demoSeedCleared: boolean;
  onToggleClearDemoSeed: () => void;
  onDeleteReport: (id: string) => void;
  onExitAdmin: () => void;
}

type AdminTab = 'seasonality' | 'diurnal' | 'cohorts' | 'ledger';

export const AdminBackendView: React.FC<AdminBackendViewProps> = ({
  liveReports,
  demoSeedCleared,
  onToggleClearDemoSeed,
  onDeleteReport,
  onExitAdmin,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    isAdminSessionActive()
  );
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dataset scope: 'full_12m' combines liveReports + 12-month historical series for seasonality modelling
  const [datasetScope, setDatasetScope] = useState<'full_12m' | 'live_only'>('full_12m');
  const [activeTab, setActiveTab] = useState<AdminTab>('seasonality');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exportToast, setExportToast] = useState<string | null>(null);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminPasscode(passcodeInput)) {
      setAdminSessionActive(true);
      setIsAuthenticated(true);
      setLoginError(null);
    } else {
      setLoginError('Invalid admin passcode. Use the Greystones MD organiser key.');
    }
  };

  const handleLogout = () => {
    setAdminSessionActive(false);
    setIsAuthenticated(false);
    setPasscodeInput('');
  };

  const combinedDataset = useMemo(() => {
    const base =
      datasetScope === 'full_12m'
        ? [...liveReports, ...HISTORICAL_GREYSTONES_COHORT]
        : [...liveReports];

    return base.filter((r) => {
      if (zoneFilter !== 'ALL' && r.areaName !== zoneFilter) return false;
      if (severityFilter !== 'ALL' && r.severity !== severityFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchStreet = r.streetName.toLowerCase().includes(q);
        const matchToken = r.submitterToken.toLowerCase().includes(q);
        const matchId = r.id.toLowerCase().includes(q);
        const matchNote = (r.note ?? '').toLowerCase().includes(q);
        if (!matchStreet && !matchToken && !matchId && !matchNote) return false;
      }
      return true;
    });
  }, [liveReports, datasetScope, zoneFilter, severityFilter, searchQuery]);

  const model = useMemo(
    () => computeTemporalAndSeasonalModel(combinedDataset),
    [combinedDataset]
  );

  const spatialSummary = useMemo(
    () => computeBinsVsFoulingAnalysis(combinedDataset),
    [combinedDataset]
  );

  const availableZones = useMemo(() => {
    const set = new Set<string>();
    [...liveReports, ...HISTORICAL_GREYSTONES_COHORT].forEach((r) =>
      set.add(r.areaName)
    );
    return Array.from(set).sort();
  }, [liveReports]);

  const handleDownloadCsv = () => {
    const csv = exportReportsToCsv(combinedDataset);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clean-greystones-incidents-${datasetScope}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportToast(`Exported ${combinedDataset.length} rows to CSV`);
    setTimeout(() => setExportToast(null), 3500);
  };

  const handleDownloadJsonModel = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      datasetScope,
      spatialSummary,
      temporalAndSeasonalModel: model,
      recordsCount: combinedDataset.length,
      records: combinedDataset,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clean-greystones-timeseries-model-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportToast('Exported full Time-Series Model + JSON dataset');
    setTimeout(() => setExportToast(null), 3500);
  };

  // 1. UNAUTHENTICATED LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between p-4 sm:p-8">
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm shadow-sm">
              CG
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-ink">
                  Clean Greystones
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-ink text-white font-semibold">
                  Admin Backend
                </span>
              </div>
              <p className="text-xs text-muted">
                Data Collection, Time-Series Modelling & Seasonality Observatory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onExitAdmin}
            className="text-xs font-semibold text-muted hover:text-ink px-3 py-1.5 rounded-lg border border-line bg-white transition"
          >
            ← Back to Resident Map
          </button>
        </header>

        <main className="my-auto py-8">
          <div className="max-w-md w-full mx-auto bg-white rounded-2xl border border-line shadow-sm p-6 sm:p-8">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-canvas border border-line text-[11px] font-mono font-semibold text-primary mb-4">
              <span>🔒</span> ORGANISER AUTHENTICATION
            </div>
            <h1 className="text-xl font-bold text-ink tracking-tight">
              Backend Analytics & Time-Series Login
            </h1>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              Residents never log in to report dog fouling on the public map. This
              separate backend portal is restricted to campaign organisers to aggregate
              all collected records, model seasonal vs year-round baselines, and analyse
              weekend and time-of-day spikes.
            </p>

            <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="admin-passcode"
                  className="block text-xs font-semibold text-ink mb-1.5"
                >
                  Organiser Access Key
                </label>
                <input
                  id="admin-passcode"
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="Enter organiser passcode…"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-line bg-canvas text-ink font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                {loginError && (
                  <p className="text-xs text-error font-medium mt-1.5">{loginError}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm transition shadow-sm"
              >
                Sign In to Analytics Backend
              </button>

              <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted font-mono">
                  Key: <strong className="text-ink">{DEFAULT_ADMIN_PASSCODE}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPasscodeInput(DEFAULT_ADMIN_PASSCODE);
                    setAdminSessionActive(true);
                    setIsAuthenticated(true);
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  1-Click Demo Admin Sign-In →
                </button>
              </div>
            </form>
          </div>
        </main>

        <footer className="max-w-5xl w-full mx-auto text-center text-[11px] text-muted border-t border-line pt-4">
          Clean Greystones Civic Data Observatory · Zero-PII Cryptogram Verification (`GS-ANON-*`)
        </footer>
      </div>
    );
  }

  // 2. AUTHENTICATED ADMIN BACKEND DASHBOARD
  const maxMonthCount = Math.max(...model.monthlySeries.map((m) => m.count), 1);
  const maxDayCount = Math.max(...model.dayOfWeekSeries.map((d) => d.count), 1);
  const maxDiurnalCount = Math.max(...model.diurnalSeries.map((w) => w.count), 1);
  const maxHourCount = Math.max(...model.hourlyHistogram.map((h) => h.count), 1);

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      {/* Top Admin Header */}
      <header className="bg-white border-b border-line sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm">
              CG
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm sm:text-base text-ink tracking-tight">
                  Clean Greystones — Admin Data & Time-Series Lab
                </h1>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                  Authenticated
                </span>
              </div>
              <p className="text-xs text-muted">
                Range: <span className="font-mono">{model.dateRangeLabel}</span> ·{' '}
                <strong className="text-ink">{model.totalAnalyzed}</strong> geo-tagged
                incidents across{' '}
                <strong className="text-ink">{model.submitterCohorts.length}</strong>{' '}
                verified <span className="font-mono">GS-ANON</span> tokens
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Dataset Scope Switcher */}
            <div className="inline-flex rounded-xl bg-canvas p-1 border border-line text-xs">
              <button
                type="button"
                onClick={() => setDatasetScope('full_12m')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  datasetScope === 'full_12m'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                12-Month Model ({liveReports.length + HISTORICAL_GREYSTONES_COHORT.length})
              </button>
              <button
                type="button"
                onClick={() => setDatasetScope('live_only')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                  datasetScope === 'live_only'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Current Map Pins Only ({liveReports.length})
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-3 py-1.5 rounded-xl border border-line bg-white hover:bg-canvas text-xs font-semibold text-ink transition"
            >
              ↓ Export CSV
            </button>
            <button
              type="button"
              onClick={handleDownloadJsonModel}
              className="px-3 py-1.5 rounded-xl border border-line bg-white hover:bg-canvas text-xs font-semibold text-ink transition"
            >
              ↓ Export Model JSON
            </button>
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-3 py-1.5 rounded-xl bg-ink text-white text-xs font-semibold hover:opacity-90 transition"
            >
              ← Public Map
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-xl border border-line text-xs font-semibold text-muted hover:text-error transition"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Sub-navigation & Global Filters */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 border-t border-line bg-canvas/60 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap items-center gap-1">
            {[
              {
                id: 'seasonality' as AdminTab,
                label: '1. Time-Series & Seasonality Model',
              },
              {
                id: 'diurnal' as AdminTab,
                label: '2. Weekend & Time-of-Day Spikes',
              },
              {
                id: 'cohorts' as AdminTab,
                label: '3. Submitter Cryptograms & Zones',
              },
              {
                id: 'ledger' as AdminTab,
                label: `4. Raw Incident Ledger (${combinedDataset.length})`,
              },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  activeTab === t.id
                    ? 'bg-white text-primary border border-line shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              aria-label="Filter by Greystones Zone"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-line bg-white text-ink font-medium text-xs"
            >
              <option value="ALL">All Greystones Zones</option>
              {availableZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by Impact Severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-line bg-white text-ink font-medium text-xs"
            >
              <option value="ALL">All Severities</option>
              {(Object.keys(SEVERITY_META) as SeverityType[]).map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_META[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {exportToast && (
        <div className="bg-primary text-white text-xs font-semibold text-center py-2 px-4">
          {exportToast}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">
        {/* Top Executive KPI Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-line p-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              1. Seasonality Verdict
            </span>
            <p className="text-lg font-bold text-ink mt-1">
              {model.isYearRoundStructural
                ? 'Year-Round Structural'
                : 'Short Window Snapshot'}
            </p>
            <p className="text-xs text-muted mt-1">
              Winter retains{' '}
              <strong className="text-ink">{model.winterToSummerRatioPct}%</strong> of
              Summer volume (CV{' '}
              <span className="font-mono">
                {model.seasonalityCoefficientOfVariation}
              </span>
              )
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-line p-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              2. Weekend Spike Multiplier
            </span>
            <p className="text-lg font-bold text-primary mt-1">
              {model.weekendSpikeMultiplier}× Sat–Sun Rate
            </p>
            <p className="text-xs text-muted mt-1">
              <strong className="text-ink">{model.weekendAvgPerDay}</strong>/day on
              weekends vs <strong className="text-ink">{model.weekdayAvgPerDay}</strong>
              /day Mon–Fri (Peak: {model.peakDayLabel})
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-line p-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              3. Peak Time-of-Day Window
            </span>
            <p className="text-lg font-bold text-ink mt-1">
              {model.peakDiurnalWindow?.hoursLabel ?? '09:00 – 11:59'}
            </p>
            <p className="text-xs text-muted mt-1">
              Top 2 windows capture{' '}
              <strong className="text-ink">{model.topTwoWindowsCapturePct}%</strong> of
              all incidents
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-line p-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              4. Near-Bin Myth-Buster
            </span>
            <p className="text-lg font-bold text-ink mt-1">
              {spatialSummary.nearBin50mPct}% ≤50m of a Bin
            </p>
            <p className="text-xs text-muted mt-1">
              <strong className="text-ink">{spatialSummary.nearBin15mPct}%</strong> within
              15m · <strong className="text-ink">{model.validTokenPct}%</strong> valid
              cryptograms
            </p>
          </div>
        </section>

        {/* TAB 1: TIME-SERIES & SEASONALITY MODEL */}
        {activeTab === 'seasonality' && (
          <div className="space-y-6">
            {/* Seasonality Assessment Banner */}
            <div className="bg-white rounded-2xl border border-line p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <span className="inline-block text-[11px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded bg-primary/10 text-primary font-semibold mb-2">
                    MODEL QUESTION 1 · IS IT SEASONAL OR YEAR-ROUND?
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-ink">
                    {model.seasonalityHeadline}
                  </h2>
                  <p className="text-xs sm:text-sm text-muted mt-1.5 leading-relaxed">
                    {model.seasonalityExplanation}
                  </p>
                </div>
                <div className="bg-canvas rounded-xl border border-line px-4 py-3 text-right">
                  <span className="block text-[11px] font-mono text-muted">
                    WEEKLY RUN RATE
                  </span>
                  <span className="text-xl font-bold font-mono text-ink">
                    {model.weeklyRateAvg} / wk
                  </span>
                  <span className="block text-[11px] text-muted mt-0.5">
                    Mean across {model.monthlySeries.length} months
                  </span>
                </div>
              </div>

              {/* 12-Month Time-Series Bar Chart */}
              <div className="mt-6 pt-5 border-t border-line">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                    Monthly Incident Time-Series (Total vs High-Impact Wheelchair/Buggy/Shoe)
                  </h3>
                  <div className="flex items-center gap-4 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" />
                      Total Monthly Incidents
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-tertiary inline-block" />
                      High-Impact (Wheel/Shoe)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 items-end h-48 pt-6 pb-2 px-2 bg-canvas rounded-xl border border-line">
                  {model.monthlySeries.map((m) => {
                    const heightPct = Math.max(
                      12,
                      Math.round((m.count / maxMonthCount) * 100)
                    );
                    const highPct =
                      m.count > 0
                        ? Math.round((m.highImpactCount / m.count) * 100)
                        : 0;
                    return (
                      <div
                        key={m.monthKey}
                        className="flex flex-col items-center h-full justify-end group"
                      >
                        <span className="text-[11px] font-mono font-bold text-ink mb-1">
                          {m.count}
                        </span>
                        <div className="w-full max-w-[34px] bg-line/50 rounded-t-md h-32 flex items-end overflow-hidden">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full bg-primary rounded-t-md relative flex flex-col justify-end transition-all"
                            title={`${m.label}: ${m.count} incidents (${m.highImpactCount} high-impact, ${m.nearBin50mPct}% ≤50m of bin)`}
                          >
                            <div
                              style={{ height: `${highPct}%` }}
                              className="w-full bg-tertiary/90"
                            />
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-muted mt-1.5 truncate">
                          {m.label}
                        </span>
                        <span className="text-[9px] font-mono text-primary">
                          {m.nearBin50mPct}% bin
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4-Quarter Seasonal Index Table */}
            <div className="bg-white rounded-2xl border border-line p-5 sm:p-6">
              <h3 className="text-sm font-bold text-ink">
                Quarterly Seasonal Index Decomposition (1.00 = Annual Monthly Mean)
              </h3>
              <p className="text-xs text-muted mt-1">
                A seasonal index near <span className="font-mono">1.00</span> across all
                four quarters proves year-round residency fouling rather than seasonal
                tourism.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
                {model.seasonalBreakdown.map((s) => (
                  <div
                    key={s.season}
                    className="rounded-xl border border-line bg-canvas p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-ink">{s.season}</span>
                        <span className="text-[11px] font-mono text-muted">
                          {s.monthsLabel}
                        </span>
                      </div>
                      <p className="text-2xl font-bold font-mono text-ink mt-2">
                        {s.avgPerMonth}
                        <span className="text-xs font-normal text-muted"> / mo</span>
                      </p>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-line flex items-center justify-between text-xs">
                      <span className="text-muted">Total: {s.count} ({s.sharePct}%)</span>
                      <span className="font-mono font-semibold text-primary">
                        Idx: {s.seasonalIndex.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WEEKEND SPIKES & DIURNAL TIME-OF-DAY CURVE */}
        {activeTab === 'diurnal' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Day-of-Week Analysis */}
              <div className="bg-white rounded-2xl border border-line p-5 sm:p-6">
                <span className="inline-block text-[11px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded bg-primary/10 text-primary font-semibold mb-2">
                  MODEL QUESTION 2 · DOES IT SPIKE AT WEEKENDS?
                </span>
                <h2 className="text-base font-bold text-ink">
                  {model.weekendHeadline}
                </h2>
                <p className="text-xs text-muted mt-1">
                  Saturday and Sunday generate{' '}
                  <strong className="text-ink">{model.weekendAvgPerDay}</strong> reports
                  per day vs{' '}
                  <strong className="text-ink">{model.weekdayAvgPerDay}</strong> per
                  weekday — driven by heavy weekend promenade and Harbour Marina footfall
                  when zero council litter wardens are rostered.
                </p>

                <div className="mt-5 space-y-2.5">
                  {model.dayOfWeekSeries.map((d) => {
                    const widthPct = Math.max(
                      6,
                      Math.round((d.count / maxDayCount) * 100)
                    );
                    return (
                      <div key={d.shortLabel} className="flex items-center gap-3">
                        <div className="w-12 text-xs font-mono font-semibold text-ink">
                          {d.shortLabel}
                          {d.isWeekend && (
                            <span className="ml-1 text-[9px] text-primary">★</span>
                          )}
                        </div>
                        <div className="flex-1 h-6 bg-canvas rounded-lg border border-line overflow-hidden flex items-center">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className={`h-full flex items-center px-2 text-[11px] font-mono font-bold text-white ${
                              d.isWeekend ? 'bg-primary' : 'bg-ink/75'
                            }`}
                          >
                            {d.count}
                          </div>
                        </div>
                        <div className="w-20 text-right text-xs font-mono text-muted">
                          {d.sharePct}% ({d.highImpactCount} hi)
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Diurnal Time-of-Day Windows */}
              <div className="bg-white rounded-2xl border border-line p-5 sm:p-6">
                <span className="inline-block text-[11px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded bg-primary/10 text-primary font-semibold mb-2">
                  MODEL QUESTION 3 · TIME-OF-DAY DIURNAL SPIKES
                </span>
                <h2 className="text-base font-bold text-ink">
                  Bimodal Morning Walk (07:00–11:59) & Evening Dusk (18:00–20:59) Peaks
                </h2>
                <p className="text-xs text-muted mt-1">
                  {model.patrolPrescription}
                </p>

                <div className="mt-5 space-y-3">
                  {model.diurnalSeries.map((w) => {
                    const widthPct = Math.max(
                      6,
                      Math.round((w.count / maxDiurnalCount) * 100)
                    );
                    return (
                      <div
                        key={w.id}
                        className="p-2.5 rounded-xl bg-canvas border border-line"
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <div>
                            <span className="font-mono font-bold text-ink">
                              {w.hoursLabel}
                            </span>{' '}
                            <span className="font-semibold text-ink">· {w.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                w.patrolPriority === 'CRITICAL'
                                  ? 'bg-error-container text-on-error-container'
                                  : w.patrolPriority === 'HIGH'
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-line text-muted'
                              }`}
                            >
                              {w.patrolPriority}
                            </span>
                            <span className="font-mono font-bold text-ink">
                              {w.count} ({w.sharePct}%)
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-3 bg-white rounded-full overflow-hidden border border-line">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className="h-full bg-primary"
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-mono text-muted mt-1">
                          <span>Weekday: {w.weekdayCount}</span>
                          <span>Weekend: {w.weekendCount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 24-Hour Clock Distribution */}
            <div className="bg-white rounded-2xl border border-line p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-ink">
                    24-Hour Hourly Incident Histogram (UTC / Local Greystones Time)
                  </h3>
                  <p className="text-xs text-muted">
                    Highlights exact patrol shift hours where warden presence yields
                    maximum deterrence under s.22 Litter Pollution Act 1997.
                  </p>
                </div>
                <span className="text-xs font-mono text-primary font-semibold">
                  Optimal Warden Shift: 08:00–11:00 & 17:30–19:30
                </span>
              </div>

              <div className="grid grid-cols-12 sm:grid-cols-24 gap-1.5 items-end h-36 bg-canvas p-3 rounded-xl border border-line">
                {model.hourlyHistogram.map((h) => {
                  const pct =
                    h.count === 0
                      ? 4
                      : Math.max(12, Math.round((h.count / maxHourCount) * 100));
                  return (
                    <div
                      key={h.hour}
                      className="flex flex-col items-center justify-end h-full"
                    >
                      <span className="text-[9px] font-mono text-muted mb-1">
                        {h.count > 0 ? h.count : ''}
                      </span>
                      <div className="w-full h-20 flex items-end bg-line/40 rounded-t">
                        <div
                          style={{ height: `${pct}%` }}
                          className={`w-full rounded-t ${
                            h.isPeak ? 'bg-primary' : 'bg-ink/60'
                          }`}
                          title={`${h.label} — ${h.count} incidents`}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-muted mt-1">
                        {String(h.hour).padStart(2, '0')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SUBMITTER CRYPTOGRAMS & SPATIAL ZONES */}
        {activeTab === 'cohorts' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Spatial Hotspots & Bin Distance Table */}
            <div className="bg-white rounded-2xl border border-line p-5 sm:p-6">
              <h2 className="text-base font-bold text-ink">
                Spatial Zone & Bin Proximity Breakdown
              </h2>
              <p className="text-xs text-muted mt-1">
                Separates seafront/town zones (where bins are &lt;15m away and
                enforcement is the gap) from outer estates (&gt;200m from any bin).
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-line text-[11px] font-mono uppercase text-muted">
                      <th className="py-2 pr-2">Zone</th>
                      <th className="py-2 px-2">Incidents</th>
                      <th className="py-2 px-2">Min Dist to Bin</th>
                      <th className="py-2 px-2">Nearest Bin</th>
                      <th className="py-2 pl-2">Diagnosis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[
                      ...spatialSummary.nearBinHotspots,
                      ...spatialSummary.farFromBinHotspots,
                    ].map((h) => {
                      const binLabel: string =
                        'nearestBinCode' in h && typeof h.nearestBinCode === 'string'
                          ? h.nearestBinCode
                          : 'Unserved (>200m)';
                      return (
                        <tr key={h.areaName}>
                          <td className="py-2.5 pr-2 font-semibold text-ink">
                            {h.areaName}
                          </td>
                          <td className="py-2.5 px-2 font-mono font-bold text-ink">
                            {h.count}
                          </td>
                          <td className="py-2.5 px-2 font-mono">
                            {h.minBinDistM}m
                          </td>
                          <td className="py-2.5 px-2 font-mono text-muted">
                            {binLabel}
                          </td>
                          <td className="py-2.5 pl-2">
                            {h.minBinDistM <= 50 ? (
                              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[10px] font-semibold">
                                ENFORCEMENT GAP
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-tertiary/15 text-tertiary font-mono text-[10px] font-semibold">
                                INFRASTRUCTURE BIN GAP
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Anonymous Submitter Token Cohort Integrity */}
            <div className="bg-white rounded-2xl border border-line p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-ink">
                    Submitter Cryptogram Integrity (`GS-ANON-*`)
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Proves broad community participation without storing personal data.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-mono text-xs font-bold">
                  {model.validTokenPct}% Checksum Valid
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 my-4">
                <div className="p-3 rounded-xl bg-canvas border border-line">
                  <span className="text-[10px] font-mono text-muted block">
                    DISTINCT DEVICES
                  </span>
                  <span className="text-base font-bold font-mono text-ink">
                    {model.submitterCohorts.length}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-canvas border border-line">
                  <span className="text-[10px] font-mono text-muted block">
                    AVG PINS / DEVICE
                  </span>
                  <span className="text-base font-bold font-mono text-ink">
                    {model.submitterCohorts.length > 0
                      ? (
                          model.totalAnalyzed / model.submitterCohorts.length
                        ).toFixed(1)
                      : '0'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-canvas border border-line">
                  <span className="text-[10px] font-mono text-muted block">
                    ≤2 PINS COHORT
                  </span>
                  <span className="text-base font-bold font-mono text-ink">
                    {model.singleReportSubmittersPct}%
                  </span>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto border border-line rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-canvas sticky top-0 border-b border-line text-[10px] font-mono uppercase text-muted">
                    <tr>
                      <th className="py-2 px-3">Submitter Token</th>
                      <th className="py-2 px-2">Checksum</th>
                      <th className="py-2 px-2">Reports</th>
                      <th className="py-2 px-2">Confirmations</th>
                      <th className="py-2 px-3">Zones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {model.submitterCohorts.slice(0, 25).map((c) => (
                      <tr key={c.token}>
                        <td className="py-2 px-3 font-mono font-semibold text-ink">
                          {c.token}
                        </td>
                        <td className="py-2 px-2 font-mono text-primary">
                          {c.isValidChecksum ? '✓ Valid' : '✗ Invalid'}
                        </td>
                        <td className="py-2 px-2 font-mono font-bold">
                          {c.reportCount}
                        </td>
                        <td className="py-2 px-2 font-mono text-muted">
                          +{c.confirmationsTotal}
                        </td>
                        <td className="py-2 px-3 text-muted truncate max-w-[160px]">
                          {c.zonesReported.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: RAW INCIDENT LEDGER & ADMIN DATA MANAGEMENT */}
        {activeTab === 'ledger' && (
          <div className="bg-white rounded-2xl border border-line p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-ink">
                  Complete Collected Incident Ledger ({combinedDataset.length} records)
                </h2>
                <p className="text-xs text-muted">
                  Inspect, search, export, or moderate individual geo-tagged reports.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search street, token, or note…"
                  className="px-3 py-1.5 rounded-xl border border-line bg-canvas text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={onToggleClearDemoSeed}
                  className="px-3 py-1.5 rounded-xl border border-line bg-canvas hover:bg-line/40 text-xs font-semibold text-ink transition"
                >
                  {demoSeedCleared
                    ? 'Restore 15 Pre-Seeded Map Pins'
                    : 'Clear 15 Pre-Seeded Map Pins'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-line rounded-xl max-h-[520px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-canvas sticky top-0 border-b border-line text-[10px] font-mono uppercase text-muted">
                  <tr>
                    <th className="py-2.5 px-3">ID</th>
                    <th className="py-2.5 px-3">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3">Zone / Street</th>
                    <th className="py-2.5 px-3">Impact</th>
                    <th className="py-2.5 px-3">Bin Dist</th>
                    <th className="py-2.5 px-3">Submitter Token</th>
                    <th className="py-2.5 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {combinedDataset.slice(0, 120).map((r) => {
                    const isLiveRecord = !r.id.startsWith('hist-');
                    return (
                      <tr key={r.id} className="hover:bg-canvas/50">
                        <td className="py-2 px-3 font-mono font-semibold text-ink">
                          {r.id}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted">
                          {r.createdAt.replace('T', ' ').slice(0, 16)}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-ink">{r.areaName}</div>
                          <div className="text-[11px] text-muted truncate max-w-[220px]">
                            {r.streetName}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-medium text-ink">
                            {SEVERITY_META[r.severity].shortLabel}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono">
                          <span
                            className={
                              r.dBinAllM <= 15
                                ? 'text-primary font-bold'
                                : 'text-ink'
                            }
                          >
                            {r.dBinAllM}m
                          </span>{' '}
                          <span className="text-muted">({r.nearestBinCode})</span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px] text-ink">
                          {r.submitterToken}
                        </td>
                        <td className="py-2 px-3">
                          {isLiveRecord ? (
                            <button
                              type="button"
                              onClick={() => onDeleteReport(r.id)}
                              className="text-[11px] font-semibold text-error hover:underline"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-muted">
                              12m Cohort
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-line py-4 px-4 sm:px-6 mt-8">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <div>
            <span className="font-semibold text-ink">Dedicated Firebase Hosting Site:</span>{' '}
            <span className="font-mono text-primary">https://clean-greystones.web.app</span>{' '}
            · <span className="font-semibold text-ink">Target Custom Domain:</span>{' '}
            <span className="font-mono text-ink">cleangreystones.ie</span> (Admin route:{' '}
            <span className="font-mono">cleangreystones.ie/admin</span>)
          </div>
          <div className="font-mono text-[11px]">
            Zero-PII Resident Cryptograms · Organiser Key: {DEFAULT_ADMIN_PASSCODE}
          </div>
        </div>
      </footer>
    </div>
  );
};
