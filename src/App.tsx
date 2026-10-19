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
  EmailTemplateId,
  FoulingReport,
  PublicBin,
  SeverityType,
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
import {
  subscribeToCrowdsourcedReports,
  syncReportToCloud,
  deleteReportFromCloud,
  incrementConfirmationInCloud,
  clearReportsFromCloud,
  seedDemoReportsToCloud,
} from './utils/firebaseSync';

type BottomNavTab = 'map' | 'insights' | 'council';
type HamburgerPage = 'none' | 'bins_stats' | 'legal_bylaws' | 'watchdog' | 'data_admin';

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
  };

  const [activeTab, setActiveTab] = useState<BottomNavTab>('map');
  const [hamburgerOpen, setHamburgerOpen] = useState<boolean>(false);
  const [hamburgerPage, setHamburgerPage] = useState<HamburgerPage>('none');

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

  const handlePromptInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
      } catch {
        // dismissed
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
  const [bins] = useState<PublicBin[]>(INITIAL_PUBLIC_BINS);

  // Unique provable anonymous device token (no logins, no PII)
  const [submitterToken] = useState<string>(() => getOrCreateSubmitterToken());

  // Map Filter & Background Bin Toggle (bins run in background by default so map isn't cluttered)
  const [mapFilter, setMapFilter] = useState<'all' | 'near_bins' | 'wheels' | 'stepped_in'>('all');
  const [showBinOverlayOnMap, setShowBinOverlayOnMap] = useState<boolean>(false);

  // 1-Tap Hero Map State + Optional Post-Tap Details Sheet
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityType>('just_poop');
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number }>({
    lat: 53.14431,
    lng: -6.06047,
  });
  const [selectedReport, setSelectedReport] = useState<FoulingReport | null>(null);
  const [lastLoggedReport, setLastLoggedReport] = useState<FoulingReport | null>(null);

  // BUG-1 & BUG-3: Type Chooser Bottom Sheet & Live Banner Session State
  const [isTypeChooserOpen, setIsTypeChooserOpen] = useState<boolean>(false);
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
  const [residentSignOff, setResidentSignOff] = useState<string>('A concerned Greystones resident');
  const [includeLiveEvidenceStats, setIncludeLiveEvidenceStats] = useState<boolean>(false);
  const [emailCopiedToast, setEmailCopiedToast] = useState<string>('');
  const [emailsPreparedCount, setEmailsPreparedCount] = useState<number>(42);

  // Background Bins-vs-Fouling & Hotspot Intelligence (Node N10)
  const analysis = useMemo(() => computeBinsVsFoulingAnalysis(reports), [reports]);
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

  // Instant 1-Tap Log on Map Click or Button Tap
  const logReportImmediately = (lat: number, lng: number, severity: SeverityType) => {
    const loc = inferGreystonesLocation(lat, lng);
    const nearest = findNearestBins(lat, lng, bins);
    const h3Cell = computeGreystonesCell(lat, lng);

    const uniqueId = `rep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const newReport: FoulingReport = {
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

    setReports((prev) => [newReport, ...prev]);
    setSelectedReport(newReport);
    setLastLoggedReport(newReport);
    setOptionalNote('');
    setOptionalPhotoPreview(null);
    setNoteWarnings([]);
    dismissLiveBanner();

    // Sync immediately to communal cloud backend so other browsers/devices see it in real time
    syncReportToCloud(newReport).catch((err) => {
      console.warn('Could not sync new report to communal cloud:', err);
    });
  };

  // BUG-1: On map click or drag, record draft coords and open Type Chooser sheet
  const handleMapClickDropPin = (lat: number, lng: number) => {
    setDraftCoords({ lat, lng });
    setIsTypeChooserOpen(true);
  };

  // BUG-1: One type decision per log
  const handleSelectSeverityAndLog = (sev: SeverityType) => {
    setSelectedSeverity(sev);
    setIsTypeChooserOpen(false);
    logReportImmediately(draftCoords.lat, draftCoords.lng, sev);
  };

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
    const focusReport = selectedReport ?? lastLoggedReport ?? reports[0];

    let subject = 'Dog Fouling in Greystones — Need for Practical Solutions and Resources';
    let body = '';

    if (selectedTemplateId === 'practical_action') {
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
        body += `\n\n---\nLive Greystones Map Evidence (cleangreystones.ie):\n• Active Mapped Reports: ${analysis.totalActiveReports} incidents\n• Direct Wheel & Footwear Contaminations: ${analysis.highImpactCount}\n• Primary Hotspot Beside Bins: ${topHotspot}`;
      }
    } else {
      let introParagraph = `I am writing as a resident of Greystones, Co. Wicklow to raise urgent frustration over the volume and frequency of dog fouling across our footpaths, seafront promenade, and public spaces.`;
      subject = `Dog Fouling in Greystones — ${analysis.totalActiveReports} Mapped Reports (${analysis.nearBin50mPct}% Within 50m of a Bin)`;

      if (selectedTemplateId === 'bin_mythbuster') {
        subject = `Greystones Dog Fouling Evidence: ${analysis.nearBin50mPct}% of Mapped Fouling Occurs Within 50m of a Public Bin`;
        introParagraph = `I am sharing community evidence from the Clean Greystones Dog Fouling Map. Background proximity checks against Greystones public litter bins show that ${analysis.nearBin15mCount} of ${analysis.totalActiveReports} mapped incidents (${analysis.nearBin15mPct}%) occurred within 15 metres of a bin, and ${analysis.nearBin50mPct}% occurred within 50 metres — demonstrating that seafront and town-centre fouling is not caused by a "long walk to a bin".`;
      } else if (selectedTemplateId === 'wheel_contamination') {
        subject = `Footpath Accessibility Hazard: ${analysis.highImpactCount} Buggy, Wheelchair & Pedestrian Contaminations in Greystones`;
        introParagraph = `Residents have logged ${analysis.totalActiveReports} dog fouling incidents across Greystones (${analysis.distinctSubmitters} verified anonymous resident tokens) — including ${analysis.bySeverity.wheelchair_wheels.count} wheelchair roll-throughs, ${analysis.bySeverity.buggy_wheels.count} buggy wheel contaminations, and ${analysis.bySeverity.stepped_in.count} pedestrian shoe hits.`;
      } else if (selectedTemplateId === 'request_bin') {
        subject = `Request for Dog-Waste Bins on Unserved Greystones Walking Routes (>200m from any bin)`;
        introParagraph = `While Greystones town centre and South Beach Promenade have 16 general litter bins (where enforcement is the primary gap), our spatial audit shows 0 dedicated dog-waste bins in the town and >200m bin gaps on outer walking routes including Kindlestown Woods (445m to nearest bin), Charlesland Spine Path (910m), and the Cliff Walk trailhead (235m).`;
      }

      const latestFocusBlock = focusReport
        ? `Logged Incident Reference (${focusReport.id.toUpperCase()} · Submitter ${focusReport.submitterToken}):
• Location: ${focusReport.streetName} (${focusReport.lat.toFixed(4)}° N, ${Math.abs(focusReport.lng).toFixed(4)}° W)
• Impact: ${SEVERITY_META[focusReport.severity].label}
• Distance to Nearest Public Bin: ${focusReport.dBinAllM} metres (${focusReport.nearestBinCode})${
            focusReport.note ? `\n• Note: "${focusReport.note}"` : ''
          }`
        : '';

      const citationsBlock = activeCitations
        .map((c) => `• ${c.code}: "${c.quote}"`)
        .join('\n');

      body = `Dear Councillors,

${introParagraph}

SUMMARY OF MAPPED GREYSTONES EVIDENCE:
• Active Geo-Tagged Reports: ${analysis.totalActiveReports} incidents across ${analysis.distinctSubmitters} distinct anonymous resident tokens
• Bin Proximity (Background Audit): ${analysis.nearBin15mPct}% (${analysis.nearBin15mCount} reports) are within 15m of a bin; ${analysis.nearBin50mPct}% are within 50m of a bin.
• Direct Wheel & Shoe Impact: ${analysis.highImpactCount} incidents (${analysis.highImpactPct}%) involved wheelchair wheels (${analysis.bySeverity.wheelchair_wheels.count}), buggy wheels (${analysis.bySeverity.buggy_wheels.count}), or pedestrians stepping in waste (${analysis.bySeverity.stepped_in.count}).
• Primary Hotspot Beside Bins: ${topHotspot}
• Unserved Outer Routes (>200m from a bin): Kindlestown Woods, Charlesland Spine Path, and Cliff Walk Start (${analysis.gt200mCount} reports).

${latestFocusBlock}

STATUTORY & POLICY BASIS:
${citationsBlock}

REQUESTED ACTION AT THE NEXT GREYSTONES MD MEETING:
1. Targeted Warden Patrols: Deploy authorised litter/dog wardens and Greystones parking wardens during peak dog-walking windows (Sat/Sun 08:00–13:00) on South Beach Promenade, Harbour Marina, and Church Road to enforce the €250 on-the-spot fine.
2. Bin Gaps on Outer Walks: Install dedicated dog-waste bins at Kindlestown, Charlesland, and the Cliff Walk start.
3. Transparent Reporting: Separately record and publish s.22 dog-fouling fines issued in Greystones Municipal District.

Kind regards,
${residentSignOff || 'A concerned Greystones resident'}
(Anonymous Verification ID: ${submitterToken})`;
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
    selectedReport,
    lastLoggedReport,
    reports,
    activeCitations,
    residentSignOff,
    submitterToken,
    includeLiveEvidenceStats,
  ]);

  const handleCopyFullEmail = async () => {
    const fullText = `To: ${generatedEmail.toEmails.join('; ')}\nCC: ${generatedEmail.ccEmails.join(
      '; '
    )}\nSubject: ${generatedEmail.subject}\n\n${generatedEmail.body}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setEmailCopiedToast('Email copied to clipboard');
      setEmailsPreparedCount((c) => c + 1);
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

  if (isAdminRoute) {
    return (
      <AdminBackendView
        liveReports={reports}
        demoSeedCleared={!hasDemoSeeds}
        onToggleClearDemoSeed={handleToggleDemoSeedsFromAdmin}
        onDeleteReport={handleDeleteSingleReport}
        onExitAdmin={exitAdminPortal}
      />
    );
  }

  return (
    <div className="min-h-full h-full flex flex-col bg-canvas text-ink font-sans select-none">
      {/* Compact Professional Top Header */}
      <header className="bg-white border-b border-line z-40 shrink-0">
        <div className="flex justify-between items-center w-full px-3.5 py-2.5 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setHamburgerPage('none');
                setActiveTab('map');
              }}
              className="flex items-center gap-2 text-left"
            >
              <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center shadow-xs">
                <span className="text-base">💩</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-base sm:text-lg font-bold text-ink tracking-tight">
                    Clean Greystones
                  </span>
                  <span className="hidden sm:inline-block bg-canvas border border-line text-muted font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold">
                    {submitterToken}
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Count Pill (Crowdsourced Communal Cloud) */}
            <button
              type="button"
              onClick={() => {
                setHamburgerPage('none');
                setActiveTab('insights');
              }}
              className="flex items-center gap-1.5 bg-canvas hover:bg-surface-container px-2.5 py-1.5 rounded-full border border-line text-xs font-semibold text-ink transition-colors"
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

            {/* PWA Direct Install Header Button */}
            {!isStandalone && (
              <button
                type="button"
                onClick={handlePromptInstall}
                aria-label="Install Clean Greystones App"
                className="flex items-center gap-1.5 bg-primary hover:bg-primary-container text-white px-2.5 py-1.5 rounded-full text-xs font-semibold shadow-xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">install_mobile</span>
                <span>Install</span>
              </button>
            )}

            {/* Hamburger Menu Button for Background Info (Bins & Stats, Legal & Bye-Laws, Watchdog, Demo/Prod Data) */}
            <button
              type="button"
              onClick={() => setHamburgerOpen((v) => !v)}
              aria-label="Open background information menu"
              className="w-9 h-9 rounded-xl border border-line bg-white hover:bg-canvas flex items-center justify-center text-ink active:scale-95 transition-transform"
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
                  className="w-8 h-8 rounded-lg hover:bg-canvas flex items-center justify-center text-muted"
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

                <a
                  href="https://greystones-roads.web.app"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full p-3 rounded-xl border border-line hover:border-primary bg-white hover:bg-canvas text-left flex items-start gap-3 transition-colors"
                >
                  <span className="text-base mt-0.5">🕳️</span>
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      Sister App: Fix Greystones Roads
                    </p>
                    <p className="text-xs text-muted">
                      Switch to greystonesroads.ie (Pothole & Utility Trench Tracker) ↗
                    </p>
                  </div>
                </a>

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
              data-agent-state={reports.length === 0 ? 'empty' : mapFilter !== 'all' ? 'filtering' : 'live'}
            >
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
                  </div>
                </section>
              )}

              {/* Map Viewport */}
              <div className="relative flex-1 flex flex-col overflow-hidden">
                <GreystonesMapView
                  reports={reports}
                  bins={bins}
                  activeFilter={mapFilter}
                  showBinOverlay={showBinOverlayOnMap}
                  selectedReport={selectedReport}
                  onSelectReport={setSelectedReport}
                  draftCoords={draftCoords}
                  onMapClickDropPin={handleMapClickDropPin}
                  quickSeverity={selectedSeverity}
                />

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
                        className="p-1 rounded-full text-muted hover:text-ink hover:bg-canvas transition-colors shrink-0"
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

              {/* BUG-1: Type Chooser Bottom Sheet / Modal (One Type Decision per Log) */}
              {isTypeChooserOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Choose fouling impact"
                  className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-xs p-0 sm:p-4"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setIsTypeChooserOpen(false);
                  }}
                >
                  <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl border border-line shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                          Log Observation
                        </span>
                        <h3 className="font-display text-base font-bold text-ink">
                          What did you spot?
                        </h3>
                        <p className="text-xs text-muted truncate">
                          {draftContext.streetName} · {draftContext.dBinAllM}m from {draftContext.nearestAll.code}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsTypeChooserOpen(false)}
                        aria-label="Close type selection"
                        className="w-8 h-8 rounded-lg hover:bg-canvas text-muted flex items-center justify-center transition-colors"
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

                {/* 1. Template Choice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-ink">1. Select Template</label>
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
                              ? 'border-primary bg-primary/5'
                              : 'border-line bg-white hover:bg-canvas'
                          }`}
                        >
                          <p className="text-xs font-bold text-ink">{tpl.label}</p>
                          <p className="text-[11px] text-muted mt-0.5">{tpl.shortDesc}</p>
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
                  />
                  {selectedTemplateId === 'practical_action' && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-muted hover:text-ink select-none pt-1">
                      <input
                        type="checkbox"
                        checked={includeLiveEvidenceStats}
                        onChange={(e) => setIncludeLiveEvidenceStats(e.target.checked)}
                        className="rounded border-line text-primary focus:ring-primary h-3.5 w-3.5"
                      />
                      <span>Append live community map stats snapshot ({analysis.totalActiveReports} reports)</span>
                    </label>
                  )}
                </div>

                {/* Email Preview */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">Preview</label>
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
                    onClick={() => setEmailsPreparedCount((c) => c + 1)}
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
