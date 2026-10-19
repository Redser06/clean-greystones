import React, { useMemo, useState } from 'react';
import { CivicActionEvent, CivicAppStream, FoulingReport } from '../types';
import { computeBinsVsFoulingAnalysis } from '../utils/graphEngine';
import { computeProductMetrics } from '../utils/productMetrics';
import {
  AppStreamFilter,
  computeTemporalAndSeasonalModel,
  exportReportsToCsv,
  getAdminLockoutState,
  getReportSeverityDisplay,
  HISTORICAL_DOG_FOULING_COHORT,
  HISTORICAL_ROADS_COHORT,
  inferReportAppStream,
  isAdminSessionActive,
  isValidAnyCivicToken,
  setAdminSessionActive,
  verifyAdminPasscodeSecure,
} from '../utils/adminAnalytics';

interface AdminBackendViewProps {
  liveReports: FoulingReport[];
  civicEvents?: CivicActionEvent[];
  demoSeedCleared: boolean;
  onToggleClearDemoSeed: () => void;
  onDeleteReport: (id: string) => void;
  onClearAllBackendData?: (options: { clearReports: boolean; clearEvents: boolean }) => Promise<void>;
  onExitAdmin: () => void;
  defaultAppFilter?: AppStreamFilter;
}

type AdminTab = 'metrics' | 'seasonality' | 'diurnal' | 'cohorts' | 'ledger';

