import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  COUNCIL_CC_CONTACTS,
  EMAIL_TEMPLATES,
  GREYSTONES_COUNCILLORS,
  HANSARD_RECORDS,
  INITIAL_PUBLIC_BINS,
  VERIFIED_CITATIONS,
} from './data/greystonesData';
import { countForEvidence, deliverCouncillorEmail } from './data/evidence';
import { isDemo } from './config/mode';
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

  const [reports, setReports] = useState<FoulingReport[]>([]);
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<EmailTemplateId>('bin_mythbuster');
  const [residentSignOff, setResidentSignOff] = useState<string>('A Greystones resident');
  const [emailCopiedToast, setEmailCopiedToast] = useState<string>('');
  const [emailsPreparedCount, setEmailsPreparedCount] = useState<number>(isDemo ? 42 : 0);

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

    const newReport: FoulingReport = {
      id: `rep-${143 + reports.length}`,
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
      is_seeded_demo: false,
    };

    setReports((prev) => [newReport, ...prev]);
    if (!isDemo) {
      void import('./data/civicBackend').then((mod) => {
        void mod.submitResidentReport(newReport);
      });
    }
    setSelectedReport(newReport);
    setLastLoggedReport(newReport);
    setOptionalNote('');
    setOptionalPhotoPreview(null);
    setNoteWarnings([]);
  };

  const handleMapClickDropPin = (lat: number, lng: number) => {
    setDraftCoords({ lat, lng });
    logReportImmediately(lat, lng, selectedSeverity);
  };

  // Update the just-logged report when the user changes severity chip or attaches optional note/photo
  const handleSeverityChange = (sev: SeverityType) => {
    setSelectedSeverity(sev);
    if (lastLoggedReport) {
      setReports((prev) =>
        prev.map((r) => (r.id === lastLoggedReport.id ? { ...r, severity: sev } : r))
      );
      setLastLoggedReport((prev) => (prev ? { ...prev, severity: sev } : null));
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

    setReports((prev) =>
      prev.map((r) =>
        r.id === lastLoggedReport.id
          ? {
              ...r,
              note: optionalNote.trim() || r.note,
              hasPhoto: Boolean(optionalPhotoPreview) || r.hasPhoto,
              photoDataUrl: optionalPhotoPreview ?? r.photoDataUrl,
            }
          : r
      )
    );
    setLastLoggedReport((prev) =>
      prev
        ? {
            ...prev,
            note: optionalNote.trim() || prev.note,
            hasPhoto: Boolean(optionalPhotoPreview) || prev.hasPhoto,
            photoDataUrl: optionalPhotoPreview ?? prev.photoDataUrl,
          }
        : null
    );
    setExpandOptionalReportModal(false);
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
    setReports((prev) => prev.filter((r) => r.id !== lastLoggedReport.id));
    setLastLoggedReport(null);
    setSelectedReport(null);
    setExpandOptionalReportModal(false);
  };

  const handleConfirmExistingReport = (reportId: string) => {
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, confirmations: r.confirmations + 1 } : r
      )
    );
    if (selectedReport?.id === reportId) {
      setSelectedReport((prev) =>
        prev ? { ...prev, confirmations: prev.confirmations + 1 } : null
      );
    }
  };

  // Demo vs Production Seed Management
  const handleClearSeededDemoData = () => {
    setReports((prev) => prev.filter((r) => !r.isSeededDemo));
    setSelectedReport(null);
    setLastLoggedReport(null);
  };

  const handleRestoreSeededDemoData = () => {
    if (!isDemo) return;
    void import('./data/demoSeeds').then((mod) => {
      void mod.DEMO_SEED_FINGERPRINT;
      setReports((prev) => {
        const userLogged = prev.filter((report) => !report.isSeededDemo && report.is_seeded_demo !== true);
        return [...userLogged, ...mod.INITIAL_REPORTS];
      });
    });
  };

  useEffect(() => {
    let cancelled = false;
    if (isDemo) {
      void import('./data/demoSeeds').then((mod) => {
        if (cancelled) return;
        void mod.DEMO_SEED_FINGERPRINT;
        setReports(mod.INITIAL_REPORTS);
      });
      return () => {
        cancelled = true;
      };
    }
    void import('./data/civicBackend').then(async (mod) => {
      const loaded = await mod.loadResidentReports();
      if (!cancelled) setReports(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    const delivery = deliverCouncillorEmail(toEmails, ccEmails);
    const evidenceCount = delivery.sendable
      ? countForEvidence(reports, submitterToken, false)
      : analysis.totalActiveReports;

    const topHotspot = analysis.nearBinHotspots[0]?.areaName ?? 'South Beach Promenade';
    const focusReport = selectedReport ?? lastLoggedReport ?? reports[0];

    let subject = `Dog Fouling in Greystones — ${evidenceCount} Mapped Reports (${analysis.nearBin50mPct}% Within 50m of a Bin)`;
    let introParagraph = `I am writing as a resident of Greystones, Co. Wicklow to raise urgent frustration over the volume and frequency of dog fouling across our footpaths, seafront promenade, and public spaces.`;

    if (selectedTemplateId === 'bin_mythbuster') {
      subject = `Greystones Dog Fouling Evidence: ${analysis.nearBin50mPct}% of Mapped Fouling Occurs Within 50m of a Public Bin`;
      introParagraph = `I am sharing community evidence from the Clean Greystones Dog Fouling Map. Background proximity checks against Greystones public litter bins show that ${analysis.nearBin15mCount} of ${evidenceCount} mapped incidents (${analysis.nearBin15mPct}%) occurred within 15 metres of a bin, and ${analysis.nearBin50mPct}% occurred within 50 metres — demonstrating that seafront and town-centre fouling is not caused by a "long walk to a bin".`;
    } else if (selectedTemplateId === 'wheel_contamination') {
      subject = `Footpath Accessibility Hazard: ${analysis.highImpactCount} Buggy, Wheelchair & Pedestrian Contaminations in Greystones`;
      introParagraph = `Residents have logged ${evidenceCount} dog fouling incidents across Greystones (${analysis.distinctSubmitters} verified anonymous resident tokens) — including ${analysis.bySeverity.wheelchair_wheels.count} wheelchair roll-throughs, ${analysis.bySeverity.buggy_wheels.count} buggy wheel contaminations, and ${analysis.bySeverity.stepped_in.count} pedestrian shoe hits.`;
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

    const body = `Dear Councillors,

${introParagraph}

SUMMARY OF MAPPED GREYSTONES EVIDENCE:
• Active Geo-Tagged Reports: ${evidenceCount} incidents across ${analysis.distinctSubmitters} distinct anonymous resident tokens
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
${residentSignOff}
(Anonymous Verification ID: ${submitterToken})`;

    const mailtoHref = `mailto:${delivery.toEmails.join(',')}?cc=${encodeURIComponent(
      delivery.ccEmails.join(',')
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    const gmailHref = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      delivery.toEmails.join(',')
    )}&cc=${encodeURIComponent(delivery.ccEmails.join(','))}&su=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;

    return {
      toEmails: delivery.toEmails,
      ccEmails: delivery.ccEmails,
      sample: delivery.sample,
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
            {/* Live Count Pill */}
            <button
              type="button"
              onClick={() => {
                setHamburgerPage('none');
                setActiveTab('insights');
              }}
              className="flex items-center gap-1.5 bg-canvas hover:bg-surface-container px-2.5 py-1.5 rounded-full border border-line text-xs font-semibold text-ink transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span>{analysis.totalActiveReports} logged</span>
              <span className="text-muted hidden sm:inline">
                ({analysis.nearBin50mPct}% ≤50m bin)
              </span>
            </button>

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
                  <div className="flex items-center gap-2">
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
            <div className="flex-1 flex flex-col overflow-hidden relative">
              {/* Clean Slim Filter Bar */}
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
                        <button
                          type="button"
                          onClick={() => handleConfirmExistingReport(selectedReport.id)}
                          className="px-2.5 py-1 rounded-lg bg-canvas hover:bg-surface-container border border-line text-xs font-semibold text-ink"
                        >
                          👍 +1 ({selectedReport.confirmations})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedReport(null)}
                          className="p-1 text-muted hover:text-ink text-xs"
                          aria-label="Dismiss pin summary"
                        >
                          ✕
                        </button>
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

                {/* Bottom Hero Control Dock: 4 Emoji Pills + 1-Tap Button */}
                <div className="z-30 bg-white border-t border-line px-3 pt-2.5 pb-16 shrink-0">
                  <div className="max-w-md mx-auto space-y-2">
                    <div
                      role="group"
                      aria-label="Select fouling impact"
                      className="grid grid-cols-4 gap-1.5"
                    >
                      {(Object.keys(SEVERITY_META) as SeverityType[]).map((sevKey) => {
                        const meta = SEVERITY_META[sevKey];
                        const active = selectedSeverity === sevKey;
                        return (
                          <button
                            key={sevKey}
                            type="button"
                            onClick={() => handleSeverityChange(sevKey)}
                            className={`py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 border transition-all active:scale-95 ${
                              active
                                ? 'bg-primary text-white border-primary shadow-xs'
                                : 'bg-canvas text-ink border-line hover:bg-surface-container'
                            }`}
                          >
                            <span className="text-sm">{meta.emoji}</span>
                            <span className="truncate">{meta.shortLabel}</span>
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        logReportImmediately(
                          draftCoords.lat,
                          draftCoords.lng,
                          selectedSeverity
                        )
                      }
                      className="w-full h-12 bg-primary hover:bg-primary-container text-white rounded-2xl font-display text-sm font-bold shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                    >
                      <span className="text-lg">{SEVERITY_META[selectedSeverity].emoji}</span>
                      <span>
                        Mark {SEVERITY_META[selectedSeverity].shortLabel} Here (or Tap Map)
                      </span>
                    </button>
                  </div>
                </div>
              </div>

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
    </div>
  );
}

export default App;
