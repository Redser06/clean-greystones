import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  COUNCIL_CC_CONTACTS,
  EMAIL_TEMPLATES,
  GREYSTONES_COUNCILLORS,
  HANSARD_RECORDS,
  INITIAL_PUBLIC_BINS,
  INITIAL_REPORTS,
  VERIFIED_CITATIONS,
} from './data/greystonesData';
import {
  CivicActionEvent,
  CivicEventType,
  EmailTemplateId,
  FoulingReport,
  MapTimeRange,
  PublicBin,
  SeverityType,
  WeeklyEvidenceSummary,
} from './types';
import {
  SEVERITY_META,
  checkPiiAndGuardrails,
  computeBinsVsFoulingAnalysis,
  computeGreystonesCell,
  findNearestBins,
  getOrCreateSubmitterToken,
  inferGreystonesLocation,
  selectVerifiedCitations,
} from './utils/graphEngine';
import { GreystonesMapView } from './components/GreystonesMapView';
import { AdminBackendView } from './components/AdminBackendView';
import { isAdminSessionActive } from './utils/adminAnalytics';
import {
  subscribeToCrowdsourcedReports,
  syncReportToCloud,
  deleteReportFromCloud,
  incrementConfirmationInCloud,
  clearReportsFromCloud,
  seedDemoReportsToCloud,
  mergeReportInCloud,
  saveDailySnapshotToCloud,
  fetchLiveReportsFromCloud,
  logCivicEventToCloud,
  subscribeToCivicEvents,
  clearAllLiveReportsFromCloud,
  clearAllCivicEventsFromCloud,
  subscribeToCrowdsourcedBins,
  syncBinToCloud,
  deleteBinFromCloud,
} from './utils/firebaseSync';
import {
  reconcileReportLog,
  reconcileEntireReportList,
  filterReportsByTimeRange,
  computeDailySnapshots,
  computeWeeklyEvidenceSummary,
} from './utils/reconciliation';

type BottomNavTab = 'map' | 'insights' | 'council';
type HamburgerPage = 'none' | 'bins_stats' | 'legal_bylaws' | 'watchdog' | 'data_admin' | 'weekly_report';