export const AdminBackendView: React.FC<AdminBackendViewProps> = ({
  liveReports,
  civicEvents = [],
  demoSeedCleared,
  onToggleClearDemoSeed,
  onDeleteReport,
  onClearAllBackendData,
  onExitAdmin,
  defaultAppFilter,
}) => {
  const hostStream: CivicAppStream = useMemo(() => {
    if (defaultAppFilter && defaultAppFilter !== 'all') return defaultAppFilter;
    if (liveReports.length > 0) return inferReportAppStream(liveReports[0]);
    if (typeof window !== 'undefined' && window.location.hostname.includes('roads')) {
      return 'greystones_roads';
    }
    return 'clean_greystones';
  }, [defaultAppFilter, liveReports]);

  const [appFilter, setAppFilter] = useState<AppStreamFilter>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('app');
      if (param === 'all' || param === 'clean_greystones' || param === 'greystones_roads') {
        return param;
      }
      if (param === 'roads') return 'greystones_roads';
      if (param === 'fouling') return 'clean_greystones';
    }
    return defaultAppFilter ?? hostStream;
  });

  const handleSelectAppFilter = (next: AppStreamFilter) => {
    setAppFilter(next);
    setZoneFilter('ALL');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('app', next);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    isAdminSessionActive()
  );
  const [passcodeInput, setPasscodeInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const [datasetScope, setDatasetScope] = useState<'full_12m' | 'live_only'>('full_12m');
  const [activeTab, setActiveTab] = useState<AdminTab>('metrics');
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [clearEventsFlag, setClearEventsFlag] = useState<boolean>(true);
  const [isClearingBackend, setIsClearingBackend] = useState<boolean>(false);

  const lockoutState = useMemo(() => getAdminLockoutState(), [loginError]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcodeInput.trim()) return;
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const res = await verifyAdminPasscodeSecure(passcodeInput);
      if (res.ok) {
        setAdminSessionActive(true);
        setIsAuthenticated(true);
        setLoginError(null);
        setPasscodeInput('');
      } else {
        setLoginError(res.error || 'Invalid administrator credentials.');
      }
    } catch {
      setLoginError('Authentication verification error. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setAdminSessionActive(false);
    setIsAuthenticated(false);
    setPasscodeInput('');
  };

  const handleConfirmClearBackend = async () => {
    if (!onClearAllBackendData) return;
    setIsClearingBackend(true);
    try {
      await onClearAllBackendData({
        clearReports: true,
        clearEvents: clearEventsFlag,
      });
      setShowClearModal(false);
      setExportToast('Live backend data cleared from Cloud Firestore.');
      setTimeout(() => setExportToast(null), 4000);
    } catch (err) {
      console.error('Failed to clear backend data:', err);
      setExportToast('Could not clear backend data. Check network connection.');
      setTimeout(() => setExportToast(null), 4000);
    } finally {
      setIsClearingBackend(false);
    }
  };

  // Build unified multi-app dataset before user zone/severity/search filters
  const appScopedPool = useMemo(() => {
    const taggedLive = liveReports.map((r) => ({
      ...r,
      appStream: inferReportAppStream(r),
    }));

    const foulingLive =
      hostStream === 'clean_greystones' ? taggedLive : [];
    const roadsLive =
      hostStream === 'greystones_roads' ? taggedLive : [];

    const foulingPool =
      datasetScope === 'full_12m'
        ? [...foulingLive, ...HISTORICAL_DOG_FOULING_COHORT]
        : foulingLive.length > 0
        ? foulingLive
        : HISTORICAL_DOG_FOULING_COHORT.slice(-15);

    const roadsPool =
      datasetScope === 'full_12m'
        ? [...roadsLive, ...HISTORICAL_ROADS_COHORT]
        : roadsLive.length > 0
        ? roadsLive
        : HISTORICAL_ROADS_COHORT.slice(-15);

    if (appFilter === 'clean_greystones') return foulingPool;
    if (appFilter === 'greystones_roads') return roadsPool;
    return [...foulingPool, ...roadsPool];
  }, [liveReports, hostStream, datasetScope, appFilter]);

  const appCountsSummary = useMemo(() => {
    const taggedLive = liveReports.map((r) => ({
      ...r,
      appStream: inferReportAppStream(r),
    }));
    const foulingTotal =
      (hostStream === 'clean_greystones' ? taggedLive.length : 0) +
      (datasetScope === 'full_12m' ? HISTORICAL_DOG_FOULING_COHORT.length : hostStream === 'clean_greystones' ? 0 : 15);
    const roadsTotal =
      (hostStream === 'greystones_roads' ? taggedLive.length : 0) +
      (datasetScope === 'full_12m' ? HISTORICAL_ROADS_COHORT.length : hostStream === 'greystones_roads' ? 0 : 15);
    return {
      foulingTotal,
      roadsTotal,
      allTotal: foulingTotal + roadsTotal,
    };
  }, [liveReports, hostStream, datasetScope]);

  const combinedDataset = useMemo(() => {
    return appScopedPool.filter((r) => {
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
  }, [appScopedPool, zoneFilter, severityFilter, searchQuery]);

  const model = useMemo(
    () => computeTemporalAndSeasonalModel(combinedDataset, appFilter),
    [combinedDataset, appFilter]
  );

  const spatialSummary = useMemo(
    () => computeBinsVsFoulingAnalysis(combinedDataset),
    [combinedDataset]
  );

  const productMetrics = useMemo(
    () => computeProductMetrics(combinedDataset, civicEvents),
    [combinedDataset, civicEvents]
  );

  const availableZones = useMemo(() => {
    const set = new Set<string>();
    appScopedPool.forEach((r) => set.add(r.areaName));
    return Array.from(set).sort();
  }, [appScopedPool]);

  const handleDownloadCsv = () => {
    const csv = exportReportsToCsv(combinedDataset);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `greystones-civic-${appFilter}-${datasetScope}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportToast(`Exported ${combinedDataset.length} rows (${appFilter}) to CSV`);
    setTimeout(() => setExportToast(null), 3500);
  };

  const handleDownloadJsonModel = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      appFilter,
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
    a.download = `greystones-civic-model-${appFilter}-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportToast(`Exported JSON Model (${appFilter})`);
    setTimeout(() => setExportToast(null), 3500);
  };

  const isRoadsView = appFilter === 'greystones_roads';
  const isAllView = appFilter === 'all';

  // 1. UNAUTHENTICATED LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-canvas text-ink flex flex-col justify-between p-4 sm:p-8">
        <header className="max-w-5xl w-full mx-auto flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-sm shadow-sm">
              GM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-ink">
                  Greystones Civic Observatory
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-ink text-white font-semibold">
                  Unified /admin
                </span>
              </div>
              <p className="text-xs text-muted">
                Common Backend Portal · Clean Greystones (Fouling) & Fix Greystones Roads (Potholes)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onExitAdmin}
            className="text-xs font-semibold text-muted hover:text-ink px-3 py-1.5 rounded-lg border border-line bg-white transition"
          >
            ← Back to Map
          </button>
        </header>

        <main className="my-auto py-8">
          <div className="max-w-md w-full mx-auto bg-white rounded-2xl border border-line shadow-sm p-6 sm:p-8">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-canvas border border-line text-[11px] font-mono font-semibold text-primary mb-4">
              <span>🔒</span> UNIFIED ORGANISER AUTHENTICATION
            </div>
            <h1 className="text-xl font-bold text-ink tracking-tight">
              Greystones Civic Backend Portal
            </h1>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              One shared backend portal for both Greystones citizen apps. Filter between{' '}
              <strong>💩 Clean Greystones (Dog Fouling)</strong>,{' '}
              <strong>🕳️ Fix Greystones Roads (Potholes)</strong>, or{' '}
              <strong>📊 Combined Municipal District View</strong> to run 12-month seasonality,
              weekend spike, and diurnal time-of-day models.
            </p>

            {lockoutState.isLocked && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-error text-xs flex items-center gap-2">
                <span className="text-base">🔒</span>
                <div>
                  <p className="font-bold">Security Lockout Active</p>
                  <p className="text-[11px] text-red-700">
                    Too many consecutive failed login attempts. Access is locked for{' '}
                    <strong>{Math.ceil(lockoutState.remainingMs / 60000)} minute(s)</strong> to protect the municipal database.
                  </p>
                </div>
              </div>
            )}

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
                  disabled={lockoutState.isLocked || isLoggingIn}
                  value={passcodeInput}
                  onChange={(e) => {
                    setPasscodeInput(e.target.value);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder={lockoutState.isLocked ? 'Access temporarily locked…' : 'Enter organiser access key…'}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-line bg-canvas text-ink font-mono focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                  autoFocus={!lockoutState.isLocked}
                />
                {loginError && (
                  <p className="text-xs text-error font-medium mt-1.5">{loginError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={lockoutState.isLocked || isLoggingIn || !passcodeInput.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-container text-white font-semibold text-sm transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <span>Verifying Credentials…</span>
                ) : (
                  <span>Sign In to Common Civic Backend</span>
                )}
              </button>

              <div className="pt-3 border-t border-line text-center">
                <p className="text-[11px] text-muted leading-relaxed">
                  🔒 Protected with SHA-256 cryptographic hashing, brute-force rate-limiting, and expiring 2-hour sessions.
                </p>
              </div>
            </form>
          </div>
        </main>

        <footer className="max-w-5xl w-full mx-auto text-center text-[11px] text-muted border-t border-line pt-4">
          Greystones Municipal District Civic Observatory · Zero-PII Cryptograms (`GS-ANON-*` & `GR-ANON-*`)
        </footer>
      </div>
    );
  }

  // 2. AUTHENTICATED COMMON ADMIN BACKEND DASHBOARD
  const maxMonthCount = Math.max(...model.monthlySeries.map((m) => m.count), 1);
  const maxDayCount = Math.max(...model.dayOfWeekSeries.map((d) => d.count), 1);
  const maxDiurnalCount = Math.max(...model.diurnalSeries.map((w) => w.count), 1);
  const maxHourCount = Math.max(...model.hourlyHistogram.map((h) => h.count), 1);

  return (
    <div className="min-h-screen bg-canvas text-ink pb-20">
      {/* Compact Sticky Top Bar + Scrollable Single-Line Tab Strip */}
      <header className="bg-white border-b border-line sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg text-white flex items-center justify-center font-bold text-xs shrink-0 ${
                isAllView
                  ? 'bg-ink'
                  : isRoadsView
                  ? 'bg-[#8c1d18]'
                  : 'bg-[#006948]'
              }`}
            >
              {isAllView ? 'GM' : isRoadsView ? 'GR' : 'CG'}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs sm:text-sm tracking-tight text-ink truncate">
                  {isAllView
                    ? 'Greystones Civic Admin (All Apps)'
                    : isRoadsView
                    ? 'Fix Greystones Roads Admin'
                    : 'Clean Greystones Admin'}
                </span>
                <span
                  className={`hidden sm:inline-block text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded text-white font-semibold ${
                    isAllView
                      ? 'bg-ink'
                      : isRoadsView
                      ? 'bg-[#8c1d18]'
                      : 'bg-[#006948]'
                  }`}
                >
                  Common Portal
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onClearAllBackendData && (
              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-error flex items-center gap-1 transition shadow-xs"
                title="Wipe live cloud data from Firestore"
              >
                <span>🗑️</span>
                <span className="hidden sm:inline">Clear Backend</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-line bg-canvas hover:bg-white text-ink transition"
            >
              ← Map
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2 py-1 text-xs font-medium text-muted hover:text-ink"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Single-line Horizontal Scrollable Tab Navigation */}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 border-t border-line flex items-center gap-1 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'metrics', label: '1. Product & Council Emails' },
              { id: 'seasonality', label: '2. Seasonality (12M)' },
              { id: 'diurnal', label: '3. Weekend & Time' },
              { id: 'cohorts', label: '4. Tokens & Zones' },
              { id: 'ledger', label: `5. Incident Ledger (${combinedDataset.length})` },
            ] as { id: AdminTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 text-xs font-semibold border-b-2 transition whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? isRoadsView
                    ? 'border-[#8c1d18] text-[#8c1d18]'
                    : 'border-[#006948] text-[#006948]'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {exportToast && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-3">
          <div
            className={`p-2.5 rounded-xl text-white text-xs font-semibold flex items-center justify-between shadow-sm ${
              isRoadsView ? 'bg-[#8c1d18]' : 'bg-[#006948]'
            }`}
          >
            <span>✓ {exportToast}</span>
            <button
              type="button"
              onClick={() => setExportToast(null)}
              className="text-white/80 hover:text-white ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 space-y-5">
        {/* TOP-LEVEL APP FILTER BAR (Common Backend Filtered by App) */}
        <section className="bg-white rounded-2xl border border-line p-3 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2.5 border-b border-line">
            <div>
              <span
                className={`text-[10px] font-mono uppercase tracking-wider font-semibold ${
                  isRoadsView ? 'text-[#8c1d18]' : 'text-[#006948]'
                }`}
              >
                Filter Common Backend by App Stream
              </span>
              <h2 className="text-xs sm:text-sm font-bold text-ink">
                Select Citizen App Dataset
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleSelectAppFilter('clean_greystones')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left flex items-center justify-between gap-2 transition ${
                  appFilter === 'clean_greystones'
                    ? 'bg-[#006948] text-white border-[#006948] shadow-xs'
                    : 'bg-canvas text-ink border-line hover:bg-white'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span>💩</span>
                  <span className="truncate">Clean Greystones</span>
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    appFilter === 'clean_greystones'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-50 text-[#006948] border border-emerald-200'
                  }`}
                >
                  {appCountsSummary.foulingTotal}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAppFilter('greystones_roads')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left flex items-center justify-between gap-2 transition ${
                  appFilter === 'greystones_roads'
                    ? 'bg-[#8c1d18] text-white border-[#8c1d18] shadow-xs'
                    : 'bg-canvas text-ink border-line hover:bg-white'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span>🕳️</span>
                  <span className="truncate">Fix Greystones Roads</span>
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    appFilter === 'greystones_roads'
                      ? 'bg-white/20 text-white'
                      : 'bg-red-50 text-[#8c1d18] border border-red-200'
                  }`}
                >
                  {appCountsSummary.roadsTotal}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectAppFilter('all')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left flex items-center justify-between gap-2 transition ${
                  appFilter === 'all'
                    ? 'bg-ink text-white border-ink shadow-xs'
                    : 'bg-canvas text-ink border-line hover:bg-white'
                }`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span>📊</span>
                  <span className="truncate">All Apps (Combined)</span>
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    appFilter === 'all'
                      ? 'bg-white/20 text-white'
                      : 'bg-white text-muted border border-line'
                  }`}
                >
                  {appCountsSummary.allTotal}
                </span>
              </button>
            </div>
          </div>

          {/* Cohort Scope, Zone/Severity Filters & Export Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
              <button
                type="button"
                onClick={() => setDatasetScope('full_12m')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                  datasetScope === 'full_12m'
                    ? 'bg-white text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                12-Month Model ({appScopedPool.length})
              </button>
              <button
                type="button"
                onClick={() => setDatasetScope('live_only')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                  datasetScope === 'live_only'
                    ? 'bg-white text-ink shadow-xs'
                    : 'text-muted hover:text-ink'
                }`}
              >
                Live Session ({liveReports.length})
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDownloadCsv}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-line bg-white hover:bg-canvas text-ink transition"
              >
                ⬇ CSV ({combinedDataset.length})
              </button>
              <button
                type="button"
                onClick={handleDownloadJsonModel}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg text-white transition ${
                  isRoadsView
                    ? 'bg-[#8c1d18] hover:bg-[#6e1410]'
                    : 'bg-[#006948] hover:bg-[#00855d]'
                }`}
              >
                ⬇ JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-2 border-t border-line text-xs">
            <select
              aria-label="Filter by Greystones zone or corridor"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-line bg-canvas text-ink font-medium text-xs w-full sm:w-auto"
            >
              <option value="ALL">All Zones / Corridors ({availableZones.length})</option>
              {availableZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by impact severity"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-line bg-canvas text-ink font-medium text-xs w-full sm:w-auto"
            >
              <option value="ALL">All Severities</option>
              {isRoadsView ? (
                <>
                  <option value="just_poop">🕳️ Pothole / Surface Crater</option>
                  <option value="stepped_in">🚧 Sunken Trench / Ponding</option>
                  <option value="buggy_wheels">🚲 Cyclist / Buggy Hazard</option>
                  <option value="wheelchair_wheels">🛞 Tyre / Rim Strike</option>
                </>
              ) : isAllView ? (
                <>
                  <option value="just_poop">💩 / 🕳️ Standard Spotted</option>
                  <option value="stepped_in">👟 / 🚧 Stepped In / Trench</option>
                  <option value="buggy_wheels">👶 / 🚲 Buggy / Cyclist Hazard</option>
                  <option value="wheelchair_wheels">♿ / 🛞 Wheelchair / Tyre Strike</option>
                </>
              ) : (
                <>
                  <option value="just_poop">💩 Dog Poop Spotted</option>
                  <option value="stepped_in">👟 Stepped In It</option>
                  <option value="buggy_wheels">👶 Buggy Wheels Hit</option>
                  <option value="wheelchair_wheels">♿ Wheelchair Wheels Hit</option>
                </>
              )}
            </select>

            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search street, token, ID…"
              className="col-span-2 sm:flex-1 min-w-[160px] px-2.5 py-1.5 rounded-lg border border-line bg-canvas text-ink text-xs"
            />
          </div>
        </section>

        {/* TOP EXECUTIVE SUMMARY SCORECARD */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              1. Seasonality Verdict
            </span>
            <p className="text-lg font-bold text-ink mt-1">
              {model.isYearRoundStructural
                ? isRoadsView
                  ? 'Trench + Winter Surge'
                  : isAllView
                  ? 'Year-Round + Winter Peak'
                  : 'Year-Round Structural'
                : 'Active Cohort'}
            </p>
            <p className="text-xs text-muted mt-1">
              Winter rate is{' '}
              <strong className="text-ink">{model.winterToSummerRatioPct}%</strong> of
              Summer rate (CV{' '}
              <span className="font-mono">
                {model.seasonalityCoefficientOfVariation}
              </span>
              )
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              2. Weekend Spike Multiplier
            </span>
            <p className="text-lg font-bold text-primary mt-1">
              {model.weekendSpikeMultiplier}× on Sat–Sun
            </p>
            <p className="text-xs text-muted mt-1">
              Weekend avg <strong className="text-ink">{model.weekendAvgPerDay}/day</strong>{' '}
              vs Weekday <strong className="text-ink">{model.weekdayAvgPerDay}/day</strong>
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              {isRoadsView || isAllView
                ? '3. Logged Tyre & Rim Damage'
                : '3. Peak Patrol Window'}
            </span>
            {isRoadsView || isAllView ? (
              <>
                <p className="text-lg font-bold text-error mt-1">
                  €{model.totalDamageEuro.toLocaleString()}
                </p>
                <p className="text-xs text-muted mt-1">
                  {isAllView
                    ? `${model.foulingCount} Fouling + ${model.roadsCount} Road Defects`
                    : `${spatialSummary.highImpactCount} high-impact strikes (${spatialSummary.highImpactPct}%)`}
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-ink mt-1">
                  {model.peakDiurnalWindow?.hoursLabel}
                </p>
                <p className="text-xs text-muted mt-1">
                  Top 2 windows capture{' '}
                  <strong className="text-ink">{model.topTwoWindowsCapturePct}%</strong> of
                  all fouling
                </p>
              </>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted">
              {isRoadsView
                ? '4. Repeat Patch Proximity'
                : isAllView
                ? '4. Bin / Patch Proximity (≤50m)'
                : '4. Submitter Cryptograms'}
            </span>
            {isRoadsView || isAllView ? (
              <>
                <p className="text-lg font-bold text-ink mt-1">
                  {spatialSummary.nearBin50mPct}% ≤50m
                </p>
                <p className="text-xs text-muted mt-1">
                  <strong className="text-primary">{spatialSummary.nearBin15mPct}%</strong>{' '}
                  within 15m •{' '}
                  <strong className="text-ink">{model.submitterCohorts.length}</strong>{' '}
                  tokens
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-ink mt-1">
                  {model.submitterCohorts.length} Distinct Devices
                </p>
                <p className="text-xs text-muted mt-1">
                  <strong className="text-primary">{model.validTokenPct}%</strong> valid{' '}
                  <code className="font-mono">GS-ANON</code> checksums
                </p>
              </>
            )}
          </div>
        </section>

        {/* TAB 0: PRODUCT METRICS, ACTIVE USERS & EMAIL ACTIVITY */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            {/* Executive Overview Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-line shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                    Live Product & Civic Impact Dashboard
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Real-Time Telemetry
                  </span>
                </div>
                <h2 className="text-lg font-bold text-ink mt-0.5">
                  Greystones Resident Adoption & Council Engagement
                </h2>
                <p className="text-xs text-muted mt-1 max-w-2xl">
                  Tracking active residents, daily fouling spots, email conversions to councillors, and button click behaviour across devices.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onClearAllBackendData && (
                  <button
                    type="button"
                    onClick={() => setShowClearModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-error border border-red-200 text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
                  >
                    <span>🗑️</span>
                    <span>Clear Live Backend Data</span>
                  </button>
                )}
              </div>
            </div>

            {/* 4 KPI Scorecards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted">
                  <span>Resident Active Users</span>
                  <span className="text-[10px] text-primary font-bold">DAU / MAU</span>
                </div>
                <p className="text-2xl font-bold text-ink mt-1">
                  {productMetrics.dau} <span className="text-xs font-normal text-muted">DAU</span> · {productMetrics.mau} <span className="text-xs font-normal text-muted">MAU</span>
                </p>
                <div className="text-xs text-muted mt-2 space-y-0.5">
                  <p>• <strong>{productMetrics.dau}</strong> active today (24h)</p>
                  <p>• <strong>{productMetrics.wau}</strong> active this week (7d)</p>
                  <p>• <strong>{productMetrics.totalUniqueTokens}</strong> all-time verified tokens</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted">
                  <span>Council Email Clicks</span>
                  <span className="text-[10px] text-primary font-bold">{productMetrics.emailConversionRate}% conversion</span>
                </div>
                <p className="text-2xl font-bold text-primary mt-1">
                  {productMetrics.totalEmailClicks} <span className="text-xs font-normal text-muted">clicks</span>
                </p>
                <div className="text-xs text-muted mt-2 space-y-0.5">
                  <p>• <strong>{productMetrics.uniqueEmailSenders}</strong> distinct residents emailed</p>
                  <p>• <strong>{productMetrics.mailtoClicks}</strong> in native email apps</p>
                  <p>• <strong>{productMetrics.copyClicks}</strong> copied text · <strong>{productMetrics.gmailClicks}</strong> Gmail</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted">
                  <span>Poos Logged Daily Rate</span>
                  <span className="text-[10px] text-primary font-bold">14-Day Baseline</span>
                </div>
                <p className="text-2xl font-bold text-ink mt-1">
                  {productMetrics.avgPoosPerDay} <span className="text-xs font-normal text-muted">avg / day</span>
                </p>
                <div className="text-xs text-muted mt-2 space-y-0.5">
                  <p>• <strong>{productMetrics.totalPoosLogged}</strong> total observations mapped</p>
                  <p>• <strong>{productMetrics.corroborationRate}%</strong> corroborated by 2+ residents</p>
                  <p>• <strong>{productMetrics.highImpactPct}%</strong> wheelchair/buggy/shoe hits</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-line p-4 shadow-xs">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted">
                  <span>Bin Proximity Audit</span>
                  <span className="text-[10px] text-error font-bold">Enforcement Gap</span>
                </div>
                <p className="text-2xl font-bold text-error mt-1">
                  {productMetrics.nearBin50mPct}% <span className="text-xs font-normal text-muted">≤50m of bin</span>
                </p>
                <div className="text-xs text-muted mt-2 space-y-0.5">
                  <p>• <strong>{spatialSummary.nearBin15mPct}%</strong> right beside bins (≤15m)</p>
                  <p>• <strong>{spatialSummary.gt200mCount}</strong> on unserved routes (&gt;200m)</p>
                  <p>• <strong>0</strong> dedicated dog-waste bins in town</p>
                </div>
              </div>
            </div>

            {/* WHO HAS EMAILED THE COUNCIL (Ledger) */}
            <section className="bg-white rounded-2xl border border-line p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-line">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                      Citizen Engagement Audit
                    </span>
                    <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                      {productMetrics.emailLedger.length} Total Emails Prepared
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-ink mt-0.5">
                    Who Has Emailed the Council (Resident Device Ledger)
                  </h3>
                  <p className="text-xs text-muted">
                    Anonymised cryptographic tokens showing which residents clicked to email councillors, which template they sent, and when.
                  </p>
                </div>
              </div>

              {productMetrics.emailLedger.length === 0 ? (
                <div className="p-8 text-center bg-canvas rounded-xl border border-line space-y-2">
                  <span className="text-3xl">📬</span>
                  <p className="text-sm font-semibold text-ink">No councillor email clicks recorded yet</p>
                  <p className="text-xs text-muted max-w-md mx-auto">
                    When residents tap &ldquo;Open in Your Email App&rdquo;, &ldquo;Copy Email&rdquo;, or &ldquo;Gmail Web&rdquo; on the Email Council tab, their anonymised token and template selection will appear here in real time.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-line text-muted font-mono uppercase text-[10px]">
                        <th className="py-2.5 pr-3">Submitter Token</th>
                        <th className="py-2.5 pr-3">Timestamp (UTC)</th>
                        <th className="py-2.5 pr-3">Action Button Clicked</th>
                        <th className="py-2.5 pr-3">Template Selected</th>
                        <th className="py-2.5 pr-3">Targeted Councillors</th>
                        <th className="py-2.5">Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {productMetrics.emailLedger.slice(0, 50).map((ev) => (
                        <tr key={ev.id} className="hover:bg-canvas/60">
                          <td className="py-2.5 pr-3 font-mono font-semibold text-ink">
                            {ev.submitterToken}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-muted whitespace-nowrap">
                            {ev.timestamp.slice(0, 16).replace('T', ' ')}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                ev.type === 'email_council_mailto'
                                  ? 'bg-emerald-50 text-[#006948] border-emerald-200'
                                  : ev.type === 'email_council_gmail'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              {ev.type === 'email_council_mailto'
                                ? '✉️ Open Email App'
                                : ev.type === 'email_council_gmail'
                                ? '🌐 Gmail Web'
                                : '📋 Copied Email'}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 font-medium text-ink">
                            {ev.metadata?.templateLabel || ev.metadata?.templateId || 'Practical Action'}
                          </td>
                          <td className="py-2.5 pr-3 text-muted">
                            {ev.metadata?.councillors?.length
                              ? `${ev.metadata.councillors.length} Councillors (${ev.metadata.councillors.slice(0, 2).join(', ')}…)`
                              : 'All 6 MD Councillors'}
                          </td>
                          <td className="py-2.5">
                            <span className="text-[10px] font-mono text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              ✓ Valid Checksum
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* NUMBER OF POOS LOGGED PER DAY (Time-Series & Chart) */}
            <section className="bg-white rounded-2xl border border-line p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-line">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                    Daily Incident Telemetry
                  </span>
                  <h3 className="text-base font-bold text-ink mt-0.5">
                    Number of Poos Logged per Day (Last 14 Days)
                  </h3>
                  <p className="text-xs text-muted">
                    Daily activity breakdown showing observation counts, high-impact hits (wheels/shoes), and distinct reporting devices.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold text-ink">14-Day Total: </span>
                  <span className="text-sm font-bold text-primary">
                    {productMetrics.dailyPoos.reduce((acc, d) => acc + d.count, 0)} drops
                  </span>
                </div>
              </div>

              {/* 14-Day Visual Bar Chart */}
              <div className="grid grid-cols-7 sm:grid-cols-14 gap-2 pt-2">
                {(() => {
                  const maxDay = Math.max(...productMetrics.dailyPoos.map((d) => d.count), 1);
                  return productMetrics.dailyPoos.map((d) => {
                    const heightPct = Math.round((d.count / maxDay) * 100);
                    return (
                      <div key={d.date} className="flex flex-col items-center gap-1.5 group">
                        <span className="text-[10px] font-mono font-bold text-ink">{d.count}</span>
                        <div className="w-full h-24 bg-canvas rounded-lg border border-line flex items-end p-1 relative overflow-hidden">
                          <div
                            style={{ height: `${Math.max(heightPct, 6)}%` }}
                            className={`w-full rounded-md transition-all ${
                              d.count > 0 ? 'bg-primary group-hover:bg-primary-container' : 'bg-line'
                            }`}
                            title={`${d.date}: ${d.count} poos (${d.highImpactCount} high impact, ${d.distinctSubmitters} residents)`}
                          />
                        </div>
                        <div className="text-center">
                          <span className="block text-[10px] font-bold text-ink">{d.dayLabel}</span>
                          <span className="block text-[9px] font-mono text-muted">{d.date.slice(5)}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Summary Table */}
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted font-mono uppercase text-[10px]">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Day</th>
                      <th className="py-2 pr-3">Poos Logged</th>
                      <th className="py-2 pr-3">Wheel / Shoe Contaminations</th>
                      <th className="py-2">Active Reporting Devices</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {productMetrics.dailyPoos
                      .slice()
                      .reverse()
                      .map((d) => (
                        <tr key={d.date} className="hover:bg-canvas/50">
                          <td className="py-2 pr-3 font-mono font-semibold text-ink">{d.date}</td>
                          <td className="py-2 pr-3 text-muted">{d.dayLabel}</td>
                          <td className="py-2 pr-3 font-bold text-ink">
                            <span className={d.count > 0 ? 'text-primary' : 'text-muted'}>
                              {d.count}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            {d.highImpactCount > 0 ? (
                              <span className="text-error font-semibold">
                                {d.highImpactCount} hits
                              </span>
                            ) : (
                              <span className="text-muted">0</span>
                            )}
                          </td>
                          <td className="py-2 font-mono text-muted">{d.distinctSubmitters} devices</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* BUTTON CLICK BREAKDOWN & CONVERSION FUNNEL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <section className="bg-white rounded-2xl border border-line p-5 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-ink">Email Action Button Clicks Breakdown</h3>
                <p className="text-xs text-muted">
                  How residents choose to dispatch their email to Greystones Municipal District councillors:
                </p>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-canvas border border-line text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">✉️</span>
                      <div>
                        <p className="font-semibold text-ink">Open in Email App (mailto)</p>
                        <p className="text-[11px] text-muted">Default system mail client</p>
                      </div>
                    </div>
                    <span className="font-bold text-base text-primary">{productMetrics.mailtoClicks}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-canvas border border-line text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">📋</span>
                      <div>
                        <p className="font-semibold text-ink">Copy Full Email Text</p>
                        <p className="text-[11px] text-muted">Manual paste into custom mail client</p>
                      </div>
                    </div>
                    <span className="font-bold text-base text-ink">{productMetrics.copyClicks}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-canvas border border-line text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🌐</span>
                      <div>
                        <p className="font-semibold text-ink">Gmail Web Composer</p>
                        <p className="text-[11px] text-muted">Direct browser Gmail link</p>
                      </div>
                    </div>
                    <span className="font-bold text-base text-ink">{productMetrics.gmailClicks}</span>
                  </div>
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-line p-5 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-ink">Civic Engagement Conversion Funnel</h3>
                <p className="text-xs text-muted">
                  From anonymous visitor to verified councillor email advocate:
                </p>
                <div className="space-y-2.5 pt-1 text-xs">
                  <div>
                    <div className="flex justify-between font-semibold pb-1">
                      <span>1. Unique Resident Tokens (Top of Funnel)</span>
                      <span>{productMetrics.totalUniqueTokens}</span>
                    </div>
                    <div className="w-full bg-canvas h-2.5 rounded-full overflow-hidden border border-line">
                      <div className="bg-primary h-full rounded-full w-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-semibold pb-1">
                      <span>2. Logged Observation on Map</span>
                      <span>{productMetrics.totalPoosLogged} drops</span>
                    </div>
                    <div className="w-full bg-canvas h-2.5 rounded-full overflow-hidden border border-line">
                      <div
                        style={{
                          width: `${Math.min(
                            Math.round(
                              (productMetrics.totalPoosLogged /
                                Math.max(productMetrics.totalUniqueTokens, 1)) *
                                100
                            ),
                            100
                          )}%`,
                        }}
                        className="bg-primary h-full rounded-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-semibold pb-1">
                      <span>3. Corroborated Multi-Resident Pins (+1)</span>
                      <span>{productMetrics.corroborationRate}% rate</span>
                    </div>
                    <div className="w-full bg-canvas h-2.5 rounded-full overflow-hidden border border-line">
                      <div
                        style={{ width: `${productMetrics.corroborationRate}%` }}
                        className="bg-primary h-full rounded-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between font-semibold pb-1">
                      <span>4. Dispatched Email to Council</span>
                      <span className="text-primary font-bold">
                        {productMetrics.uniqueEmailSenders} ({productMetrics.emailConversionRate}% conversion)
                      </span>
                    </div>
                    <div className="w-full bg-canvas h-2.5 rounded-full overflow-hidden border border-line">
                      <div
                        style={{ width: `${Math.min(productMetrics.emailConversionRate, 100)}%` }}
                        className="bg-primary h-full rounded-full"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* TAB 1: TIME-SERIES & SEASONALITY LAB */}
        {activeTab === 'seasonality' && (
          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-line p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-line">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                    Hypothesis Test 1 · Seasonality vs Year-Round Baseline (
                    {isAllView
                      ? 'All Civic Streams'
                      : isRoadsView
                      ? 'Fix Greystones Roads'
                      : 'Clean Greystones'}
                    )
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-ink mt-0.5">
                    {model.seasonalityHeadline}
                  </h2>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-canvas border border-line text-ink">
                  {model.dateRangeLabel}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-muted mt-3 leading-relaxed">
                {model.seasonalityExplanation}
              </p>

              {/* 12-Month Time-Series Bar Chart (Horizontally Scrollable on Mobile) */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-muted mb-2">
                  <span className="font-semibold text-ink">
                    Monthly Incident Trajectory (
                    {isAllView
                      ? 'Stacked Fouling + Roads'
                      : isRoadsView
                      ? 'Bar = Total Defects · Top = € Damage'
                      : 'Bar = Total · Red = Wheel/Shoe Hits'}
                    )
                  </span>
                  <span className="font-mono">
                    Avg {model.weeklyRateAvg} incidents / week
                  </span>
                </div>

                <div className="overflow-x-auto no-scrollbar rounded-xl bg-canvas border border-line p-3">
                  <div
                    className="grid gap-2 items-end min-w-[520px] pt-4"
                    style={{ gridTemplateColumns: 'repeat(12, minmax(38px, 1fr))' }}
                  >
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
                          className="flex flex-col items-center justify-end group"
                        >
                          <span className="text-[9px] font-mono text-muted mb-0.5">
                            {isRoadsView && m.damageEuroTotal > 0
                              ? `€${Math.round(m.damageEuroTotal / 100) / 10}k`
                              : isAllView
                              ? `${m.foulingCount}+${m.roadsCount}`
                              : `${m.nearBin50mPct}%`}
                          </span>
                          <span className="text-[11px] font-mono font-bold text-ink mb-1">
                            {m.count}
                          </span>
                          <div className="w-full h-28 flex items-end justify-center">
                            <div
                              style={{ height: `${heightPct}%` }}
                              className={`w-full max-w-[30px] rounded-t-lg relative overflow-hidden transition-all ${
                                isRoadsView
                                  ? 'bg-[#8c1d18]'
                                  : 'bg-[#006948]'
                              }`}
                              title={`${m.label}: ${m.count} total (${m.foulingCount} fouling, ${m.roadsCount} roads), ${m.highImpactCount} high-impact`}
                            >
                              <div
                                style={{ height: `${highPct}%` }}
                                className={`w-full bottom-0 absolute left-0 ${
                                  isRoadsView ? 'bg-[#450a0a]' : 'bg-error'
                                }`}
                              />
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-muted mt-1.5 truncate">
                            {m.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 4-Season Comparison Cards */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {model.seasonalBreakdown.map((s) => (
                  <div
                    key={s.season}
                    className="rounded-xl border border-line bg-canvas p-3.5 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink">{s.season}</span>
                      <span className="text-[11px] font-mono text-muted">
                        {s.monthsLabel}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-xl font-bold text-ink">
                        {s.avgPerMonth}
                        <span className="text-xs font-normal text-muted"> / mo</span>
                      </span>
                      <span
                        className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${
                          s.seasonalIndex >= 1.1
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-white text-ink border border-line'
                        }`}
                      >
                        Index {s.seasonalIndex}×
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-1.5">
                      {s.count} incidents ({s.sharePct}% of annual total)
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: WEEKEND SPIKE & DIURNAL TIME-OF-DAY CURVE */}
        {activeTab === 'diurnal' && (
          <div className="space-y-6">
            <section className="bg-white rounded-2xl border border-line p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-line">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                    Hypothesis Test 2 · Day-of-Week & Weekend Concentration
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-ink mt-0.5">
                    {model.weekendHeadline}
                  </h2>
                </div>
                <span className="text-xs font-mono text-muted">
                  Peak Day: <strong className="text-ink">{model.peakDayLabel}</strong>
                </span>
              </div>

              <div className="mt-5 grid grid-cols-7 gap-2 sm:gap-3">
                {model.dayOfWeekSeries.map((d) => {
                  const barHeightPct = Math.max(
                    14,
                    Math.round((d.count / maxDayCount) * 100)
                  );
                  return (
                    <div
                      key={d.shortLabel}
                      className={`rounded-xl border p-2.5 flex flex-col items-center ${
                        d.isWeekend
                          ? 'border-primary bg-canvas'
                          : 'border-line bg-white'
                      }`}
                    >
                      <span
                        className={`text-xs font-bold ${
                          d.isWeekend ? 'text-primary' : 'text-ink'
                        }`}
                      >
                        {d.shortLabel}
                      </span>
                      <span className="text-[10px] font-mono text-muted">
                        {d.sharePct}%
                      </span>
                      <div className="h-28 w-full flex items-end justify-center my-2">
                        <div
                          style={{ height: `${barHeightPct}%` }}
                          className={`w-full max-w-[28px] rounded-t-md ${
                            d.isWeekend ? 'bg-primary' : 'bg-ink/70'
                          }`}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold text-ink">
                        {d.count}
                      </span>
                      <span className="text-[10px] text-muted">
                        {d.highImpactCount} high-imp
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Diurnal Time-of-Day Curve & Operational Prescription */}
            <section className="bg-white rounded-2xl border border-line p-5 sm:p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-line">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                    Hypothesis Test 3 · Diurnal Time-of-Day Curve
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-ink mt-0.5">
                    When Does Reporting Spike During the Day?
                  </h2>
                </div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary text-white">
                  Top 2 Windows = {model.topTwoWindowsCapturePct}% of Reports
                </span>
              </div>

              <div className="mt-3 p-3.5 rounded-xl bg-canvas border border-line text-xs text-ink font-medium">
                <strong>Operational Prescription:</strong> {model.patrolPrescription}
              </div>

              {/* 6 Operational Shift Windows */}
              <div className="mt-5 space-y-2.5">
                {model.diurnalSeries.map((w) => {
                  const widthPct = Math.max(
                    4,
                    Math.round((w.count / maxDiurnalCount) * 100)
                  );
                  return (
                    <div
                      key={w.id}
                      className="p-3 rounded-xl border border-line bg-canvas/60"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-ink">
                            {w.hoursLabel}
                          </span>
                          <span className="font-semibold text-ink">{w.label}</span>
                          <span
                            className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                              w.patrolPriority === 'CRITICAL'
                                ? 'bg-error text-white'
                                : w.patrolPriority === 'HIGH'
                                ? 'bg-primary text-white'
                                : 'bg-white border border-line text-muted'
                            }`}
                          >
                            {w.patrolPriority}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-muted">
                          <strong className="text-ink">{w.count}</strong> ({w.sharePct}%) ·
                          Wkday {w.weekdayCount} / Wknd {w.weekendCount}
                        </div>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-white border border-line overflow-hidden">
                        <div
                          style={{ width: `${widthPct}%` }}
                          className={`h-full rounded-full ${
                            w.patrolPriority === 'CRITICAL'
                              ? 'bg-error'
                              : 'bg-primary'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 24-Hour Fine-Grained Histogram */}
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">
                  24-Hour Fine-Grained Reporting Curve (00:00 – 23:00)
                </h3>
                <div className="overflow-x-auto no-scrollbar rounded-xl bg-canvas border border-line p-3">
                  <div
                    className="grid gap-1.5 items-end min-w-[560px]"
                    style={{ gridTemplateColumns: 'repeat(24, minmax(20px, 1fr))' }}
                  >
                    {model.hourlyHistogram.map((h) => {
                      const hPct =
                        h.count === 0
                          ? 4
                          : Math.max(12, Math.round((h.count / maxHourCount) * 100));
                      return (
                        <div
                          key={h.hour}
                          className="flex flex-col items-center justify-end"
                          title={`${h.label} — ${h.count} incidents`}
                        >
                          <span className="text-[9px] font-mono text-muted mb-0.5">
                            {h.count > 0 ? h.count : ''}
                          </span>
                          <div className="w-full h-20 flex items-end justify-center">
                            <div
                              style={{ height: `${hPct}%` }}
                              className={`w-full rounded-t ${
                                h.isPeak ? 'bg-primary' : 'bg-ink/40'
                              }`}
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
            </section>
          </div>
        )}

        {/* TAB 3: SUBMITTER CRYPTOGRAM COHORTS & SPATIAL AUDIT */}
        {activeTab === 'cohorts' && (
          <div className="space-y-6">
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-line p-5 shadow-xs">
                <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                  Spatial Infrastructure Audit
                </span>
                <h3 className="text-base font-bold text-ink mt-0.5">
                  {isRoadsView
                    ? 'Repeat Patch Washout vs Unpatched Outer Roads'
                    : isAllView
                    ? 'Combined Proximity Audit (Bins & Road Patches)'
                    : 'Seafront Enforcement Gap vs Outer Walk Bin Deficit'}
                </h3>
                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-canvas border border-line flex items-center justify-between">
                    <span>
                      {isRoadsView
                        ? 'Within 15m of a Prior Patch / Trench'
                        : 'Within 15m of a Public Bin / Prior Patch'}
                    </span>
                    <strong className="font-mono text-sm text-primary">
                      {spatialSummary.nearBin15mCount} ({spatialSummary.nearBin15mPct}%)
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line flex items-center justify-between">
                    <span>
                      {isRoadsView
                        ? 'Within 50m of a Prior Patch / Trench'
                        : 'Within 50m of a Public Bin / Prior Patch'}
                    </span>
                    <strong className="font-mono text-sm text-ink">
                      {spatialSummary.nearBin50mCount} ({spatialSummary.nearBin50mPct}%)
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line flex items-center justify-between">
                    <span>
                      {isRoadsView
                        ? 'Unpatched Outer Roads (>100m from prior works)'
                        : 'Unserved Outer Routes (>200m)'}
                    </span>
                    <strong className="font-mono text-sm text-error">
                      {spatialSummary.gt200mCount} ({spatialSummary.gt200mPct}%)
                    </strong>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-line p-5 shadow-xs">
                <span className="text-[11px] font-mono uppercase tracking-wider text-primary font-semibold">
                  Anti-Astroturfing & Cryptogram Integrity
                </span>
                <h3 className="text-base font-bold text-ink mt-0.5">
                  Submitter Token Distribution (`GS-ANON` & `GR-ANON`)
                </h3>
                <p className="text-xs text-muted mt-1">
                  Proves to Wicklow County Council that reports originate from broad
                  community participation rather than a single device spamming the map.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-canvas border border-line">
                    <span className="text-muted block">Distinct Devices</span>
                    <strong className="text-lg font-bold text-ink">
                      {model.submitterCohorts.length}
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line">
                    <span className="text-muted block">Valid Checksums</span>
                    <strong className="text-lg font-bold text-primary">
                      {model.validTokenPct}%
                    </strong>
                  </div>
                </div>
              </div>
            </section>

            {/* Submitter Cohort Table */}
            <section className="bg-white rounded-2xl border border-line p-5 shadow-xs">
              <h3 className="text-sm font-bold text-ink mb-3">
                Top Anonymous Resident Submitter Tokens ({model.submitterCohorts.length}{' '}
                total)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted font-mono uppercase text-[10px]">
                      <th className="py-2 pr-3">Submitter Token</th>
                      <th className="py-2 pr-3">App Stream</th>
                      <th className="py-2 pr-3">Checksum</th>
                      <th className="py-2 pr-3">Reports</th>
                      <th className="py-2 pr-3">Damage (€)</th>
                      <th className="py-2 pr-3">Zones / Corridors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {model.submitterCohorts.slice(0, 20).map((c) => (
                      <tr key={c.token} className="hover:bg-canvas/60">
                        <td className="py-2 pr-3 font-mono font-semibold text-ink">
                          {c.token}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                              c.appStream === 'greystones_roads'
                                ? 'bg-red-50 text-[#8c1d18] border-red-200'
                                : 'bg-emerald-50 text-[#006948] border-emerald-200'
                            }`}
                          >
                            {c.appStream === 'greystones_roads'
                              ? '🕳️ Fix Roads'
                              : '💩 Clean GS'}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {c.isValidChecksum ? (
                            <span
                              className={`font-semibold ${
                                c.appStream === 'greystones_roads'
                                  ? 'text-[#8c1d18]'
                                  : 'text-[#006948]'
                              }`}
                            >
                              ✓ Valid
                            </span>
                          ) : (
                            <span className="text-error font-semibold">Invalid</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono font-bold text-ink">
                          {c.reportCount}
                        </td>
                        <td className="py-2 pr-3 font-mono text-ink">
                          {c.damageEuroTotal > 0 ? `€${c.damageEuroTotal}` : '—'}
                        </td>
                        <td className="py-2 pr-3 text-muted">
                          {c.zonesReported.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: FULL INCIDENT LEDGER & SEED MANAGEMENT */}
        {activeTab === 'ledger' && (
          <section className="bg-white rounded-2xl border border-line p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line">
              <div>
                <h2 className="text-base font-bold text-ink">
                  Unified Civic Incident Ledger ({combinedDataset.length} rows)
                </h2>
                <p className="text-xs text-muted">
                  Showing {appFilter === 'all' ? 'both Clean Greystones & Fix Greystones Roads' : appFilter === 'greystones_roads' ? 'Fix Greystones Roads (Potholes)' : 'Clean Greystones (Dog Fouling)'} records.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onClearAllBackendData && (
                  <button
                    type="button"
                    onClick={() => setShowClearModal(true)}
                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-error transition flex items-center gap-1 shadow-xs"
                  >
                    <span>🗑️</span>
                    <span>Clear Live Backend Data</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onToggleClearDemoSeed}
                  className="px-3 py-1.5 rounded-lg border border-line bg-canvas hover:bg-white text-xs font-semibold text-ink transition"
                >
                  {demoSeedCleared
                    ? 'Restore Pre-Seeded Demo Pins'
                    : 'Clear Demo Seeds on Public Map'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-muted font-mono uppercase text-[10px]">
                    <th className="py-2 pr-3">ID</th>
                    <th className="py-2 pr-3">App</th>
                    <th className="py-2 pr-3">Timestamp (UTC)</th>
                    <th className="py-2 pr-3">Zone / Street</th>
                    <th className="py-2 pr-3">Impact / Severity</th>
                    <th className="py-2 pr-3">Damage / Depth</th>
                    <th className="py-2 pr-3">Proximity</th>
                    <th className="py-2 pr-3">Submitter Token</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {combinedDataset.slice(0, 80).map((r) => {
                    const stream = inferReportAppStream(r);
                    const meta = getReportSeverityDisplay(r);
                    const validTok = isValidAnyCivicToken(r.submitterToken);
                    const isLiveDeletable = liveReports.some((lr) => lr.id === r.id);
                    return (
                      <tr key={`${stream}-${r.id}`} className="hover:bg-canvas/60">
                        <td className="py-2.5 pr-3 font-mono font-semibold text-ink">
                          {r.id}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              stream === 'greystones_roads'
                                ? 'bg-red-50 text-[#8c1d18] border-red-200'
                                : 'bg-emerald-50 text-[#006948] border-emerald-200'
                            }`}
                          >
                            {stream === 'greystones_roads' ? '🕳️ Roads' : '💩 Fouling'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-muted whitespace-nowrap">
                          {r.createdAt.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="font-semibold text-ink">{r.areaName}</div>
                          <div className="text-[11px] text-muted">{r.streetName}</div>
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-canvas border border-line text-ink font-medium">
                            <span>{meta.emoji}</span>
                            <span>{meta.shortLabel}</span>
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono whitespace-nowrap">
                          {r.damageEuro && r.damageEuro > 0 ? (
                            <span className="text-error font-bold">€{r.damageEuro}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                          {r.depthCm ? (
                            <span className="text-muted ml-1">({r.depthCm}cm)</span>
                          ) : null}
                        </td>
                        <td className="py-2.5 pr-3 font-mono whitespace-nowrap">
                          <strong
                            className={
                              r.dBinAllM <= 20 ? 'text-primary' : 'text-ink'
                            }
                          >
                            {r.dBinAllM}m
                          </strong>{' '}
                          <span className="text-muted">({r.nearestBinCode})</span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono whitespace-nowrap">
                          <span className="text-ink">{r.submitterToken}</span>{' '}
                          {validTok && (
                            <span
                              className="text-primary font-bold"
                              title="Valid Mod-36 Checksum"
                            >
                              ✓
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          {isLiveDeletable ? (
                            <button
                              type="button"
                              onClick={() => onDeleteReport(r.id)}
                              className="text-xs text-error hover:underline font-semibold"
                            >
                              Delete
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-muted">
                              12M Cohort
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* CLEAR BACKEND DATA CONFIRMATION MODAL */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-line shadow-2xl p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-error flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <div>
                <h3 className="font-bold text-base text-ink">
                  Clear Live Backend Data
                </h3>
                <p className="text-xs text-muted">
                  Permanent wipe of crowdsourced cloud documents
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-canvas border border-line text-xs text-ink space-y-2">
              <p className="leading-relaxed">
                This will delete all live reports in Cloud Firestore (<code className="font-mono font-bold text-ink">clean_greystones_reports</code>) and reset the cached data on all connected devices.
              </p>
              <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={clearEventsFlag}
                  onChange={(e) => setClearEventsFlag(e.target.checked)}
                  className="rounded border-line text-error focus:ring-error"
                />
                <span className="font-semibold text-ink">
                  Also clear civic product analytics events ({civicEvents.length} events)
                </span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                disabled={isClearingBackend}
                className="px-4 py-2 rounded-xl border border-line bg-white hover:bg-canvas text-xs font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearBackend}
                disabled={isClearingBackend}
                className="px-4 py-2 rounded-xl bg-error hover:bg-error/90 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                {isClearingBackend ? (
                  <span>Wiping Cloud Data...</span>
                ) : (
                  <span>Yes, Delete All Live Data</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