export function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.pathname.startsWith('/admin') ||
      window.location.hash === '#admin'
    );
  });

  useEffect(() => {
    const syncRoute = () => {
      setIsAdminRoute(
        window.location.pathname.startsWith('/admin') ||
          window.location.hash === '#admin'
      );
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const enterAdminPortal = () => {
    setHamburgerOpen(false);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/admin');
    }
    setIsAdminRoute(true);
  };

  const exitAdminPortal = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
    setIsAdminRoute(false);
    setIsAdminAuthenticated(isAdminSessionActive());
  };

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => isAdminSessionActive());

  const [activeTab, setActiveTab] = useState<BottomNavTab>('map');
  const [hamburgerOpen, setHamburgerOpen] = useState<boolean>(false);
  const [hamburgerPage, setHamburgerPage] = useState<HamburgerPage>('none');

  useEffect(() => {
    if (hamburgerOpen || !isAdminRoute) {
      setIsAdminAuthenticated(isAdminSessionActive());
    }
  }, [hamburgerOpen, isAdminRoute]);

  // Real-time Crowdsourced Reports from Communal Cloud Backend (with local storage cache)
  const [reports, setReports] = useState<FoulingReport[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('clean-greystones.reports.v1');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('Failed to parse stored reports', err);
    }
    return [];
  });

  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(true);
  const [confirmDeleteReportId, setConfirmDeleteReportId] = useState<string | null>(null);

  // Subscribe to real-time communal updates across all browsers and devices
  useEffect(() => {
    const unsubscribe = subscribeToCrowdsourcedReports(
      (cloudReports) => {
        setReports(cloudReports);
        setIsCloudSyncing(false);
      },
      (err) => {
        console.warn('Communal sync unavailable, using cached local reports:', err);
        setIsCloudSyncing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Keep local storage offline cache synchronized
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('clean-greystones.reports.v1', JSON.stringify(reports));
      } catch (err) {
        console.warn('Failed to save reports to localStorage', err);
      }
    }
  }, [reports]);

  // PWA Standalone & Installation State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  });
  const [showIosInstallModal, setShowIosInstallModal] = useState<boolean>(false);

  const isIos = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const [hasDismissedInstall, setHasDismissedInstall] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem('clean-greystones.dismissed-install') === 'true';
    } catch {
      return false;
    }
  });

  const dismissInstallPrompt = () => {
    setHasDismissedInstall(true);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('clean-greystones.dismissed-install', 'true');
      } catch {
        // ignore
      }
    }
  };

  const handlePromptInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsStandalone(true);
        } else {
          dismissInstallPrompt();
        }
      } catch {
        dismissInstallPrompt();
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosInstallModal(true);
    } else {
      alert(
        'To install Clean Greystones on your device:\n1. Tap your browser menu (⋮ or Share)\n2. Select "Add to Home screen" or "Install App"'
      );
    }
  };
  const [bins, setBins] = useState<PublicBin[]>(() => {
    if (typeof window === 'undefined') return INITIAL_PUBLIC_BINS;
    try {
      const stored = localStorage.getItem('clean-greystones.bins.v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.warn('Failed to load local bins:', err);
    }
    return INITIAL_PUBLIC_BINS;
  });

  useEffect(() => {
    const unsubscribe = subscribeToCrowdsourcedBins(
      (cloudBins) => {
        if (cloudBins && cloudBins.length > 0) {
          setBins((prev) => {
            const map = new Map<string, PublicBin>();
            prev.forEach((b) => map.set(b.id, b));
            cloudBins.forEach((b) => map.set(b.id, b));
            const merged = Array.from(map.values());
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('clean-greystones.bins.v1', JSON.stringify(merged));
              } catch {
                // ignore
              }
            }
            return merged;
          });
        }
      },
      (err) => {
        console.warn('Bins subscription warning:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSaveBin = async (bin: PublicBin) => {
    setBins((prev) => {
      const idx = prev.findIndex((b) => b.id === bin.id);
      const next = idx >= 0 ? prev.map((b) => (b.id === bin.id ? bin : b)) : [...prev, bin];
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('clean-greystones.bins.v1', JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    try {
      await syncBinToCloud(bin);
    } catch (err) {
      console.warn('Could not sync bin to cloud:', err);
    }
  };

  const handleDeleteBin = async (binId: string) => {
    setBins((prev) => {
      const next = prev.filter((b) => b.id !== binId);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('clean-greystones.bins.v1', JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
    try {
      await deleteBinFromCloud(binId);
    } catch (err) {
      console.warn('Could not delete bin from cloud:', err);
    }
  };

  const handleResetBins = async () => {
    setBins(INITIAL_PUBLIC_BINS);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('clean-greystones.bins.v1', JSON.stringify(INITIAL_PUBLIC_BINS));
      } catch {
        // ignore
      }
    }
  };

  // Unique provable anonymous device token (no logins, no PII)
  const [submitterToken] = useState<string>(() => getOrCreateSubmitterToken());

  // Real-time Civic Product Analytics & Council Email Telemetry
  const [civicEvents, setCivicEvents] = useState<CivicActionEvent[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('clean-greystones.events.v1');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('Failed to parse stored civic events', err);
    }
    return [];
  });

  useEffect(() => {
    const unsubscribe = subscribeToCivicEvents(
      (events) => {
        setCivicEvents(events);
      },
      (err) => {
        console.warn('Civic events subscription unavailable:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('clean-greystones.events.v1', JSON.stringify(civicEvents));
      } catch (err) {
        console.warn('Failed to save events to localStorage', err);
      }
    }
  }, [civicEvents]);

  const recordCivicEvent = (
    type: CivicEventType,
    meta?: {
      targetButton?: 'mailto' | 'copy' | 'gmail';
      templateId?: EmailTemplateId;
      councillorIds?: string[];
      reportId?: string;
      streetName?: string;
      nearestBinCode?: string;
    }
  ) => {
    const event: CivicActionEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      submitterToken,
      timestamp: new Date().toISOString(),
      metadata: {
        ...meta,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
      },
    };
    setCivicEvents((prev) => [event, ...prev]);
    logCivicEventToCloud(event).catch((err) => {
      console.warn('Failed to sync civic event to cloud:', err);
    });
  };

  // Map Filter & Background Bin Toggle (bins run in background by default so map isn't cluttered)
  const [mapFilter, setMapFilter] = useState<'all' | 'near_bins' | 'wheels' | 'stepped_in'>('all');
  const [showBinOverlayOnMap, setShowBinOverlayOnMap] = useState<boolean>(false);

  // 1-Tap Hero Map State + Optional Post-Tap Details Sheet
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityType>('just_poop');
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number }>({
    lat: 53.14431,
    lng: -6.06047,
  });

  // User Device Geolocation State (HTML5 Geolocation API with permissions)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);

  const requestUserLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationNotice('Device geolocation is not supported in this browser.');
      return;
    }
    setIsLocating(true);
    setLocationNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setUserLocation({ lat, lng });
        setDraftCoords({ lat, lng });
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationNotice('Location permission denied. Using default Greystones map position.');
        } else {
          setLocationNotice('Could not retrieve device location. Using default map position.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  // Automatically request device geolocation on initial load
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      requestUserLocation();
    }
  }, []);
  const [selectedReport, setSelectedReport] = useState<FoulingReport | null>(null);
  const [lastLoggedReport, setLastLoggedReport] = useState<FoulingReport | null>(null);

  // BUG-1 & BUG-3: Type Chooser Bottom Sheet & Live Banner Session State
  const [isTypeChooserOpen, setIsTypeChooserOpen] = useState<boolean>(false);
  const [logState, setLogState] = useState<'idle' | 'logging' | 'completed' | 'failed'>('idle');

  // FIX-1: Close Type Chooser sheet on Escape key
  useEffect(() => {
    if (!isTypeChooserOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTypeChooserOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTypeChooserOpen]);
  const [liveBannerDismissed, setLiveBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem('clean-greystones.dismissed-live-banner') === 'true';
    } catch {
      return false;
    }
  });

  const dismissLiveBanner = () => {
    setLiveBannerDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('clean-greystones.dismissed-live-banner', 'true');
      } catch {
        // ignore storage errors
      }
    }
  };

  // Optional Extra Step Modal ("Add details / photo") after 1-Tap log
  const [expandOptionalReportModal, setExpandOptionalReportModal] = useState<boolean>(false);
  const [optionalNote, setOptionalNote] = useState<string>('');
  const [optionalPhotoPreview, setOptionalPhotoPreview] = useState<string | null>(null);
  const [noteWarnings, setNoteWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Email Builder State
  const [selectedCouncillorIds, setSelectedCouncillorIds] = useState<string[]>(
    GREYSTONES_COUNCILLORS.filter((c) => c.isDefaultSelected).map((c) => c.id)
  );
  const [selectedCcIds, setSelectedCcIds] = useState<string[]>(
    COUNCIL_CC_CONTACTS.filter((c) => c.defaultChecked).map((c) => c.id)
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<EmailTemplateId>('practical_action');
  const [customEmailBody, setCustomEmailBody] = useState<string>('');
  const [residentSignOff, setResidentSignOff] = useState<string>('A concerned Greystones resident');
  const [includeLiveEvidenceStats, setIncludeLiveEvidenceStats] = useState<boolean>(false);
  const [emailCopiedToast, setEmailCopiedToast] = useState<string>('');
  const [emailsPreparedCount, setEmailsPreparedCount] = useState<number>(42);

  // 24-Hour Daily Snapshots vs 7-Day Cumulative Map Range
  const [mapTimeRange, setMapTimeRange] = useState<MapTimeRange>('today');
  const [isFetchingBackendEvidence, setIsFetchingBackendEvidence] = useState<boolean>(false);
  const [backendRefreshNotice, setBackendRefreshNotice] = useState<string | null>(null);
  const [corroborationNotice, setCorroborationNotice] = useState<string | null>(null);

  // Batch Reconcile: cluster reports within 15m and 24h into uncluttered corroborated pins
  const { reconciled: reconciledReports } = useMemo(
    () => reconcileEntireReportList(reports, 15, 24),
    [reports]
  );

  // Time-filtered reports: 'today' (last 24h for clean daily UI) or 'week' (7-day cumulative map)
  const visibleReports = useMemo(
    () => filterReportsByTimeRange(reconciledReports, mapTimeRange),
    [reconciledReports, mapTimeRange]
  );

  // 24-Hour Daily Snapshots Archive
  const dailySnapshots = useMemo(
    () => computeDailySnapshots(reconciledReports),
    [reconciledReports]
  );

  // 7-Day Weekly Evidence Summary for Councillor Email & Weekly Map View
  const weeklyEvidence: WeeklyEvidenceSummary = useMemo(
    () => computeWeeklyEvidenceSummary(reconciledReports),
    [reconciledReports]
  );

  // Automatically save/update today's snapshot in Cloud Firestore
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySnap = dailySnapshots[todayStr];
    if (todaySnap && todaySnap.totalReports > 0) {
      saveDailySnapshotToCloud(todaySnap).catch((err) => {
        console.warn('Could not save daily snapshot to cloud:', err);
      });
    }
  }, [dailySnapshots]);

  // One-shot fetch of latest communal evidence from Cloud Firestore for Councillor Email
  const handleRefreshBackendEvidence = async () => {
    setIsFetchingBackendEvidence(true);
    setBackendRefreshNotice(null);
    try {
      const cloudReports = await fetchLiveReportsFromCloud();
      if (cloudReports.length > 0) {
        setReports(cloudReports);
        setBackendRefreshNotice(`Backend evidence updated: ${cloudReports.length} communal reports loaded.`);
      } else {
        setBackendRefreshNotice('Backend evidence confirmed: 0 reports active.');
      }
    } catch (err) {
      console.warn('Backend fetch error:', err);
      setBackendRefreshNotice('Could not reach backend; using cached evidence.');
    } finally {
      setIsFetchingBackendEvidence(false);
      setTimeout(() => setBackendRefreshNotice(null), 4000);
    }
  };

  // Background Bins-vs-Fouling & Hotspot Intelligence (Node N10)
  const analysis = useMemo(() => computeBinsVsFoulingAnalysis(visibleReports), [visibleReports]);
  const hasDemoSeeds = useMemo(() => reports.some((r) => r.isSeededDemo), [reports]);

  const draftContext = useMemo(() => {
    const loc = inferGreystonesLocation(draftCoords.lat, draftCoords.lng);
    const nearest = findNearestBins(draftCoords.lat, draftCoords.lng, bins);
    return {
      ...loc,
      ...nearest,
      h3Cell: computeGreystonesCell(draftCoords.lat, draftCoords.lng),
    };
  }, [draftCoords, bins]);

  // Instant 1-Tap Log on Map Click or Button Tap with 15m Backend Reconciliation
  const logReportImmediately = (lat: number, lng: number, severity: SeverityType) => {
    const loc = inferGreystonesLocation(lat, lng);
    const nearest = findNearestBins(lat, lng, bins);
    const h3Cell = computeGreystonesCell(lat, lng);

    const uniqueId = `rep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const candidateReport: FoulingReport = {
      id: uniqueId,
      createdAt: new Date().toISOString(),
      lat,
      lng,
      accuracyM: 2.4,
      streetName: loc.streetName,
      areaName: loc.areaName,
      h3Cell,
      severity,
      status: 'spotted',
      confirmations: 1,
      submitterToken,
      nearestBinId: nearest.nearestAll.id,
      nearestBinCode: nearest.nearestAll.code,
      dBinAllM: nearest.dBinAllM,
      dBinVerifiedM: nearest.dBinVerifiedM,
      isSeededDemo: false,
    };

    // Reconcile against existing reports (15m spatial proximity, 24h temporal proximity)
    const reconcileRes = reconcileReportLog(candidateReport, reports, 15);

    if (reconcileRes.action === 'merged') {
      const merged = reconcileRes.primaryReport;
      setReports((prev) => prev.map((r) => (r.id === merged.id ? merged : r)));
      setSelectedReport(merged);
      setLastLoggedReport(merged);
      setOptionalNote('');
      setOptionalPhotoPreview(null);
      setNoteWarnings([]);
      dismissLiveBanner();
      setCorroborationNotice(
        `Corroborated existing observation on ${merged.streetName}! Added your verification (+1).`
      );
      setTimeout(() => setCorroborationNotice(null), 5000);

      recordCivicEvent('report_corroborated', {
        reportId: merged.id,
        streetName: merged.streetName,
        nearestBinCode: merged.nearestBinCode,
      });

      mergeReportInCloud(merged, reconcileRes.mergedReportId).catch((err) => {
        console.warn('Could not merge report in cloud:', err);
      });
    } else {
      setReports((prev) => [candidateReport, ...prev]);
      setSelectedReport(candidateReport);
      setLastLoggedReport(candidateReport);
      setOptionalNote('');
      setOptionalPhotoPreview(null);
      setNoteWarnings([]);
      dismissLiveBanner();

      recordCivicEvent('report_logged', {
        reportId: candidateReport.id,
        streetName: candidateReport.streetName,
        nearestBinCode: candidateReport.nearestBinCode,
      });

      syncReportToCloud(candidateReport).catch((err) => {
        console.warn('Could not sync new report to communal cloud:', err);
      });
    }
  };

  // BUG-1: On map click or drag, record draft coords and open Type Chooser sheet
  const handleMapClickDropPin = (lat: number, lng: number) => {
    setDraftCoords({ lat, lng });
    setLogState('idle');
    setIsTypeChooserOpen(true);
  };

  // BUG-1: One type decision per log + Agent Hooks (P3)
  const handleSelectSeverityAndLog = (sev: SeverityType) => {
    setSelectedSeverity(sev);
    setIsTypeChooserOpen(false);
    setLogState('logging');
    try {
      logReportImmediately(draftCoords.lat, draftCoords.lng, sev);
      setLogState('completed');
    } catch (err) {
      console.error('Failed to log report:', err);
      setLogState('failed');
    }
  };

  const agentMapState = useMemo(() => {
    if (logState === 'logging') return 'logging';
    if (logState === 'completed') return 'completed';
    if (logState === 'failed') return 'failed_with_reason';
    if (reports.length === 0) return 'empty';
    if (mapFilter !== 'all') return 'filtering';
    return 'live';
  }, [logState, reports.length, mapFilter]);

  // BUG-5: Share Clean Greystones with neighbours / community
  const handleShareApp = async () => {
    const shareData = {
      title: 'Clean Greystones',
      text: 'Track and report dog fouling in Greystones to hold our council accountable and keep our footpaths clean.',
      url: 'https://cleangreystones.ie',
    };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled share
      }
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText('https://cleangreystones.ie');
        alert('Link copied to clipboard: https://cleangreystones.ie');
      } catch {
        // clipboard unavailable
      }
    }
  };



  const handleSaveOptionalDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastLoggedReport) return;

    if (optionalNote.trim()) {
      const check = checkPiiAndGuardrails(optionalNote);
      if (!check.ok) {
        setNoteWarnings(check.warnings);
        return;
      }
    }
    setNoteWarnings([]);

    const updated: FoulingReport = {
      ...lastLoggedReport,
      note: optionalNote.trim() || lastLoggedReport.note,
      hasPhoto: Boolean(optionalPhotoPreview) || lastLoggedReport.hasPhoto,
      photoDataUrl: optionalPhotoPreview ?? lastLoggedReport.photoDataUrl,
    };

    setReports((prev) =>
      prev.map((r) => (r.id === lastLoggedReport.id ? updated : r))
    );
    setLastLoggedReport(updated);
    setExpandOptionalReportModal(false);

    syncReportToCloud(updated).catch((err) => {
      console.warn('Could not sync report details to cloud:', err);
    });
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setOptionalPhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUndoLastDrop = () => {
    if (!lastLoggedReport) return;
    const reportId = lastLoggedReport.id;
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    setLastLoggedReport(null);
    setSelectedReport(null);
    setExpandOptionalReportModal(false);
    setLogState('idle');

    deleteReportFromCloud(reportId).catch((err) => {
      console.warn('Could not undo report in cloud:', err);
    });
  };

  const handleConfirmExistingReport = (reportId: string) => {
    const target = reports.find((r) => r.id === reportId);
    const nextCount = (target?.confirmations ?? 1) + 1;

    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, confirmations: nextCount } : r
      )
    );
    if (selectedReport?.id === reportId) {
      setSelectedReport((prev) =>
        prev ? { ...prev, confirmations: nextCount } : null
      );
    }

    recordCivicEvent('report_corroborated', {
      reportId,
      streetName: target?.streetName,
      nearestBinCode: target?.nearestBinCode,
    });

    incrementConfirmationInCloud(reportId, nextCount).catch((err) => {
      console.warn('Could not sync confirmation count to cloud:', err);
    });
  };

  // Demo vs Production Seed Management
  const handleClearSeededDemoData = () => {
    const demoIds = reports.filter((r) => r.isSeededDemo).map((r) => r.id);
    setReports((prev) => prev.filter((r) => !r.isSeededDemo));
    setSelectedReport(null);
    setLastLoggedReport(null);
    setConfirmDeleteReportId(null);

    clearReportsFromCloud(demoIds).catch((err) => {
      console.warn('Could not clear demo seeds from cloud:', err);
    });
  };

  const handleClearAllReports = () => {
    const allIds = reports.map((r) => r.id);
    setReports([]);
    setSelectedReport(null);
    setLastLoggedReport(null);
    setConfirmDeleteReportId(null);

    clearReportsFromCloud(allIds).catch((err) => {
      console.warn('Could not clear reports from cloud:', err);
    });
  };

  const handleRestoreSeededDemoData = () => {
    const userLogged = reports.filter((r) => !r.isSeededDemo);
    const combined = [...userLogged, ...INITIAL_REPORTS];
    setReports(combined);

    seedDemoReportsToCloud(INITIAL_REPORTS).catch((err) => {
      console.warn('Could not seed demo reports to cloud:', err);
    });
  };

  // Email Builder (Graph Node E1 + N9 + N10)
  const currentTemplate = useMemo(
    () => EMAIL_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? EMAIL_TEMPLATES[0],
    [selectedTemplateId]
  );

  const activeCitations = useMemo(
    () =>
      selectVerifiedCitations(
        VERIFIED_CITATIONS,
        currentTemplate.intent,
        draftContext.locationType
      ),
    [currentTemplate.intent, draftContext.locationType]
  );

  const generatedEmail = useMemo(() => {
    const toEmails = GREYSTONES_COUNCILLORS.filter((c) =>
      selectedCouncillorIds.includes(c.id)
    ).map((c) => c.email);
    const ccEmails = COUNCIL_CC_CONTACTS.filter((c) =>
      selectedCcIds.includes(c.id)
    ).map((c) => c.email);

    const topHotspot = analysis.nearBinHotspots[0]?.areaName ?? 'South Beach Promenade';

    let subject = 'Dog Fouling in Greystones — Need for Practical Solutions and Resources';
    let body = '';

    if (selectedTemplateId === 'write_your_own') {
      subject = 'Dog Fouling in Greystones Municipal District';
      const greeting = 'Dear Councillors,\n\n';
      const sign = residentSignOff
        ? `\n\nKind regards,\n${residentSignOff}`
        : '\n\nKind regards,\nA concerned Greystones resident';
      body = customEmailBody.trim()
        ? `${customEmailBody.trim()}${sign}`
        : `${greeting}\n\n${sign}`;

      if (includeLiveEvidenceStats) {
        body += `\n\n---\nVerified Communal Greystones Evidence (cleangreystones.ie):\n• Past 24 Hours (Active Window): ${weeklyEvidence.todayCount} verified drops\n• 7-Day Cumulative Record: ${weeklyEvidence.totalReports} reports across ${weeklyEvidence.distinctSubmitters} distinct resident devices\n• Direct Wheelchair/Buggy/Footwear Contaminations: ${weeklyEvidence.highImpactCount}\n• Proximity to Public Bins: ${weeklyEvidence.nearBin50mPct}% occurred within 50m of a litter bin\n• Primary Hotspot: ${weeklyEvidence.topHotspots[0]?.streetName || topHotspot}`;
      }
    } else {
      // Template 1: practical_action (Prefilled Letter)
      subject = 'Dog Fouling in Greystones — Need for Practical Solutions and Resources';
      body = `Dear Councillor,

I’m writing to express my frustration at the unacceptable amount of dog fouling in public spaces across Greystones.

It’s disgusting, unhygienic and particularly problematic for parents with buggies and wheelchair users, who regularly end up with dog waste caught in their wheels and brought into their homes. Families should be able to enjoy our local area without constantly having to watch where they step.

With reportedly only two dog wardens covering the whole of Wicklow, it’s clear that more resources and practical solutions are needed.

We would like to see Wicklow County Council take meaningful action, whether through increased enforcement, additional dog waste bins, targeted patrols or community initiatives to tackle the problem.

With the Tánaiste also living locally, I would hope this issue receives the attention it deserves.

Residents should be able to enjoy clean, safe and accessible public spaces without constantly having to dodge dog waste. We need practical solutions, not simply more warning signs.

Kind regards,

${residentSignOff || 'A concerned Greystones resident'}`;

      if (includeLiveEvidenceStats) {
        body += `\n\n---\nVerified Communal Greystones Evidence (cleangreystones.ie):\n• Past 24 Hours (Active Window): ${weeklyEvidence.todayCount} verified drops\n• 7-Day Cumulative Record: ${weeklyEvidence.totalReports} reports across ${weeklyEvidence.distinctSubmitters} distinct resident devices\n• Direct Wheelchair/Buggy/Footwear Contaminations: ${weeklyEvidence.highImpactCount}\n• Proximity to Public Bins: ${weeklyEvidence.nearBin50mPct}% occurred within 50m of a litter bin\n• Primary Hotspot: ${weeklyEvidence.topHotspots[0]?.streetName || topHotspot}`;
      }
    }

    const mailtoHref = `mailto:${toEmails.join(',')}?cc=${encodeURIComponent(
      ccEmails.join(',')
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    const gmailHref = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      toEmails.join(',')
    )}&cc=${encodeURIComponent(ccEmails.join(','))}&su=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    return {
      toEmails,
      ccEmails,
      subject,
      body,
      mailtoHref,
      gmailHref,
    };
  }, [
    selectedCouncillorIds,
    selectedCcIds,
    selectedTemplateId,
    analysis,
    weeklyEvidence,
    selectedReport,
    lastLoggedReport,
    reports,
    activeCitations,
    residentSignOff,
    submitterToken,
    includeLiveEvidenceStats,
    customEmailBody,
  ]);

  const handleCopyFullEmail = async () => {
    const fullText = `To: ${generatedEmail.toEmails.join('; ')}\nCC: ${generatedEmail.ccEmails.join(
      '; '
    )}\nSubject: ${generatedEmail.subject}\n\n${generatedEmail.body}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setEmailCopiedToast('Email copied to clipboard');
      setEmailsPreparedCount((c) => c + 1);
      recordCivicEvent('email_council_copy', {
        targetButton: 'copy',
        templateId: selectedTemplateId,
        councillorIds: selectedCouncillorIds,
      });
      setTimeout(() => setEmailCopiedToast(''), 3500);
    } catch {
      setEmailCopiedToast('Select the preview text to copy');
    }
  };

  const openHamburgerDestination = (page: HamburgerPage) => {
    setHamburgerPage(page);
    setHamburgerOpen(false);
  };

  const handleDeleteSingleReport = (reportId: string) => {
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    if (selectedReport?.id === reportId) setSelectedReport(null);
    if (lastLoggedReport?.id === reportId) setLastLoggedReport(null);
    setConfirmDeleteReportId(null);

    recordCivicEvent('report_deleted', { reportId });

    deleteReportFromCloud(reportId).catch((err) => {
      console.warn('Could not delete report from cloud:', err);
    });
  };

  const handleToggleDemoSeedsFromAdmin = () => {
    if (hasDemoSeeds) {
      handleClearSeededDemoData();
    } else {
      handleRestoreSeededDemoData();
    }
  };

  const handleClearAllBackendData = async (options: {
    clearReports: boolean;
    clearEvents: boolean;
  }) => {
    if (options.clearReports) {
      await clearAllLiveReportsFromCloud();
      setReports([]);
      setSelectedReport(null);
      setLastLoggedReport(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('clean-greystones.reports.v1');
      }
    }
    if (options.clearEvents) {
      await clearAllCivicEventsFromCloud();
      setCivicEvents([]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('clean-greystones.events.v1');
      }
    }
  };

  if (isAdminRoute) {
    return (
      <AdminBackendView
        liveReports={reports}
        civicEvents={civicEvents}
        bins={bins}
        onSaveBin={handleSaveBin}
        onDeleteBin={handleDeleteBin}
        onResetBins={handleResetBins}
        demoSeedCleared={!hasDemoSeeds}
        onToggleClearDemoSeed={handleToggleDemoSeedsFromAdmin}
        onDeleteReport={handleDeleteSingleReport}
        onClearAllBackendData={handleClearAllBackendData}
        onExitAdmin={exitAdminPortal}
      />
    );
  }

  return (
    <div className="min-h-full h-full flex flex-col bg-canvas text-ink font-sans select-none">
      {/* Compact Professional Top Header */}
      <header className="bg-white border-b border-line z-40 shrink-0">
        <div className="flex justify-between items-center w-full px-3.5 py-2.5 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setHamburgerPage('none');
                setActiveTab('map');
              }}
              className="flex items-center gap-2 text-left min-w-0"
            >
              <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-xs shrink-0">
                <span className="text-base">💩</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base sm:text-lg font-bold text-ink tracking-tight whitespace-nowrap">
                    Clean Greystones
                  </span>
                  <span className="hidden sm:inline-block bg-canvas border border-line text-muted font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0">
                    {submitterToken}
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop Navigation Links (Kept on desktop, mobile uses bottom tab bar) */}
            <nav className="hidden md:flex items-center gap-1 mr-1" aria-label="Desktop Primary Navigation">
              <button
                type="button"
                onClick={() => {
                  setHamburgerPage('none');
                  setActiveTab('map');
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  hamburgerPage === 'none' && activeTab === 'map'
                    ? 'bg-primary text-white'
                    : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                Map
              </button>
              <button
                type="button"
                onClick={() => {
                  setHamburgerPage('none');
                  setActiveTab('insights');
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  hamburgerPage === 'none' && activeTab === 'insights'
                    ? 'bg-primary text-white'
                    : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                Insights
              </button>
              <button
                type="button"
                onClick={() => {
                  setHamburgerPage('none');
                  setActiveTab('council');
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  hamburgerPage === 'none' && activeTab === 'council'
                    ? 'bg-primary text-white'
                    : 'text-muted hover:bg-canvas hover:text-ink'
                }`}
              >
                Email Council
              </button>
            </nav>

            {/* Live Count Pill (Crowdsourced Communal Cloud) */}
            <button
              type="button"
              onClick={() => {
                setHamburgerPage('none');
                setActiveTab('insights');
              }}
              className="flex items-center gap-1.5 bg-canvas hover:bg-surface-container px-2.5 py-1.5 rounded-full border border-line text-xs font-semibold text-ink transition-colors whitespace-nowrap shrink-0"
              title={isCloudSyncing ? 'Syncing with communal backend...' : 'Crowdsourced live data synced with communal cloud'}
            >
              <span className={`w-2 h-2 rounded-full ${isCloudSyncing ? 'bg-amber-500 animate-pulse' : 'bg-primary'}`} />
              {analysis.totalActiveReports > 0 ? (
                <>
                  <span>{analysis.totalActiveReports} live</span>
                  <span className="text-muted hidden sm:inline">
                    ({analysis.nearBin50mPct}% ≤50m bin)
                  </span>
                </>
              ) : (
                <span className="text-muted font-medium">Live Map</span>
              )}
            </button>

            {/* PWA Direct Install Header Button (Desktop/Tablet only; hidden on narrow mobile to prevent crowding) */}
            {!isStandalone && Boolean(deferredPrompt) && !hasDismissedInstall && (
              <button
                type="button"
                onClick={handlePromptInstall}
                aria-label="Install Clean Greystones App"
                className="hidden sm:flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-2.5 py-1.5 rounded-full text-xs font-semibold shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">install_mobile</span>
                <span>Install</span>
              </button>
            )}

            {/* Hamburger Menu Button for Background Info */}
            <button
              type="button"
              onClick={() => setHamburgerOpen((v) => !v)}
              aria-label="Open background information menu"
              className="w-10 h-10 min-w-[40px] rounded-xl border border-line bg-white hover:bg-canvas flex items-center justify-center text-ink active:scale-95 transition-transform shrink-0"
            >
              <span className="material-symbols-outlined text-[20px]">
                {hamburgerOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ==================== HAMBURGER SLIDE-OVER MENU ==================== */}
      {hamburgerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-white h-full shadow-2xl border-l border-line flex flex-col justify-between p-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <p className="font-display text-sm font-bold text-ink">
                    Background & Reference
                  </p>
                  <p className="text-xs text-muted">
                    Bins data, Irish law & council records
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setHamburgerOpen(false)}
                  aria-label="Close menu"
                  className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg hover:bg-canvas flex items-center justify-center text-muted transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Anonymous Submitter Verification Card */}
              <div className="p-3 rounded-xl bg-canvas border border-line space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Anonymous Submitter ID
                  </span>
                  <span className="text-[10px] font-bold text-primary bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                    No Login / No PII
                  </span>
                </div>
                <p className="font-mono text-xs font-bold text-ink">{submitterToken}</p>
                <p className="text-[11px] text-muted leading-snug">
                  Cryptographic checksum proves to the council that reports come from distinct real devices without collecting your name or email.
                </p>
              </div>

              {/* Communal Cloud Sync Card */}
              <div className="p-3 rounded-xl bg-canvas border border-line space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Crowdsourced Cloud Sync
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live Backend
                  </span>
                </div>
                <p className="text-[11px] text-muted leading-snug">
                  All observations are synced in real time with the communal database so every resident and browser sees the live town-wide map.
                </p>
              </div>

              {/* PWA Home Screen Installation Card */}
              {!isStandalone && (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                  <div className="flex items-center gap-1.5 text-primary font-bold text-xs">
                    <span className="material-symbols-outlined text-base">download_for_offline</span>
                    <span>Install on Your Device</span>
                  </div>
                  <p className="text-[11px] text-muted leading-snug">
                    Save to your home screen for quick offline access and 1-tap logging during walks.
                  </p>
                  <button
                    type="button"
                    onClick={handlePromptInstall}
                    className="w-full py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  >
                    <span className="material-symbols-outlined text-sm">install_mobile</span>
                    <span>Install Clean Greystones</span>
                  </button>
                </div>
              )}

              {/* Background Pages Navigation */}
              <nav className="space-y-1.5">
                {/* 7-Day Weekly Area Report */}
                <button
                  type="button"
                  onClick={() => openHamburgerDestination('weekly_report')}
                  className="w-full p-3 rounded-xl border border-line hover:border-primary bg-white hover:bg-canvas text-left flex items-start gap-3 transition-colors"
                >
                  <span className="material-symbols-outlined text-primary mt-0.5">
                    calendar_month
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-ink">
                        Weekly Area Report (7-Day Map)
                      </p>
                      <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {weeklyEvidence.totalReports} drops
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      Full 7-day cumulative fouling breakdown, hotspots, and map view
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openHamburgerDestination('bins_stats')}
                  className="w-full p-3 rounded-xl border border-line hover:border-primary bg-white hover:bg-canvas text-left flex items-start gap-3 transition-colors"
                >
                  <span className="material-symbols-outlined text-primary mt-0.5">
                    delete_outline
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Public Bins & Spatial Audit
                    </p>
                    <p className="text-xs text-muted">
                      16 OSM litter bins, background distance engine & map overlay toggle
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openHamburgerDestination('legal_bylaws')}
                  className="w-full p-3 rounded-xl border border-line hover:border-primary bg-white hover:bg-canvas text-left flex items-start gap-3 transition-colors"
                >
                  <span className="material-symbols-outlined text-primary mt-0.5">gavel</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Irish Law, €250 Fine & Bye-Laws
                    </p>
                    <p className="text-xs text-muted">
                      Verified Litter Pollution Act 1997 s.22 & Wicklow Litter Plan 2026–2029
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openHamburgerDestination('watchdog')}
                  className="w-full p-3 rounded-xl border border-line hover:border-primary bg-white hover:bg-canvas text-left flex items-start gap-3 transition-colors"
                >
                  <span className="material-symbols-outlined text-primary mt-0.5">
                    record_voice_over
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Council Minutes & Policy Watchdog
                    </p>
                    <p className="text-xs text-muted">
                      Greystones MD councillor motions & executive responses
                    </p>
                  </div>
                </button>

                {/* FIX-3: Organiser Builder Tools (Gated behind organiser passcode) */}
                {isAdminAuthenticated && (
                  <>
                    <button
                      type="button"
                      onClick={() => openHamburgerDestination('data_admin')}
                      className="w-full p-3 rounded-xl border border-line hover:border-primary bg-white hover:bg-canvas text-left flex items-start gap-3 transition-colors"
                    >
                      <span className="material-symbols-outlined text-primary mt-0.5">
                        database
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          Demo Seed Data vs. Prod Clean Slate
                        </p>
                        <p className="text-xs text-muted">
                          Clear pre-seeded demo pins for production or export GeoJSON/CSV
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={enterAdminPortal}
                      className="w-full p-3 rounded-xl border border-line hover:border-primary bg-canvas hover:bg-white text-left flex items-start gap-3 transition-colors"
                    >
                      <span className="material-symbols-outlined text-ink mt-0.5">
                        lock
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-ink">
                            Common Civic Admin Backend
                          </p>
                          <span className="text-[10px] font-mono bg-ink text-white px-1.5 py-0.2 rounded">
                            /admin
                          </span>
                        </div>
                        <p className="text-xs text-muted">
                          Unified organiser portal filtered by app (Fouling, Roads, or All)
                        </p>
                      </div>
                    </button>
                  </>
                )}

                {/* BUG-5: Share Clean Greystones */}
                <button
                  type="button"
                  onClick={handleShareApp}
                  className="w-full p-3 rounded-xl border border-line hover:border-primary bg-white hover:bg-canvas text-left flex items-start gap-3 transition-colors"
                >
                  <span className="material-symbols-outlined text-primary mt-0.5">share</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Share Clean Greystones
                    </p>
                    <p className="text-xs text-muted">
                      Share cleangreystones.ie with neighbours, dog owners, and resident associations
                    </p>
                  </div>
                </button>
              </nav>
            </div>

            <div className="pt-4 border-t border-line text-xs text-muted flex items-center justify-between">
              <span>Wicklow Litter Line: 1800 365 123</span>
              <button
                type="button"
                onClick={() => {
                  setHamburgerPage('none');
                  setHamburgerOpen(false);
                }}
                className="font-semibold text-primary underline"
              >
                Back to Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== SECONDARY HAMBURGER PAGES ==================== */}
      {hamburgerPage !== 'none' && (
        <main className="flex-1 overflow-y-auto max-w-screen-md w-full mx-auto px-4 pt-4 pb-28 space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <button
              type="button"
              onClick={() => setHamburgerPage('none')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              <span>Back to Map</span>
            </button>
            <button
              type="button"
              onClick={() => setHamburgerOpen(true)}
              className="text-xs font-semibold text-muted hover:text-ink"
            >
              More Info Pages ☰
            </button>
          </div>

          {/* PAGE A: PUBLIC BINS & SPATIAL AUDIT */}
          {hamburgerPage === 'bins_stats' && (
            <div className="space-y-4">
              <div className="bg-white border border-line rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-ink">
                      Public Bin Layer & Background Proximity Engine
                    </h2>
                    <p className="text-xs text-muted">
                      Bins run silently in the background on every report so the map stays clean, while automatically calculating exact distance to the nearest bin.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBinOverlayOnMap((v) => !v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      showBinOverlayOnMap
                        ? 'bg-primary text-white border-primary'
                        : 'bg-canvas text-ink border-line'
                    }`}
                  >
                    {showBinOverlayOnMap ? '🗑️ Map Bin Icons: Shown' : '🗑️ Show Bin Icons on Map'}
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-canvas border border-line text-xs text-muted space-y-1">
                  <p className="font-semibold text-ink">
                    OpenStreetMap Snapshot (`osm_bins_2026-10-16.geojson`):
                  </p>
                  <p>
                    16 `amenity=waste_basket` public litter bins are clustered along South Beach Promenade, Church Road, and the Harbour. Recycling bring-banks are excluded from distance calculations.
                  </p>
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-line border border-line rounded-xl">
                  {bins
                    .filter((b) => b.kind !== 'recycling')
                    .map((bin) => (
                      <div
                        key={bin.id}
                        className="p-3 flex items-center justify-between gap-2 bg-white"
                      >
                        <div>
                          <p className="text-xs font-semibold text-ink">
                            {bin.code} — {bin.locationName}
                          </p>
                          <p className="text-[11px] text-muted">
                            {bin.lat.toFixed(4)}° N, {Math.abs(bin.lng).toFixed(4)}° W •{' '}
                            {bin.osmId}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-canvas border border-line text-muted uppercase">
                          {bin.status}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* PAGE B: LEGAL INFO & BYE-LAWS */}
          {hamburgerPage === 'legal_bylaws' && (
            <div className="space-y-4">
              <div className="bg-white border border-line rounded-2xl p-4 space-y-3">
                <h2 className="font-display text-lg font-bold text-ink">
                  Irish Dog Fouling Law & Wicklow Policy Citations
                </h2>
                <p className="text-xs text-muted">
                  Every citation below has been verified against the Irish Statute Book, gov.ie, and Wicklow County Council's Litter Management Plan 2026–2029.
                </p>

                <div className="space-y-3">
                  {VERIFIED_CITATIONS.filter((c) => c.status === 'verified').map((cit) => (
                    <article
                      key={cit.id}
                      className="p-3.5 rounded-xl bg-canvas border border-line space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-primary">{cit.code}</span>
                        <span className="text-[10px] font-semibold bg-white border border-line px-2 py-0.5 rounded-full text-muted">
                          Verified {cit.verifiedAt}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-ink">{cit.title}</h3>
                      <p className="text-xs text-muted italic leading-relaxed">“{cit.quote}”</p>
                      <a
                        href={cit.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-xs font-semibold text-primary hover:underline pt-1"
                      >
                        Read Official Source →
                      </a>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PAGE C: COUNCIL MINUTES & WATCHDOG */}
          {hamburgerPage === 'watchdog' && (
            <div className="space-y-4">
              <div className="bg-white border border-line rounded-2xl p-4 space-y-3">
                <h2 className="font-display text-lg font-bold text-ink">
                  Greystones MD Councillor Activity & Policy Watchdog
                </h2>
                <p className="text-xs text-muted">
                  Public record of motions, enforcement stats, and council commitments.
                </p>
                <div className="space-y-3">
                  {HANSARD_RECORDS.map((rec) => (
                    <article
                      key={rec.id}
                      className="p-3.5 rounded-xl bg-canvas border border-line space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">
                          {rec.body} · {rec.date}
                        </span>
                        <span className="font-semibold text-primary">
                          {rec.statusEmoji} {rec.statusLabel}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-ink">{rec.title}</h3>
                      <p className="text-xs text-muted">{rec.summary}</p>
                      <blockquote className="p-2.5 rounded-lg bg-white border-l-4 border-primary text-xs text-ink italic">
                        “{rec.quoteText}”
                      </blockquote>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* PAGE D: DEMO SEED DATA VS PROD CLEAN SLATE */}
          {hamburgerPage === 'data_admin' && (
            <div className="space-y-4">
              <div className="bg-white border border-line rounded-2xl p-4 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-ink">
                    Demo Pre-Seeded Data & Production Clean Slate
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    The app ships with 15 realistic Greystones reports pre-seeded so you can demonstrate hotspots and bin-proximity insights immediately. As you move to production, clear the demo seeds below so only live resident drops are counted.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Current Dataset: {reports.length} Total Reports
                    </p>
                    <p className="text-xs text-muted">
                      {reports.filter((r) => r.isSeededDemo).length} pre-seeded demo pins •{' '}
                      {reports.filter((r) => !r.isSeededDemo).length} logged on this device
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {hasDemoSeeds ? (
                      <button
                        type="button"
                        onClick={handleClearSeededDemoData}
                        className="px-3.5 py-2 rounded-xl bg-error text-white text-xs font-semibold shadow-xs hover:opacity-95"
                      >
                        Clear Demo Seeds for Production
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRestoreSeededDemoData}
                        className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-xs hover:opacity-95"
                      >
                        Restore 15 Demo Seeds
                      </button>
                    )}
                    {reports.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllReports}
                        className="px-3.5 py-2 rounded-xl border border-line bg-canvas hover:bg-surface-container text-xs font-semibold text-ink"
                      >
                        Clear All ({reports.length})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PAGE E: WEEKLY AREA REPORT & 7-DAY EVIDENCE */}
          {hamburgerPage === 'weekly_report' && (
            <div className="space-y-4">
              <div className="bg-white border border-line rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h2 className="font-display text-lg font-bold text-ink">
                      Greystones 7-Day Cumulative Fouling Report
                    </h2>
                    <p className="text-xs text-muted">
                      Snapshot of all verified dog fouling observations logged across Greystones over the past 7 days.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMapTimeRange('week');
                      setHamburgerPage('none');
                      setActiveTab('map');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-primary text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 hover:opacity-95"
                  >
                    <span className="material-symbols-outlined text-sm">map</span>
                    <span>View 7-Day Map</span>
                  </button>
                </div>

                {/* Scorecards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-canvas border border-line text-center">
                    <p className="text-xs text-muted font-medium">7-Day Total</p>
                    <p className="text-xl font-bold text-ink mt-0.5">{weeklyEvidence.totalReports}</p>
                    <p className="text-[10px] text-muted">verified drops</p>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line text-center">
                    <p className="text-xs text-muted font-medium">Past 24 Hours</p>
                    <p className="text-xl font-bold text-primary mt-0.5">{weeklyEvidence.todayCount}</p>
                    <p className="text-[10px] text-muted">active today</p>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line text-center">
                    <p className="text-xs text-muted font-medium">Near Bins (≤50m)</p>
                    <p className="text-xl font-bold text-ink mt-0.5">{weeklyEvidence.nearBin50mPct}%</p>
                    <p className="text-[10px] text-muted">beside public bins</p>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line text-center">
                    <p className="text-xs text-muted font-medium">Active Devices</p>
                    <p className="text-xl font-bold text-ink mt-0.5">{weeklyEvidence.distinctSubmitters}</p>
                    <p className="text-[10px] text-muted">unique resident tokens</p>
                  </div>
                </div>

                {/* Top Hotspots */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Top 5 Hotspot Streets This Week
                  </h3>
                  <div className="divide-y divide-line border border-line rounded-xl overflow-hidden">
                    {weeklyEvidence.topHotspots.map((h, i) => (
                      <div key={h.streetName} className="p-2.5 bg-white flex items-center justify-between text-xs">
                        <span className="font-semibold text-ink">
                          {i + 1}. {h.streetName}
                        </span>
                        <span className="font-bold text-error bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-[11px]">
                          {h.count} incidents
                        </span>
                      </div>
                    ))}
                    {weeklyEvidence.topHotspots.length === 0 && (
                      <div className="p-3 text-xs text-muted text-center bg-white">
                        No reports logged in the past 7 days.
                      </div>
                    )}
                  </div>
                </div>

                {/* Day-by-day Breakdown */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
                    Day-by-Day Activity
                  </h3>
                  <div className="grid grid-cols-7 gap-1.5 text-center">
                    {weeklyEvidence.dailyBreakdown.map((d) => (
                      <div key={d.date} className="p-2 rounded-lg bg-canvas border border-line text-xs">
                        <p className="text-[11px] font-semibold text-muted">{d.dayLabel}</p>
                        <p className="text-base font-bold text-ink mt-0.5">{d.count}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setMapTimeRange('week');
                      setHamburgerPage('none');
                      setActiveTab('map');
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-xs hover:opacity-95 text-center"
                  >
                    Open 7-Day Cumulative Map
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHamburgerPage('none');
                      setActiveTab('council');
                    }}
                    className="px-4 py-2.5 rounded-xl border border-line bg-canvas hover:bg-surface-container text-xs font-semibold text-ink"
                  >
                    Email Council with This Evidence
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ==================== MAIN 3-TAB MOBILE WORKFLOW ==================== */}
      {hamburgerPage === 'none' && (
        <>
          {/* TAB 1: MAP IS THE HERO (Quick 1-Tap to Mark + Optional Extra Detail Step) */}
          {activeTab === 'map' && (
            <div
              className="flex-1 flex flex-col overflow-hidden relative"
              data-agent-surface="map"
              data-agent-state={agentMapState}
            >
              {/* 7-Day Cumulative Map Mode Banner */}
              {mapTimeRange === 'week' && (
                <div className="bg-primary text-white px-3 py-1.5 z-20 flex items-center justify-between text-xs shadow-xs">
                  <span className="flex items-center gap-1.5 font-medium truncate">
                    <span className="material-symbols-outlined text-[15px]">calendar_month</span>
                    <span>7-Day Cumulative Map ({visibleReports.length} drops across Greystones)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setMapTimeRange('today')}
                    className="shrink-0 bg-white/20 hover:bg-white/30 text-white font-bold text-[10px] px-2 py-0.5 rounded-full transition-colors"
                  >
                    Switch to Today (24h)
                  </button>
                </div>
              )}

              {/* Clean Slim Filter Bar (Only shown when live reports exist per BUG-2) */}
              {reports.length > 0 && (
                <section className="bg-white/95 backdrop-blur-sm px-3 py-1.5 z-20 border-b border-line flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      type="button"
                      onClick={() => setMapFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                        mapFilter === 'all'
                          ? 'bg-ink text-white'
                          : 'bg-canvas text-muted border border-line'
                      }`}
                    >
                      All ({analysis.totalActiveReports})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapFilter('near_bins')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                        mapFilter === 'near_bins'
                          ? 'bg-primary text-white'
                          : 'bg-canvas text-muted border border-line'
                      }`}
                    >
                      ≤25m from Bin ({analysis.nearBin15mCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapFilter('wheels')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                        mapFilter === 'wheels'
                          ? 'bg-error text-white'
                          : 'bg-canvas text-muted border border-line'
                      }`}
                    >
                      ♿ 👶 Wheels (
                      {analysis.bySeverity.buggy_wheels.count +
                        analysis.bySeverity.wheelchair_wheels.count}
                      )
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapFilter('stepped_in')}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                        mapFilter === 'stepped_in'
                          ? 'bg-error text-white'
                          : 'bg-canvas text-muted border border-line'
                      }`}
                    >
                      👟 Stepped In ({analysis.bySeverity.stepped_in.count})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapTimeRange((prev) => (prev === 'today' ? 'week' : 'today'))}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors flex items-center gap-1 ${
                        mapTimeRange === 'week'
                          ? 'bg-primary text-white'
                          : 'bg-canvas text-ink border border-line'
                      }`}
                      title={mapTimeRange === 'week' ? 'Switch to clean 24-hour daily map' : 'View all reports from the past 7 days'}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {mapTimeRange === 'week' ? 'calendar_month' : 'schedule'}
                      </span>
                      <span>{mapTimeRange === 'week' ? '7-Day View' : 'Today (24h)'}</span>
                    </button>
                  </div>
                </section>
              )}

              {/* Map Viewport */}
              <div className="relative flex-1 flex flex-col overflow-hidden">
                <GreystonesMapView
                  reports={visibleReports}
                  bins={bins}
                  activeFilter={mapFilter}
                  showBinOverlay={showBinOverlayOnMap}
                  selectedReport={selectedReport}
                  onSelectReport={setSelectedReport}
                  draftCoords={draftCoords}
                  onMapClickDropPin={handleMapClickDropPin}
                  quickSeverity={selectedSeverity}
                  userLocation={userLocation}
                  isLocating={isLocating}
                  onRequestLocation={requestUserLocation}
                />

                {/* Optional Location Notice Toast */}
                {locationNotice && (
                  <div className="absolute top-3 left-3 right-3 max-w-sm mx-auto z-30 pointer-events-auto">
                    <div className="bg-white/95 backdrop-blur-md border border-amber-300 rounded-xl px-3 py-2 shadow-sm flex items-center justify-between gap-2 text-ink text-xs">
                      <span className="flex items-center gap-1.5">
                        <span>📍</span>
                        <span>{locationNotice}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setLocationNotice(null)}
                        className="text-muted hover:text-ink font-bold px-1.5 py-0.5 rounded"
                        aria-label="Dismiss notice"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Corroboration Notice Toast */}
                {corroborationNotice && (
                  <div className="absolute top-14 left-3 right-3 max-w-sm mx-auto z-30 pointer-events-auto">
                    <div className="bg-white/95 backdrop-blur-md border border-primary rounded-xl px-3 py-2 shadow-lg flex items-center justify-between gap-2 text-ink text-xs">
                      <span className="flex items-center gap-1.5 font-medium text-primary">
                        <span>✨</span>
                        <span>{corroborationNotice}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setCorroborationNotice(null)}
                        className="text-muted hover:text-ink font-bold px-1.5 py-0.5 rounded"
                        aria-label="Dismiss notice"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Clean Slate Live Mode Prompt when no reports logged yet (per BUG-3: dismissible + once per session) */}
                {reports.length === 0 && !liveBannerDismissed && (
                  <div className="absolute top-3 left-3 right-3 max-w-sm mx-auto z-30 pointer-events-auto">
                    <div className="bg-white/95 backdrop-blur-md border border-primary/30 rounded-2xl p-3 shadow-lg flex items-center justify-between gap-2.5 text-ink">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xl shrink-0">📍</span>
                        <div className="text-xs min-w-0">
                          <p className="font-bold text-primary">Live Mode Active · Clean Slate</p>
                          <p className="text-muted text-[11px]">
                            Tap anywhere on the Greystones map to log your first live observation.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={dismissLiveBanner}
                        aria-label="Dismiss banner"
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full text-muted hover:text-ink hover:bg-canvas transition-colors shrink-0 flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Compact Non-Obscuring Single-Line Pill when an Existing Pin is Tapped */}
                {selectedReport && !lastLoggedReport && (
                  <div className="absolute bottom-36 left-3 right-3 max-w-md mx-auto z-30 pointer-events-auto">
                    <div className="bg-white/95 backdrop-blur-md border border-line rounded-2xl px-3.5 py-2.5 shadow-lg flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl shrink-0">
                          {SEVERITY_META[selectedReport.severity].emoji}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-ink truncate">
                            {selectedReport.streetName}
                          </p>
                          <p className="text-[11px] text-muted truncate">
                            <strong>{selectedReport.dBinAllM}m</strong> from{' '}
                            {selectedReport.nearestBinCode} • ID {selectedReport.submitterToken.slice(-4)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {confirmDeleteReportId === selectedReport.id ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded-xl border border-red-200">
                            <span className="text-[10px] font-bold text-error">Delete?</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingleReport(selectedReport.id)}
                              className="px-2 py-1 rounded-lg bg-error text-white text-xs font-bold hover:bg-error/90 transition-colors"
                            >
                              Yes, Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteReportId(null)}
                              className="px-1.5 py-1 rounded-lg bg-white text-muted text-xs font-medium hover:text-ink transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleConfirmExistingReport(selectedReport.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-canvas hover:bg-surface-container border border-line text-xs font-semibold text-ink transition-colors"
                              title="Confirm you also saw this"
                            >
                              👍 +1 ({selectedReport.confirmations})
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteReportId(selectedReport.id)}
                              className="px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-error border border-red-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                              title="Delete accidental report"
                              aria-label="Delete report"
                            >
                              <span className="material-symbols-outlined text-[15px]">delete</span>
                              <span>Delete</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedReport(null);
                                setConfirmDeleteReportId(null);
                              }}
                              className="p-1 text-muted hover:text-ink text-xs"
                              aria-label="Dismiss pin summary"
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Post-Tap Confirmation & Optional Extra Step ("+ Add details / photo") */}
                {lastLoggedReport && (
                  <div className="absolute bottom-36 left-3 right-3 max-w-md mx-auto z-30 pointer-events-auto">
                    <div className="bg-white border-2 border-primary rounded-2xl px-3.5 py-2.5 shadow-lg flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-primary flex items-center gap-1">
                          <span>✓ On Record ({lastLoggedReport.dBinAllM}m from bin)</span>
                        </p>
                        <p className="text-[11px] text-muted truncate">
                          {lastLoggedReport.streetName}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setExpandOptionalReportModal(true)}
                          className="px-2.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold"
                        >
                          + Add details / photo
                        </button>
                        <button
                          type="button"
                          onClick={handleUndoLastDrop}
                          className="px-2 py-1.5 text-xs font-semibold text-muted hover:text-ink underline"
                        >
                          Undo
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bottom Hero Control Dock: Single Primary Log Action (per BUG-1 & BUG-6) */}
                <div className="z-30 bg-white border-t border-line px-3 pt-2.5 pb-16 shrink-0">
                  <div className="max-w-md mx-auto">
                    <button
                      type="button"
                      data-agent-action="log-observation"
                      onClick={() => setIsTypeChooserOpen(true)}
                      aria-label="Log dog fouling observation"
                      className="w-full h-12 bg-primary hover:bg-primary-container text-white rounded-2xl font-display text-sm font-bold shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                    >
                      <span className="text-lg">💩</span>
                      <span>Log Dog Fouling</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* BUG-1, FIX-1, FIX-2, FIX-5: Type Chooser Bottom Sheet / Modal (One Type Decision per Log) */}
              {isTypeChooserOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Choose fouling impact"
                  data-agent-surface="type-sheet"
                  className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-xs p-0 sm:p-4"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setIsTypeChooserOpen(false);
                  }}
                >
                  <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-line shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          Log Observation
                        </span>
                        <h3 className="font-display text-base font-bold text-ink">
                          What did you spot?
                        </h3>
                        {/* FIX-2: Explicit pin-relative position and distance to bin */}
                        <p className="text-xs text-muted truncate" title={`At the pin · ${draftContext.streetName} · ${draftContext.dBinAllM}m from ${draftContext.nearestAll.code}`}>
                          At the pin · {draftContext.streetName} · {draftContext.dBinAllM}m from {draftContext.nearestAll.code}
                        </p>
                        {/* FIX-2: Hint for relocating pin */}
                        <p className="text-[11px] text-muted mt-0.5 leading-snug">
                          Wrong spot? Close this and tap the map to move the pin.
                        </p>
                      </div>
                      {/* FIX-1 & FIX-5: 44px tap target, shrink-0, icon stays centered */}
                      <button
                        type="button"
                        onClick={() => setIsTypeChooserOpen(false)}
                        aria-label="Close type selection"
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg hover:bg-canvas text-muted flex items-center justify-center transition-colors shrink-0"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(Object.keys(SEVERITY_META) as SeverityType[]).map((sevKey) => {
                        const meta = SEVERITY_META[sevKey];
                        return (
                          <button
                            key={sevKey}
                            type="button"
                            data-agent-action="select-type"
                            data-agent-value={sevKey}
                            onClick={() => handleSelectSeverityAndLog(sevKey)}
                            aria-label={`Log ${meta.label}: ${meta.subtext}`}
                            className="w-full p-3.5 rounded-2xl border border-line hover:border-primary bg-canvas hover:bg-white text-left flex items-start gap-3.5 transition-all active:scale-[0.99]"
                          >
                            <span className="text-2xl mt-0.5 select-none">{meta.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-ink">{meta.label}</p>
                              <p className="text-xs text-muted leading-snug">{meta.subtext}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* OPTIONAL EXTRA STEP MODAL: Add Photo & Note after 1-Tap Drop */}
              {expandOptionalReportModal && lastLoggedReport && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-xs p-0 sm:p-4">
                  <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-line shadow-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          Optional Extra Details
                        </span>
                        <h3 className="font-display text-base font-bold text-ink">
                          Add Photo or Note to Pin #{lastLoggedReport.id.replace('rep-', '')}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandOptionalReportModal(false)}
                        className="w-8 h-8 rounded-lg hover:bg-canvas text-muted"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleSaveOptionalDetails} className="space-y-3.5">
                      <div className="p-3 rounded-xl bg-canvas border border-line text-xs space-y-0.5">
                        <p className="font-semibold text-ink">{lastLoggedReport.streetName}</p>
                        <p className="text-muted">
                          Auto-calculated: <strong>{lastLoggedReport.dBinAllM}m</strong> from{' '}
                          {lastLoggedReport.nearestBinCode} • Token:{' '}
                          <span className="font-mono">{lastLoggedReport.submitterToken}</span>
                        </p>
                      </div>

                      {/* Photo attachment */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-ink">
                          Photo Evidence (Optional — ground only, no faces or reg plates)
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoFileChange}
                          className="hidden"
                        />
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3.5 py-2 rounded-xl border border-line bg-canvas hover:bg-surface-container text-xs font-semibold text-ink flex items-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-base text-primary">
                              add_a_photo
                            </span>
                            <span>{optionalPhotoPreview ? 'Change Photo' : 'Attach Photo'}</span>
                          </button>
                          {optionalPhotoPreview && (
                            <img
                              src={optionalPhotoPreview}
                              alt="Attached fouling evidence preview"
                              className="w-12 h-12 rounded-lg object-cover border border-line"
                            />
                          )}
                        </div>
                      </div>

                      {/* Optional Note */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="opt-note"
                            className="text-xs font-semibold text-ink"
                          >
                            Short Note (Optional, max 140 chars)
                          </label>
                          <span className="text-[11px] text-muted">{optionalNote.length}/140</span>
                        </div>
                        <textarea
                          id="opt-note"
                          rows={2}
                          maxLength={140}
                          value={optionalNote}
                          onChange={(e) => setOptionalNote(e.target.value)}
                          placeholder="e.g., Right on the buggy ramp beside the bin..."
                          className="w-full rounded-xl border border-line px-3 py-2 text-xs text-ink"
                        />
                      </div>

                      {noteWarnings.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-error-container text-on-error-container text-xs font-semibold">
                          {noteWarnings.map((w, i) => (
                            <p key={i}>⚠️ {w}</p>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          className="flex-1 py-2.5 bg-primary text-white rounded-xl text-xs font-bold"
                        >
                          Save Details
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandOptionalReportModal(false)}
                          className="px-4 py-2.5 bg-canvas text-muted rounded-xl text-xs font-semibold"
                        >
                          Skip
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INSIGHTS & EVIDENCE SCORECARD */}
          {activeTab === 'insights' && (
            <main className="flex-1 overflow-y-auto max-w-screen-md w-full mx-auto px-4 pt-4 pb-24 space-y-4">
              {/* Clean 3-Card Bento Summary */}
              <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <article className="bg-white border border-line rounded-2xl p-4 shadow-xs">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Mapped Incidents
                  </span>
                  <h2 className="font-display text-3xl font-bold text-ink mt-1">
                    {analysis.totalActiveReports}
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    Logged across <strong>{analysis.distinctSubmitters}</strong> unique anonymous tokens
                  </p>
                </article>

                <article className="bg-white border-2 border-primary/30 rounded-2xl p-4 shadow-xs">
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                    Beside Public Bins
                  </span>
                  <h2 className="font-display text-3xl font-bold text-primary mt-1">
                    {analysis.nearBin50mPct}%
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    <strong>{analysis.nearBin15mCount}</strong> within 15m of a bin — disproves "long walk to bin" excuse
                  </p>
                </article>

                <article className="bg-white border border-line rounded-2xl p-4 shadow-xs">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                    Wheels & Footwear
                  </span>
                  <h2 className="font-display text-3xl font-bold text-error mt-1">
                    {analysis.highImpactCount}
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    ♿ Wheelchair, 👶 Buggy & 👟 Stepped-In hits ({analysis.highImpactPct}%)
                  </p>
                </article>
              </section>

              {/* Impact Breakdown */}
              <section className="bg-white border border-line rounded-2xl p-4 shadow-xs space-y-3">
                <h3 className="font-display text-sm font-bold text-ink">
                  Breakdown by Impact Type
                </h3>
                <div className="space-y-2.5">
                  {(Object.keys(SEVERITY_META) as SeverityType[]).map((sevKey) => {
                    const meta = SEVERITY_META[sevKey];
                    const stat = analysis.bySeverity[sevKey];
                    return (
                      <div key={sevKey} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-ink">
                            {meta.emoji} {meta.label}
                          </span>
                          <span className="text-muted font-medium">
                            {stat.count} ({stat.pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full bg-canvas rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              meta.isHighImpact ? 'bg-error' : 'bg-primary'
                            }`}
                            style={{ width: `${Math.max(stat.pct, 3)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Dual Hotspot Lists */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white border border-line rounded-2xl p-4 space-y-2.5">
                  <span className="text-[11px] font-bold text-error uppercase tracking-wider">
                    Hotspots Right Beside Bins (≤50m)
                  </span>
                  <div className="space-y-1.5">
                    {analysis.nearBinHotspots.map((h) => (
                      <div
                        key={h.areaName}
                        className="p-2.5 rounded-xl bg-canvas flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-ink">{h.areaName}</p>
                          <p className="text-[11px] text-muted">
                            Closest: {h.minBinDistM}m from {h.nearestBinCode}
                          </p>
                        </div>
                        <span className="font-bold text-ink">{h.count} reports</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-line rounded-2xl p-4 space-y-2.5">
                  <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                    Outer Walks With No Bins (&gt;200m)
                  </span>
                  <div className="space-y-1.5">
                    {analysis.farFromBinHotspots.map((h) => (
                      <div
                        key={h.areaName}
                        className="p-2.5 rounded-xl bg-canvas flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-ink">{h.areaName}</p>
                          <p className="text-[11px] text-muted">
                            Nearest bin: {h.minBinDistM}m away
                          </p>
                        </div>
                        <span className="font-bold text-ink">{h.count} reports</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <button
                type="button"
                onClick={() => setActiveTab('council')}
                className="w-full py-3.5 bg-primary text-white rounded-2xl font-display text-sm font-bold shadow-xs"
              >
                Send This Evidence to Greystones Councillors →
              </button>
            </main>
          )}

          {/* TAB 3: EMAIL COUNCIL (30-Second Templated Action) */}
          {activeTab === 'council' && (
            <main className="flex-1 overflow-y-auto max-w-screen-md w-full mx-auto px-4 pt-4 pb-24 space-y-4">
              <section className="bg-white border border-line rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Greystones Municipal District ({emailsPreparedCount} emails prepared)
                  </span>
                  <h2 className="font-display text-xl font-bold text-ink mt-0.5">
                    Email the 6 Local Councillors
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    Pre-populated with live map numbers, background bin-distance calculations, and verified Irish law. Opens in your own email app.
                  </p>
                </div>

                {/* Communal Backend Evidence Sync Status */}
                <div className="p-3 rounded-xl bg-canvas border border-line flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs">
                    <p className="font-semibold text-ink flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                      <span>Verified Communal Evidence (7-Day Record)</span>
                    </p>
                    <p className="text-[11px] text-muted">
                      {weeklyEvidence.totalReports} total reports across {weeklyEvidence.distinctSubmitters} devices ({weeklyEvidence.todayCount} active past 24h)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRefreshBackendEvidence}
                    disabled={isFetchingBackendEvidence}
                    className="px-2.5 py-1.5 rounded-lg border border-line bg-white hover:bg-canvas text-xs font-semibold text-ink flex items-center gap-1.5 transition-colors"
                  >
                    <span
                      className={`material-symbols-outlined text-sm ${
                        isFetchingBackendEvidence ? 'animate-spin' : ''
                      }`}
                    >
                      sync
                    </span>
                    <span>{isFetchingBackendEvidence ? 'Fetching...' : 'Fetch Latest Evidence'}</span>
                  </button>
                </div>
                {backendRefreshNotice && (
                  <p className="text-xs font-semibold text-primary">{backendRefreshNotice}</p>
                )}

                {/* 1. Template Choice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink">1. Email Option</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {EMAIL_TEMPLATES.map((tpl) => {
                      const active = selectedTemplateId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => setSelectedTemplateId(tpl.id)}
                          className={`p-3 rounded-xl text-left border transition-colors ${
                            active
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-line bg-white hover:bg-canvas'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-ink">{tpl.label}</p>
                            {active && <span className="text-primary text-xs font-bold">✓</span>}
                          </div>
                          <p className="text-[11px] text-muted mt-1 leading-relaxed">{tpl.shortDesc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Councillors */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-ink">
                      2. Greystones Councillors ({selectedCouncillorIds.length} of 6)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCouncillorIds(
                          selectedCouncillorIds.length === GREYSTONES_COUNCILLORS.length
                            ? []
                            : GREYSTONES_COUNCILLORS.map((c) => c.id)
                        )
                      }
                      className="text-xs font-semibold text-primary underline"
                    >
                      {selectedCouncillorIds.length === GREYSTONES_COUNCILLORS.length
                        ? 'Deselect all'
                        : 'Select all 6'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {GREYSTONES_COUNCILLORS.map((cllr) => {
                      const checked = selectedCouncillorIds.includes(cllr.id);
                      return (
                        <button
                          key={cllr.id}
                          type="button"
                          onClick={() =>
                            setSelectedCouncillorIds((prev) =>
                              prev.includes(cllr.id)
                                ? prev.filter((id) => id !== cllr.id)
                                : [...prev, cllr.id]
                            )
                          }
                          className={`px-3 py-2 rounded-xl border text-left flex items-center justify-between ${
                            checked
                              ? 'border-primary/40 bg-canvas'
                              : 'border-line bg-white opacity-60'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink truncate">{cllr.name}</p>
                            <p className="text-[11px] text-muted truncate">{cllr.email}</p>
                          </div>
                          <span className="text-primary text-sm font-bold">
                            {checked ? '✓' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* CC Contacts */}
                  <div className="pt-1 flex flex-wrap gap-1.5">
                    {COUNCIL_CC_CONTACTS.map((cc) => {
                      const checked = selectedCcIds.includes(cc.id);
                      return (
                        <button
                          key={cc.id}
                          type="button"
                          onClick={() =>
                            setSelectedCcIds((prev) =>
                              prev.includes(cc.id)
                                ? prev.filter((id) => id !== cc.id)
                                : [...prev, cc.id]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                            checked
                              ? 'border-primary/40 bg-canvas text-ink'
                              : 'border-line bg-white text-muted'
                          }`}
                        >
                          {checked ? '✓ ' : '+ '}CC {cc.email}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Message input when Write Your Own is selected */}
                {selectedTemplateId === 'write_your_own' ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="custom-body" className="text-xs font-semibold text-ink">
                        Your Message to Councillors
                      </label>
                      <span className="text-[11px] text-muted font-normal">
                        All 6 councillors prefilled
                      </span>
                    </div>
                    <textarea
                      id="custom-body"
                      rows={6}
                      value={customEmailBody}
                      onChange={(e) => setCustomEmailBody(e.target.value)}
                      placeholder="Dear Councillor,&#10;&#10;I want to raise an issue with dog fouling in our area..."
                      className="w-full rounded-xl border border-line p-3 text-xs text-ink bg-white focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                    />
                    <p className="text-[11px] text-muted">
                      💡 Tip: You can type your message above or leave it blank to write directly in your mail app. Tapping <strong>Open in Your Email App</strong> will prefill all 6 councillors' email addresses.
                    </p>
                  </div>
                ) : null}

                {/* Sign-off */}
                <div className="space-y-1">
                  <label htmlFor="sign-off" className="text-xs font-semibold text-ink">
                    Sign off (local only)
                  </label>
                  <input
                    id="sign-off"
                    type="text"
                    value={residentSignOff}
                    onChange={(e) => setResidentSignOff(e.target.value)}
                    className="w-full rounded-xl border border-line px-3 py-2 text-xs text-ink"
                    placeholder="e.g. Mary Kelly, Charlesland"
                  />
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-muted hover:text-ink select-none pt-1">
                    <input
                      type="checkbox"
                      checked={includeLiveEvidenceStats}
                      onChange={(e) => setIncludeLiveEvidenceStats(e.target.checked)}
                      className="rounded border-line text-primary focus:ring-primary h-3.5 w-3.5"
                    />
                    <span>Append live community map stats snapshot ({analysis.totalActiveReports} reports)</span>
                  </label>
                </div>

                {/* Email Preview */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">
                    {selectedTemplateId === 'write_your_own' ? 'Email Summary & Addressing' : 'Preview'}
                  </label>
                  <div className="rounded-xl border border-line bg-canvas p-3 space-y-2">
                    <p className="text-xs font-bold text-ink">{generatedEmail.subject}</p>
                    <pre className="whitespace-pre-wrap font-sans text-xs text-ink leading-relaxed max-h-56 overflow-y-auto">
                      {generatedEmail.body}
                    </pre>
                  </div>
                </div>

                {/* Send Actions */}
                <div className="space-y-2">
                  <a
                    href={generatedEmail.mailtoHref}
                    onClick={() => {
                      setEmailsPreparedCount((c) => c + 1);
                      recordCivicEvent('email_council_mailto', {
                        targetButton: 'mailto',
                        templateId: selectedTemplateId,
                        councillorIds: selectedCouncillorIds,
                      });
                    }}
                    className="w-full h-12 bg-primary hover:bg-primary-container text-white rounded-2xl font-display text-sm font-bold flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-lg">mail</span>
                    <span>Open in Your Email App</span>
                  </a>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyFullEmail}
                      className="h-10 rounded-xl border border-line bg-white hover:bg-canvas text-xs font-semibold text-ink flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">content_copy</span>
                      <span>Copy Email</span>
                    </button>
                    <a
                      href={generatedEmail.gmailHref}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        recordCivicEvent('email_council_gmail', {
                          targetButton: 'gmail',
                          templateId: selectedTemplateId,
                          councillorIds: selectedCouncillorIds,
                        });
                      }}
                      className="h-10 rounded-xl border border-line bg-white hover:bg-canvas text-xs font-semibold text-ink flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      <span>Gmail Web</span>
                    </a>
                  </div>
                  {emailCopiedToast && (
                    <p className="text-center text-xs font-semibold text-primary">
                      {emailCopiedToast}
                    </p>
                  )}
                </div>
              </section>
            </main>
          )}
        </>
      )}

      {/* Clean 3-Item Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Primary Bottom Navigation"
        className="fixed bottom-0 left-0 w-full z-40 grid grid-cols-3 gap-1 px-3 py-1.5 bg-white border-t border-line shadow-xs"
      >
        <button
          type="button"
          onClick={() => {
            setHamburgerPage('none');
            setActiveTab('map');
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors ${
            hamburgerPage === 'none' && activeTab === 'map'
              ? 'bg-primary text-white'
              : 'text-muted hover:bg-canvas'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">map</span>
          <span>Map</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setHamburgerPage('none');
            setActiveTab('insights');
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors ${
            hamburgerPage === 'none' && activeTab === 'insights'
              ? 'bg-primary text-white'
              : 'text-muted hover:bg-canvas'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">bar_chart</span>
          <span>Insights</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setHamburgerPage('none');
            setActiveTab('council');
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors ${
            hamburgerPage === 'none' && activeTab === 'council'
              ? 'bg-primary text-white'
              : 'text-muted hover:bg-canvas'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">mail</span>
          <span>Email Council</span>
        </button>
      </nav>

      {/* iOS Safari Install Guide Modal */}
      {showIosInstallModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-xs p-3 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-line shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📱</span>
                <div>
                  <h3 className="font-display text-base font-bold text-ink">
                    Install on iPhone / iPad
                  </h3>
                  <p className="text-xs text-muted">Add to Home Screen via Safari</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIosInstallModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-canvas text-muted flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <ol className="space-y-3 text-xs text-ink list-decimal list-inside bg-canvas p-3.5 rounded-xl border border-line">
              <li className="leading-relaxed">
                Tap the <strong>Share</strong> button (
                <span className="inline-block px-1 font-mono text-[11px] bg-white border border-line rounded">
                  ⎋ / [↑]
                </span>
                ) in Safari's bottom toolbar.
              </li>
              <li className="leading-relaxed">
                Scroll down and select <strong>Add to Home Screen</strong> (
                <span className="font-semibold text-primary">＋</span>
                ).
              </li>
              <li className="leading-relaxed">
                Tap <strong>Add</strong> in the top-right corner. Clean Greystones will launch as a fast standalone app with offline caching!
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosInstallModal(false)}
              className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-container text-white text-xs font-semibold shadow-xs"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
