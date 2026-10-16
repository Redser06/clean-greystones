import React, { useMemo, useState } from 'react';
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
  GraphRunSummary,
  PublicBin,
  SeverityType,
} from './types';
import {
  SEVERITY_META,
  checkPiiAndGuardrails,
  computeBinsVsFoulingAnalysis,
  computeGreystonesCell,
  findNearestBins,
  inferGreystonesLocation,
  selectVerifiedCitations,
} from './utils/graphEngine';
import { GreystonesMapView } from './components/GreystonesMapView';

type ActiveTab = 'map' | 'report' | 'bins' | 'council';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('map');
  const [reports, setReports] = useState<FoulingReport[]>(INITIAL_REPORTS);
  const [bins, setBins] = useState<PublicBin[]>(INITIAL_PUBLIC_BINS);

  // Map Filter & Overlay States
  const [mapFilter, setMapFilter] = useState<'all' | 'near_bins' | 'wheels' | 'stepped_in'>('all');
  const [showBinOverlay, setShowBinOverlay] = useState<boolean>(true);
  const [showProximityLines, setShowProximityLines] = useState<boolean>(true);

  // Simple 1-Tap Mode vs Detailed Mode
  const [quickOneTapMode, setQuickOneTapMode] = useState<boolean>(true);
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityType>('just_poop');
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number }>({
    lat: 53.14431,
    lng: -6.06047,
  });
  const [draftNote, setDraftNote] = useState<string>('');
  const [draftReporterInitials, setDraftReporterInitials] = useState<string>('CR');

  // Selected Pin or Bin on Map
  const [selectedReport, setSelectedReport] = useState<FoulingReport | null>(INITIAL_REPORTS[0]);
  const [selectedBin, setSelectedBin] = useState<PublicBin | null>(null);

  // Toast / Instant 1-Tap Feedback + Graph Engine Audit Trace
  const [lastLoggedReport, setLastLoggedReport] = useState<FoulingReport | null>(null);
  const [lastGraphRun, setLastGraphRun] = useState<GraphRunSummary | null>(null);
  const [noteWarnings, setNoteWarnings] = useState<string[]>([]);

  // Email Builder States
  const [selectedCouncillorIds, setSelectedCouncillorIds] = useState<string[]>(
    GREYSTONES_COUNCILLORS.filter((c) => c.isDefaultSelected).map((c) => c.id)
  );
  const [selectedCcIds, setSelectedCcIds] = useState<string[]>(
    COUNCIL_CC_CONTACTS.filter((c) => c.defaultChecked).map((c) => c.id)
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<EmailTemplateId>('bin_mythbuster');
  const [residentSignOff, setResidentSignOff] = useState<string>('A concerned Greystones resident');
  const [emailCopiedToast, setEmailCopiedToast] = useState<string>('');
  const [emailsDispatchedCount, setEmailsDispatchedCount] = useState<number>(42);

  // Add New Crowd Bin Modal State
  const [newBinName, setNewBinName] = useState<string>('');
  const [newBinKind, setNewBinKind] = useState<'general' | 'dog_waste' | 'bag_dispenser'>('general');
  const [binAddedFeedback, setBinAddedFeedback] = useState<string>('');

  // Graph Node N10: Real-time Bins vs Fouling Analysis
  const analysis = useMemo(() => computeBinsVsFoulingAnalysis(reports), [reports]);

  // Draft Pin Location & Nearest Bin Calculation (Graph Nodes N5 + N6)
  const draftContext = useMemo(() => {
    const loc = inferGreystonesLocation(draftCoords.lat, draftCoords.lng);
    const nearest = findNearestBins(draftCoords.lat, draftCoords.lng, bins);
    return {
      ...loc,
      ...nearest,
      h3Cell: computeGreystonesCell(draftCoords.lat, draftCoords.lng),
    };
  }, [draftCoords, bins]);

  // Execute G1 Intake Graph to commit a new pin
  const commitFoulingReport = (
    lat: number,
    lng: number,
    severity: SeverityType,
    noteText?: string
  ) => {
    if (noteText) {
      const check = checkPiiAndGuardrails(noteText);
      if (!check.ok) {
        setNoteWarnings(check.warnings);
        return;
      }
    }
    setNoteWarnings([]);

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
      note:
        noteText && noteText.trim().length > 0
          ? noteText.trim()
          : `${SEVERITY_META[severity].label} logged at ${loc.streetName} (${nearest.dBinAllM}m from ${nearest.nearestAll.code}).`,
      reporterInitials: draftReporterInitials || 'RES',
      nearestBinId: nearest.nearestAll.id,
      nearestBinCode: nearest.nearestAll.code,
      dBinAllM: nearest.dBinAllM,
      dBinVerifiedM: nearest.dBinVerifiedM,
    };

    const graphRun: GraphRunSummary = {
      runId: `run-${Date.now().toString(36)}`,
      reportId: newReport.id,
      timestamp: new Date().toLocaleTimeString(),
      n1Validate: { ok: true, reason: 'Inside Greystones MD study polygon (±2.4m GPS)' },
      n4Dedupe: { action: 'new' },
      n5Snap: { snapped: true, street: loc.streetName },
      n6BinDist: {
        nearestBinCode: nearest.nearestAll.code,
        distanceM: nearest.dBinAllM,
        isNearBinMythbuster: nearest.dBinAllM <= 25,
        promptType:
          nearest.nearestAll.status === 'unverified' && nearest.dBinAllM <= 30
            ? 'confirm_bin'
            : nearest.dBinVerifiedM > 250
            ? 'survey_cell'
            : 'none',
      },
      n7Commit: { status: 'spotted' },
    };

    setReports((prev) => [newReport, ...prev]);
    setSelectedReport(newReport);
    setSelectedBin(null);
    setLastLoggedReport(newReport);
    setLastGraphRun(graphRun);
    setDraftNote('');
  };

  // Handle clicking on the map
  const handleMapClickDropPin = (lat: number, lng: number) => {
    setDraftCoords({ lat, lng });
    if (quickOneTapMode && activeTab === 'map') {
      // In Simple 1-Tap Mode, clicking the map immediately drops a poop pin!
      commitFoulingReport(lat, lng, selectedSeverity);
    }
  };

  // Undo last quick drop
  const handleUndoLastDrop = () => {
    if (!lastLoggedReport) return;
    setReports((prev) => prev.filter((r) => r.id !== lastLoggedReport.id));
    setLastLoggedReport(null);
    setSelectedReport(reports[1] ?? null);
  };

  // "Me Too" / Confirm an existing pin (Graph Node N4 Dedupe)
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

  // Mark an existing pin as Cleared (Tidy Towns / Resident cleanup)
  const handleToggleClearedReport = (reportId: string) => {
    setReports((prev) =>
      prev.map((r) => {
        if (r.id !== reportId) return r;
        const nextStatus = r.status === 'cleared' ? 'spotted' : 'cleared';
        return {
          ...r,
          status: nextStatus,
          clearedAt: nextStatus === 'cleared' ? new Date().toISOString() : undefined,
        };
      })
    );
    if (selectedReport?.id === reportId) {
      setSelectedReport((prev) =>
        prev
          ? {
              ...prev,
              status: prev.status === 'cleared' ? 'spotted' : 'cleared',
            }
          : null
      );
    }
  };

  // Graph G2: Vote to confirm or dispute a public bin
  const handleVoteBin = (binId: string, vote: 'yes' | 'no' | 'dog_bin') => {
    setBins((prev) =>
      prev.map((b) => {
        if (b.id !== binId) return b;
        const yesVotes = vote === 'yes' || vote === 'dog_bin' ? b.yesVotes + 1 : b.yesVotes;
        const noVotes = vote === 'no' ? b.noVotes + 1 : b.noVotes;
        const status =
          yesVotes >= 2
            ? 'verified'
            : noVotes >= 2 && noVotes > yesVotes
            ? 'disputed'
            : b.status;
        return {
          ...b,
          yesVotes,
          noVotes,
          status,
          kind: vote === 'dog_bin' ? 'dog_waste' : b.kind,
          lastConfirmedAt: new Date().toISOString(),
        };
      })
    );
    if (selectedBin?.id === binId) {
      setSelectedBin((prev) =>
        prev
          ? {
              ...prev,
              yesVotes: vote !== 'no' ? prev.yesVotes + 1 : prev.yesVotes,
              status: 'verified',
            }
          : null
      );
    }
  };

  // Add crowd-sourced bin at current draft pin
  const handleAddCrowdBin = (e: React.FormEvent) => {
    e.preventDefault();
    const label =
      newBinName.trim() || `${draftContext.streetName} Crowd Bin`;
    const newBin: PublicBin = {
      id: `bin-crowd-${Date.now()}`,
      code: `Bin #C-${bins.length + 1}`,
      lat: draftCoords.lat,
      lng: draftCoords.lng,
      locationName: label,
      kind: newBinKind,
      source: 'crowd',
      status: 'unverified',
      yesVotes: 1,
      noVotes: 0,
      lastConfirmedAt: new Date().toISOString(),
      capacityStatus: 'SERVICED',
    };
    setBins((prev) => [newBin, ...prev]);
    setNewBinName('');
    setBinAddedFeedback(`Added ${newBin.code} (${label}) at ${draftCoords.lat.toFixed(4)}, ${draftCoords.lng.toFixed(4)}!`);
    setTimeout(() => setBinAddedFeedback(''), 4000);
  };

  // Email Builder (Graph Node E1 + N9 Verified Citations + N10 Auto-Stats)
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
    const focusReport = selectedReport ?? reports[0];

    let subject = `[Greystones Civic Audit] Dog Fouling Action Needed — ${analysis.totalActiveReports} Mapped Incidents (${analysis.nearBin50mPct}% Near Bins)`;
    let introParagraph = `I am writing as a resident of Greystones to raise urgent frustration over the volume and frequency of dog fouling across our footpaths, seafront promenade, and public spaces.`;

    if (selectedTemplateId === 'bin_mythbuster') {
      subject = `[Council Myth-Buster] ${analysis.nearBin50mPct}% of Greystones Dog Fouling Occurs Within 50m of a Public Bin`;
      introParagraph = `I am submitting empirical community evidence from the Clean Greystones Dog Fouling & Bin Audit Map. Any claim that dog fouling on our main routes is caused by a "long walk to a bin" is disproven by the map: ${analysis.nearBin15mCount} of ${analysis.totalActiveReports} active incidents (${analysis.nearBin15mPct}%) occurred within 15 metres of a public bin, and ${analysis.nearBin50mPct}% occurred within 50 metres.`;
    } else if (selectedTemplateId === 'wheel_contamination') {
      subject = `[Accessibility & Hygiene Hazard] ${analysis.highImpactCount} Buggy, Wheelchair & Footpath Contaminations in Greystones`;
      introParagraph = `Fed up with dog waste on footpaths, buggy wheels, and wheelchair wheels, residents have now geo-tagged ${analysis.totalActiveReports} incidents across Greystones — including ${analysis.bySeverity.wheelchair_wheels.count} direct wheelchair roll-throughs (♿), ${analysis.bySeverity.buggy_wheels.count} buggy/stroller wheel hits (👶), and ${analysis.bySeverity.stepped_in.count} pedestrian shoe contaminations (👟).`;
    } else if (selectedTemplateId === 'request_bin') {
      subject = `[Infrastructure Gap] Request for Dog-Waste Bins at Unserved Greystones Walking Routes (>200m from any bin)`;
      introParagraph = `While Greystones town centre and South Beach Promenade have 16 general litter bins (where enforcement is the primary gap), our spatial audit of OpenStreetMap and resident walks shows 0 dedicated dog-waste bins in the town and severe >200m bin gaps in outer walking routes including Kindlestown Woods (445m to nearest bin), Charlesland Spine Path (910m), and the Cliff Walk trailhead (235m).`;
    }

    const latestFocusBlock = focusReport
      ? `Latest Focus Incident (${focusReport.id.toUpperCase()}):
• Location: ${focusReport.streetName} (${focusReport.lat.toFixed(4)}° N, ${Math.abs(focusReport.lng).toFixed(4)}° W)
• Impact Severity: ${SEVERITY_META[focusReport.severity].emoji} ${SEVERITY_META[focusReport.severity].label}
• Distance to Nearest Council Bin: ${focusReport.dBinAllM} metres from ${focusReport.nearestBinCode}
• Resident Note: "${focusReport.note}"`
      : '';

    const citationsBlock = activeCitations
      .map((c) => `• ${c.code}: "${c.quote}"`)
      .join('\n');

    const body = `Dear Greystones Municipal District Councillors,

${introParagraph}

KEY TELEMETRY FROM CLEAN GREYSTONES LIVE MAP:
• Total Active Geo-Tagged Reports: ${analysis.totalActiveReports} incidents across Greystones
• Council Bin Proximity (Myth-Buster): ${analysis.nearBin15mPct}% (${analysis.nearBin15mCount} reports) are within 15m of a bin; ${analysis.nearBin50mPct}% are within 50m of a bin.
• Direct Physical Contamination: ${analysis.highImpactCount} incidents (${analysis.highImpactPct}%) involved wheelchair wheels (♿ ${analysis.bySeverity.wheelchair_wheels.count}), buggy wheels (👶 ${analysis.bySeverity.buggy_wheels.count}), or pedestrians stepping in waste (👟 ${analysis.bySeverity.stepped_in.count}).
• Primary Hotspot Beside Bins: ${topHotspot} (fouling repeatedly logged 4m–9m from serviced bins).
• Unserved Outer Routes (>200m from any bin): Kindlestown Woods, Charlesland Spine Path, and Cliff Walk Trailhead (${analysis.gt200mCount} reports >200m from a bin).

${latestFocusBlock}

STATUTORY & POLICY BASIS (VERIFIED):
${citationsBlock}

PRACTICAL ACTION REQUESTED AT THE NEXT GREYSTONES MD MEETING:
1. Targeted Warden Patrols: Deploy authorised litter/dog wardens and Greystones parking wardens (authorised under the Litter Pollution Acts per the 2026–2029 Plan) during peak dog-walking windows (Sat/Sun 08:00–13:00) on South Beach Promenade, Harbour Marina, and Church Road to enforce the €250 on-the-spot fine.
2. Infrastructure & Bin Audit: Publish Wicklow County Council's internal litter/dog-bin asset register for Greystones MD and install dedicated dog-waste bins at Kindlestown, Charlesland, and the Cliff Walk start.
3. Transparent Reporting: Separately record and publish s.22 dog-fouling fines issued in Greystones Municipal District.

We need meaningful enforcement and solutions, not simply more warning signs.

Kind regards,
${residentSignOff}`;

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
      charLength: mailtoHref.length,
    };
  }, [
    selectedCouncillorIds,
    selectedCcIds,
    selectedTemplateId,
    analysis,
    selectedReport,
    reports,
    activeCitations,
    residentSignOff,
  ]);

  const handleCopyFullEmail = async () => {
    const fullText = `To: ${generatedEmail.toEmails.join('; ')}\nCC: ${generatedEmail.ccEmails.join(
      '; '
    )}\nSubject: ${generatedEmail.subject}\n\n${generatedEmail.body}`;
    try {
      await navigator.clipboard.writeText(fullText);
      setEmailCopiedToast('Full email + councillor addresses copied to clipboard!');
      setEmailsDispatchedCount((c) => c + 1);
      setTimeout(() => setEmailCopiedToast(''), 4000);
    } catch {
      setEmailCopiedToast('Please select and copy the text from the preview box.');
    }
  };

  return (
    <div className="min-h-full h-full flex flex-col bg-background text-on-surface font-sans select-none">
      {/* Top App Bar (Civic Tide Design System) */}
      <header className="bg-surface shadow-sm z-40 shrink-0 border-b border-slate-200/80">
        <div className="flex justify-between items-center w-full px-4 py-2.5 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[22px]">location_on</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg sm:text-xl font-extrabold text-on-surface tracking-tight">
                  Clean Greystones
                </h1>
                <span className="bg-primary/10 text-primary font-display text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
                  LIVE EVIDENCE
                </span>
              </div>
              <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                <span>Greystones, Co. Wicklow</span>
                <span className="text-outline-variant">•</span>
                <span className="text-primary font-semibold">
                  {analysis.nearBin50mPct}% of Poos ≤50m from a Bin
                </span>
              </p>
            </div>
          </div>

          {/* Right Live Counter & Quick Campaign Action */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-error-container text-on-error-container px-3 py-1.5 rounded-full border border-error/20 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-error animate-ping" />
              <span className="font-display text-xs font-extrabold whitespace-nowrap">
                {analysis.totalActiveReports} Mapped Poos
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('council')}
              className="hidden sm:flex items-center gap-1.5 bg-[#d97706] hover:bg-[#b45309] text-white px-3.5 py-1.5 rounded-full font-display text-xs font-bold shadow-sm transition-transform active:scale-95"
            >
              <span className="material-symbols-outlined text-[16px]">campaign</span>
              <span>Bombard Council (6 Cllrs)</span>
            </button>
          </div>
        </div>
      </header>

      {/* ==================== TAB 1: INTERACTIVE GOOGLE MAP + 1-TAP LOG MODE ==================== */}
      {activeTab === 'map' && (
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Sub-header Filter Bar + Simple 1-Tap Mode Toggle */}
          <section className="bg-surface-container-lowest/95 backdrop-blur-md px-3 sm:px-4 py-2 z-30 shadow-xs border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                type="button"
                onClick={() => setMapFilter('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-bold shrink-0 transition-all ${
                  mapFilter === 'all'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/60'
                }`}
              >
                <span>All Poos</span>
                <span className="bg-black/15 px-1.5 py-0.2 rounded-full text-[10px]">
                  {analysis.totalActiveReports}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMapFilter('near_bins')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-bold shrink-0 transition-all ${
                  mapFilter === 'near_bins'
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/60'
                }`}
              >
                <span>🗑️ Near Bins (≤25m)</span>
                <span className="bg-emerald-700/20 text-emerald-950 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold">
                  {analysis.nearBin15mCount} ({analysis.nearBin15mPct}%)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMapFilter('wheels')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-bold shrink-0 transition-all ${
                  mapFilter === 'wheels'
                    ? 'bg-error text-white shadow-sm'
                    : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/60'
                }`}
              >
                <span>♿ 👶 Buggy / Wheelchair</span>
                <span className="bg-black/10 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {analysis.bySeverity.buggy_wheels.count +
                    analysis.bySeverity.wheelchair_wheels.count}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMapFilter('stepped_in')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-bold shrink-0 transition-all ${
                  mapFilter === 'stepped_in'
                    ? 'bg-error text-white shadow-sm'
                    : 'bg-error-container/40 text-on-error-container border border-error/20'
                }`}
              >
                <span>👟 Stepped In</span>
                <span className="bg-error/20 text-error px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {analysis.bySeverity.stepped_in.count}
                </span>
              </button>
            </div>

            {/* Bin Overlay & 1-Tap Mode Switcher */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setShowBinOverlay((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-xs font-display font-bold border flex items-center gap-1 transition-all ${
                  showBinOverlay
                    ? 'bg-emerald-50 border-primary text-primary'
                    : 'bg-slate-100 border-slate-300 text-slate-600'
                }`}
              >
                <span>🗑️ Bins ({bins.length})</span>
                <span>{showBinOverlay ? 'ON' : 'OFF'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowProximityLines((v) => !v)}
                className={`hidden md:flex px-2.5 py-1 rounded-lg text-xs font-display font-bold border items-center gap-1 transition-all ${
                  showProximityLines
                    ? 'bg-red-50 border-error/50 text-error'
                    : 'bg-slate-100 border-slate-300 text-slate-600'
                }`}
              >
                <span>📏 Bin Tether Lines</span>
              </button>

              <div className="bg-slate-200/80 p-0.5 rounded-xl flex items-center">
                <button
                  type="button"
                  onClick={() => setQuickOneTapMode(true)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-display font-bold flex items-center gap-1 transition-all ${
                    quickOneTapMode
                      ? 'bg-white text-primary shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>⚡ 1-Tap Click Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuickOneTapMode(false)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-display font-bold flex items-center gap-1 transition-all ${
                    !quickOneTapMode
                      ? 'bg-white text-primary shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>🎯 Position Pin</span>
                </button>
              </div>
            </div>
          </section>

          {/* Main Map Viewport */}
          <div className="relative flex-1 flex flex-col overflow-hidden">
            <GreystonesMapView
              reports={reports}
              bins={bins}
              activeFilter={mapFilter}
              showBinOverlay={showBinOverlay}
              showProximityLines={showProximityLines}
              selectedReport={selectedReport}
              onSelectReport={setSelectedReport}
              selectedBin={selectedBin}
              onSelectBin={setSelectedBin}
              draftCoords={draftCoords}
              onMapClickDropPin={handleMapClickDropPin}
              quickOneTapMode={quickOneTapMode}
              quickSeverity={selectedSeverity}
            />

            {/* Active Incident Callout Card (Floating Top-Left / Mobile Overlay) */}
            {selectedReport && !selectedBin && (
              <div className="absolute top-14 left-3 right-3 sm:right-auto sm:w-96 z-30 pointer-events-auto">
                <div className="bg-surface-container-lowest/98 backdrop-blur-md rounded-2xl p-3.5 border-2 border-error/70 shadow-xl">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="bg-error text-white font-display text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <span>
                          {SEVERITY_META[selectedReport.severity].emoji}{' '}
                          {SEVERITY_META[selectedReport.severity].shortLabel} #{selectedReport.id.replace('rep-', '')}
                        </span>
                      </span>
                      <span className="bg-surface-container text-on-surface-variant font-display text-[10px] px-2 py-0.5 rounded-full font-semibold">
                        {selectedReport.areaName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedReport(null)}
                      className="text-slate-400 hover:text-slate-700 text-xs font-bold px-1.5"
                      aria-label="Close incident card"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Proximity to Bin Callout Banner */}
                  <div
                    className={`${
                      selectedReport.dBinAllM <= 30
                        ? 'bg-error-container/45 border-error/30 text-on-error-container'
                        : 'bg-amber-50 border-amber-300 text-amber-950'
                    } border rounded-xl p-2.5 mb-2 flex items-center justify-between`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🗑️</span>
                      <div>
                        <p className="font-display text-xs font-extrabold leading-tight">
                          {selectedReport.dBinAllM} metres from Council {selectedReport.nearestBinCode}
                        </p>
                        <p className="text-[11px] opacity-85">
                          {selectedReport.dBinAllM <= 30
                            ? 'Council cannot claim lack of bins here!'
                            : 'Over 200m from nearest bin — bin gap area'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`${
                        selectedReport.dBinAllM <= 30 ? 'bg-error text-white' : 'bg-amber-700 text-white'
                      } text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0`}
                    >
                      {selectedReport.dBinAllM <= 30 ? 'BESIDE BIN' : 'NO BIN NEARBY'}
                    </span>
                  </div>

                  {selectedReport.note && (
                    <p className="text-xs text-on-surface italic leading-snug mb-2.5">
                      “{selectedReport.note}”
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-secondary/20 flex items-center justify-center text-[10px] font-bold text-secondary">
                        {selectedReport.reporterInitials}
                      </span>
                      <span className="text-[11px] text-secondary font-medium">
                        {selectedReport.confirmations} confirmations
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleConfirmExistingReport(selectedReport.id)}
                        className="bg-surface-container hover:bg-surface-container-high text-on-surface text-[11px] font-display font-bold px-2.5 py-1 rounded-lg transition-colors"
                      >
                        👍 Me Too (+1)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleClearedReport(selectedReport.id)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-primary border border-primary/30 text-[11px] font-display font-bold px-2.5 py-1 rounded-lg transition-colors"
                      >
                        {selectedReport.status === 'cleared' ? 'Re-open' : '✅ Mark Cleared'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('council')}
                        className="bg-[#d97706] hover:bg-[#b45309] text-white text-[11px] font-display font-bold px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Email Cllrs →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Selected Bin Callout Card */}
            {selectedBin && (
              <div className="absolute top-14 left-3 right-3 sm:right-auto sm:w-96 z-30 pointer-events-auto">
                <div className="bg-surface-container-lowest/98 backdrop-blur-md rounded-2xl p-3.5 border-2 border-primary shadow-xl">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-primary text-white font-display text-xs px-2.5 py-0.5 rounded-full font-bold">
                        🗑️ {selectedBin.code}
                      </span>
                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-primary">
                        {selectedBin.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedBin(null)}
                      className="text-slate-400 hover:text-slate-700 text-xs font-bold px-1.5"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="font-display text-sm font-bold text-on-surface">
                    {selectedBin.locationName}
                  </p>
                  <p className="text-xs text-secondary mt-0.5">
                    Source: {selectedBin.source.toUpperCase()}{' '}
                    {selectedBin.osmId ? `(${selectedBin.osmId})` : ''} • Confirmations:{' '}
                    {selectedBin.yesVotes} Yes / {selectedBin.noVotes} No
                  </p>
                  <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-on-surface-variant">
                      Is this bin here?
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleVoteBin(selectedBin.id, 'yes')}
                        className="bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
                      >
                        ✅ Yes ({selectedBin.yesVotes})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVoteBin(selectedBin.id, 'dog_bin')}
                        className="bg-emerald-100 text-primary text-[11px] font-bold px-2.5 py-1 rounded-lg"
                      >
                        🐕 Dog Bin
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVoteBin(selectedBin.id, 'no')}
                        className="bg-red-50 text-error text-[11px] font-bold px-2.5 py-1 rounded-lg"
                      >
                        ✕ Not Here
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Floating Bottom 1-Tap Action & Emoji Bar */}
            <div className="z-30 bg-surface-container-lowest border-t border-slate-200/90 rounded-t-3xl shadow-[0_-10px_28px_rgba(15,23,42,0.12)] px-4 pt-3 pb-20 shrink-0">
              <div className="max-w-screen-md mx-auto">
                {/* Instant 1-Tap Logged Toast Banner */}
                {lastLoggedReport && (
                  <div className="mb-2.5 p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-primary">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {SEVERITY_META[lastLoggedReport.severity].emoji}
                      </span>
                      <div>
                        <p className="font-display text-xs font-extrabold text-primary">
                          Logged #{lastLoggedReport.id.replace('rep-', '')} at{' '}
                          {lastLoggedReport.streetName}! ({lastLoggedReport.dBinAllM}m from{' '}
                          {lastLoggedReport.nearestBinCode})
                        </p>
                        <p className="text-[11px] text-primary/80">
                          Graph G1 Intake verified • Added to Greystones Council Evidence Dossier
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUndoLastDrop}
                        className="text-xs font-bold underline px-2 py-1 text-slate-700 hover:text-slate-900"
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('council')}
                        className="bg-primary text-white text-xs font-bold px-2.5 py-1 rounded-lg"
                      >
                        Email Council →
                      </button>
                    </div>
                  </div>
                )}

                {/* Emoji Severity Selector Pills (Just Poop, Stepped In, Buggy Wheels, Wheelchair) */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {(Object.keys(SEVERITY_META) as SeverityType[]).map((sevKey) => {
                      const meta = SEVERITY_META[sevKey];
                      const active = selectedSeverity === sevKey;
                      return (
                        <button
                          key={sevKey}
                          type="button"
                          onClick={() => setSelectedSeverity(sevKey)}
                          className={`px-3 py-1.5 rounded-full text-xs font-display font-bold flex items-center gap-1.5 shrink-0 transition-all active:scale-95 ${
                            active
                              ? 'bg-primary text-on-primary shadow-sm ring-2 ring-primary/30'
                              : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container border border-slate-200'
                          }`}
                        >
                          <span className="text-sm">{meta.emoji}</span>
                          <span>{meta.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-display font-bold text-primary bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
                    📏 {draftContext.dBinAllM}m from {draftContext.nearestAll.code}
                  </span>
                </div>

                {/* Primary Action Row: Massive 1-Tap Drop Poop Pin + Bombard Council Button */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      commitFoulingReport(
                        draftCoords.lat,
                        draftCoords.lng,
                        selectedSeverity
                      )
                    }
                    className="flex-[1.4] h-12 sm:h-13 bg-primary hover:bg-primary-container text-on-primary px-4 rounded-xl shadow-lg shadow-primary/25 flex items-center justify-center gap-2 font-display text-sm sm:text-base font-extrabold active:scale-[0.98] transition-all"
                  >
                    <span className="text-xl">{SEVERITY_META[selectedSeverity].emoji}</span>
                    <span>
                      DROP {SEVERITY_META[selectedSeverity].shortLabel.toUpperCase()} PIN (1-TAP)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('council')}
                    className="flex-1 bg-[#d97706] hover:bg-[#b45309] text-white h-12 sm:h-13 px-3.5 rounded-xl shadow-lg shadow-amber-600/25 flex items-center justify-between gap-1 font-display font-bold active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-1.5 text-left">
                      <span className="material-symbols-outlined text-[20px]">campaign</span>
                      <div className="leading-tight">
                        <span className="block text-xs font-extrabold uppercase tracking-tight">
                          Email Council
                        </span>
                        <span className="block text-[10px] opacity-95 font-medium">
                          Send Evidence (6 Reps)
                        </span>
                      </div>
                    </div>
                    <span className="bg-white text-[#d97706] font-extrabold text-[10px] px-1.5 py-0.5 rounded-full shrink-0 hidden sm:inline">
                      READY
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: DETAILED REPORT + GRAPH G1 INTAKE TRACE ==================== */}
      {activeTab === 'report' && (
        <main className="flex-1 overflow-y-auto max-w-screen-md w-full mx-auto px-4 pt-4 pb-28 space-y-5">
          <section className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl shadow-sm overflow-hidden">
            <div className="pt-3 pb-2.5 px-5 flex items-center justify-between border-b border-surface-container bg-surface-container-low/50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">
                  add_location_alt
                </span>
                <span className="font-display text-xs uppercase tracking-wider text-primary font-extrabold">
                  Live Pin Drop Audit (Graph G1 Intake)
                </span>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-error-container text-on-error-container font-bold">
                🚨 Active Hazard
              </span>
            </div>

            <div className="p-5 space-y-5">
              {/* Detected GPS & Nearest Bin Banner */}
              <div>
                <h2 className="font-display text-xl font-bold text-on-surface">
                  Report Dog Fouling at Selected Pin
                </h2>
                <div className="mt-2.5 flex items-start justify-between gap-2 bg-surface-container-low p-3.5 rounded-xl border border-secondary-fixed">
                  <div className="flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-primary mt-0.5 text-lg">
                      near_me
                    </span>
                    <div>
                      <p className="text-xs font-bold text-on-surface-variant uppercase">
                        Detected Greystones Location (Node N5 Snapped)
                      </p>
                      <p className="text-sm font-bold text-on-surface mt-0.5">
                        {draftContext.streetName}
                      </p>
                      <p className="text-xs text-outline mt-0.5">
                        Coordinates: {draftCoords.lat.toFixed(4)}° N,{' '}
                        {Math.abs(draftCoords.lng).toFixed(4)}° W • H3 Cell: {draftContext.h3Cell}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('map')}
                    className="text-xs font-display font-bold text-primary underline shrink-0"
                  >
                    Adjust on Map
                  </button>
                </div>
              </div>

              {/* Bin Proximity Callout Banner (Node N6) */}
              <div className="bg-emerald-50/90 border-l-4 border-primary p-3.5 rounded-r-xl shadow-xs">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl leading-none">🗑️</span>
                  <div>
                    <p className="font-display text-sm text-primary font-extrabold">
                      {draftContext.dBinAllM} metres from Public Council{' '}
                      {draftContext.nearestAll.code} ({draftContext.nearestAll.locationName})!
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5 font-medium">
                      {draftContext.dBinAllM <= 50
                        ? 'Council cannot claim lack of disposal facilities here — bin is right beside this incident.'
                        : 'Over 50m from the nearest mapped bin. Logged in the Bins-vs-Fouling distance distribution.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* 4-Card Severity Emoji Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-display text-sm text-on-surface font-bold">
                    Impact Severity Level (Select Emoji Pin)
                  </label>
                  <span className="text-xs text-error font-semibold">Tap to select impact</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {(Object.keys(SEVERITY_META) as SeverityType[]).map((sevKey) => {
                    const meta = SEVERITY_META[sevKey];
                    const isSelected = selectedSeverity === sevKey;
                    return (
                      <button
                        key={sevKey}
                        type="button"
                        onClick={() => setSelectedSeverity(sevKey)}
                        className={`relative flex flex-col text-left p-3.5 rounded-xl transition-all active:scale-95 ${
                          isSelected
                            ? 'border-2 border-primary bg-primary/10 ring-2 ring-primary/25 shadow-sm'
                            : 'border border-outline-variant/60 bg-surface-container-lowest hover:bg-surface-container-low'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-2.5 right-2.5 flex items-center justify-center w-5 h-5 bg-primary text-on-primary rounded-full">
                            <span className="material-symbols-outlined text-xs font-bold">
                              check
                            </span>
                          </div>
                        )}
                        <span className="text-2xl mb-1">{meta.emoji}</span>
                        <span className="font-display text-sm font-bold text-on-surface">
                          {meta.shortLabel}
                        </span>
                        <span className="text-xs text-on-surface-variant mt-0.5">
                          {meta.subtext}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Resident Note & GDPR / Anti-Shaming Guardrails (Node N13) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="incident-note"
                    className="font-display text-sm text-on-surface font-bold"
                  >
                    Observation Note (Optional, max 140 chars)
                  </label>
                  <span className="text-xs text-outline">{draftNote.length}/140</span>
                </div>
                <textarea
                  id="incident-note"
                  rows={2}
                  maxLength={140}
                  value={draftNote}
                  onChange={(e) => setDraftNote(e.target.value)}
                  placeholder="e.g., Buggy wheel rolled right through mess 5m from Bin #G-14 on South Beach Prom..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="reporter-initials"
                    className="text-xs font-semibold text-on-surface-variant"
                  >
                    Your Initials (anonymous badge):
                  </label>
                  <input
                    id="reporter-initials"
                    type="text"
                    maxLength={4}
                    value={draftReporterInitials}
                    onChange={(e) => setDraftReporterInitials(e.target.value.toUpperCase())}
                    className="w-20 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-on-surface"
                  />
                  <span className="text-[11px] text-outline">
                    GDPR Guardrail: No owner names, house numbers, or reg plates.
                  </span>
                </div>

                {noteWarnings.length > 0 && (
                  <div className="p-3 bg-error-container text-on-error-container rounded-xl text-xs font-semibold space-y-1">
                    {noteWarnings.map((w, idx) => (
                      <p key={idx}>⚠️ {w}</p>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Incident CTA */}
              <button
                type="button"
                onClick={() => {
                  commitFoulingReport(
                    draftCoords.lat,
                    draftCoords.lng,
                    selectedSeverity,
                    draftNote
                  );
                }}
                className="w-full py-3.5 px-4 bg-primary hover:bg-primary-container text-on-primary font-display text-sm rounded-xl font-extrabold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                <span>Submit Incident & Add to Greystones Municipal Dossier</span>
              </button>
            </div>
          </section>

          {/* Graph Run Audit Inspector (GRAPH_DESIGN.md verification) */}
          {lastGraphRun && (
            <section className="bg-surface-container-lowest border border-primary/30 rounded-2xl p-4 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-extrabold uppercase tracking-wider text-primary">
                  Graph G1 Intake Execution Checkpoint ({lastGraphRun.runId})
                </span>
                <span className="text-[11px] font-bold bg-emerald-100 text-primary px-2 py-0.5 rounded-full">
                  COMMITTED: {lastGraphRun.n7Commit.status.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-surface-container-low">
                  <strong className="block text-on-surface">N1 Validate & Rate Limit:</strong>
                  <span className="text-on-surface-variant">{lastGraphRun.n1Validate.reason}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-container-low">
                  <strong className="block text-on-surface">N5 PostGIS / OSM Snap:</strong>
                  <span className="text-on-surface-variant">{lastGraphRun.n5Snap.street}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-container-low sm:col-span-2">
                  <strong className="block text-on-surface">
                    N6 Nearest-Bin KNN Distance & Self-Prompting Edge:
                  </strong>
                  <span className="text-on-surface-variant">
                    {lastGraphRun.n6BinDist.distanceM}m to {lastGraphRun.n6BinDist.nearestBinCode} •{' '}
                    {lastGraphRun.n6BinDist.isNearBinMythbuster
                      ? 'Flagged as "Near Bin Still Fouled (<25m)" myth-buster evidence!'
                      : 'Logged in distance distribution'}
                  </span>
                </div>
              </div>
            </section>
          )}
        </main>
      )}

      {/* ==================== TAB 3: BINS AUDIT & HOTSPOT INTELLIGENCE (PRD §5 & §6) ==================== */}
      {activeTab === 'bins' && (
        <main className="flex-1 overflow-y-auto max-w-screen-md w-full mx-auto px-4 pt-4 pb-28 space-y-5">
          {/* Executive Summary KPIs (3-Card Bento Grid from Stitch civic_metrics_hotspot_intelligence) */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Card 1: Total Fouling */}
            <article className="bg-surface-container-lowest border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[11px] text-secondary uppercase font-bold tracking-wider">
                    Reported Volume
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-xs font-bold text-error bg-red-50 px-2 py-0.5 rounded-full">
                    Active Tally
                  </span>
                </div>
                <h2 className="font-display text-3xl text-on-surface font-extrabold tracking-tight">
                  {analysis.totalActiveReports}
                </h2>
                <p className="font-display text-sm text-on-surface font-bold">
                  Mapped Greystones Poos
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-secondary">
                <span>16 OSM Waste Bins</span>
                <span className="text-primary font-semibold">Greystones MD</span>
              </div>
            </article>

            {/* Card 2: Proximity to Council Bins (Council Myth-Buster) */}
            <article className="bg-surface-container-lowest border-2 border-primary/30 rounded-2xl p-4 shadow-sm flex flex-col justify-between bg-gradient-to-br from-white to-emerald-50/50">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[11px] text-primary font-extrabold uppercase tracking-wider">
                    Council Myth-Buster
                  </span>
                  <span className="font-display text-[10px] bg-primary text-white px-2 py-0.5 rounded-full font-bold">
                    Critical Stat
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <h2 className="font-display text-3xl text-primary font-extrabold tracking-tight">
                    {analysis.nearBin50mPct}%
                  </h2>
                  <span className="font-display text-sm font-bold text-on-surface">
                    ≤50m from Bin
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant leading-snug">
                  <strong className="text-on-surface font-bold">
                    {analysis.nearBin15mCount} of {analysis.totalActiveReports}
                  </strong>{' '}
                  incidents ({analysis.nearBin15mPct}%) occurred within{' '}
                  <span className="underline decoration-primary font-bold">15 metres</span> of a
                  public bin.
                </p>
              </div>
              <div className="mt-3 pt-2 text-[11px] text-primary bg-primary/10 rounded-lg p-2 font-semibold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">policy</span>
                <span>Disproves "no bins on seafront" excuse</span>
              </div>
            </article>

            {/* Card 3: High Impact Hazards (Wheels & Shoes) */}
            <article className="bg-surface-container-lowest border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[11px] text-secondary uppercase font-bold tracking-wider">
                    Wheel & Shoe Hits
                  </span>
                  <span className="font-display text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                    High Hazard
                  </span>
                </div>
                <h2 className="font-display text-3xl text-amber-600 font-extrabold tracking-tight">
                  {analysis.highImpactCount}
                </h2>
                <p className="font-display text-sm text-on-surface font-bold">
                  Stepped In / Buggy / Wheelchair
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-secondary">
                <span>{analysis.highImpactPct}% contamination rate</span>
                <span className="text-error font-bold">♿ 👶 👟</span>
              </div>
            </article>
          </section>

          {/* Category Contamination Breakdown Bars */}
          <section className="bg-surface-container-lowest border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3.5">
            <div>
              <h3 className="font-display text-base font-bold text-on-surface">
                Category Contamination Breakdown
              </h3>
              <p className="text-xs text-secondary">
                Breakdown by emoji pin type across Greystones footpaths & promenade
              </p>
            </div>

            <div className="space-y-3">
              {(Object.keys(SEVERITY_META) as SeverityType[]).map((sevKey) => {
                const meta = SEVERITY_META[sevKey];
                const stat = analysis.bySeverity[sevKey];
                return (
                  <div key={sevKey} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-display">
                      <span className="flex items-center gap-1.5 text-on-surface font-bold">
                        <span className="text-base">{meta.emoji}</span> {meta.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-secondary font-medium">{stat.count} incidents</span>
                        <span className="bg-surface-container text-on-surface px-1.5 py-0.5 rounded font-bold">
                          {stat.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          sevKey === 'wheelchair_wheels'
                            ? 'bg-error'
                            : sevKey === 'buggy_wheels'
                            ? 'bg-orange-500'
                            : sevKey === 'stepped_in'
                            ? 'bg-amber-500'
                            : 'bg-primary'
                        }`}
                        style={{ width: `${Math.max(stat.pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Dual Honest Hotspot Lists (PRD §6: Both Near-Bin and Far-From-Bin Always Shown) */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* List A: Hotspots WITH Bins (<50m) that are STILL fouled */}
            <div className="bg-surface-container-lowest border border-error/30 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="bg-error-container text-on-error-container font-display text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                  🔥 BIN PRESENT, STILL FOULED (≤50m)
                </span>
                <span className="text-xs font-bold text-error">Needs Warden Patrols</span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Hotspots where public bins are right beside the mess — proving the council cannot blame bin distance:
              </p>
              <div className="space-y-2">
                {analysis.nearBinHotspots.map((h) => (
                  <div
                    key={h.areaName}
                    className="p-2.5 rounded-xl bg-surface-container-low flex items-center justify-between"
                  >
                    <div>
                      <p className="font-display text-xs font-bold text-on-surface">
                        {h.areaName}
                      </p>
                      <p className="text-[11px] text-secondary">
                        Closest report: <strong>{h.minBinDistM}m</strong> from {h.nearestBinCode}
                      </p>
                    </div>
                    <span className="bg-error text-white font-display text-xs font-extrabold px-2.5 py-1 rounded-lg">
                      {h.count} poos
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* List B: Hotspots FAR From Any Bin (>200m) */}
            <div className="bg-surface-container-lowest border border-amber-300 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="bg-amber-100 text-amber-900 font-display text-[11px] font-extrabold px-2.5 py-0.5 rounded-full">
                  📍 CANDIDATE BIN GAPS (&gt;200m)
                </span>
                <span className="text-xs font-bold text-amber-800">0 Dog Bins Mapped</span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Per OpenStreetMap Overpass audit (`osm_bins_2026-10-16.geojson`), outer routes have zero mapped dog bins:
              </p>
              <div className="space-y-2">
                {analysis.farFromBinHotspots.map((h) => (
                  <div
                    key={h.areaName}
                    className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/70 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-display text-xs font-bold text-on-surface">
                        {h.areaName}
                      </p>
                      <p className="text-[11px] text-amber-900">
                        Nearest bin is <strong>{h.minBinDistM}m away</strong>
                      </p>
                    </div>
                    <span className="bg-amber-600 text-white font-display text-xs font-extrabold px-2.5 py-1 rounded-lg">
                      {h.count} poos
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Crowd-Sourced Bin Verification & Add Missing Bin Form (PRD §5) */}
          <section className="bg-surface-container-lowest border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-display text-base font-bold text-on-surface">
                  Public Bin Layer & Crowd Verification ({bins.length} Bins)
                </h3>
                <p className="text-xs text-secondary">
                  Seeded from 2026-10-16 Overpass GeoJSON (16 waste_basket + 2 bring banks) + resident confirmations
                </p>
              </div>
            </div>

            {/* Add Missing Bin Form */}
            <form
              onSubmit={handleAddCrowdBin}
              className="p-3.5 rounded-xl bg-surface-container-low border border-slate-200 space-y-2.5"
            >
              <p className="font-display text-xs font-bold text-primary uppercase">
                + Spot an Unmapped Council Bin? Add it to the Map
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newBinName}
                  onChange={(e) => setNewBinName(e.target.value)}
                  placeholder="Bin location (e.g., Burnaby Park South Gate)"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs text-on-surface"
                />
                <select
                  value={newBinKind}
                  onChange={(e) =>
                    setNewBinKind(e.target.value as 'general' | 'dog_waste' | 'bag_dispenser')
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-on-surface bg-white"
                >
                  <option value="general">🗑️ General Litter Bin</option>
                  <option value="dog_waste">🐕 Dedicated Dog-Waste Bin</option>
                  <option value="bag_dispenser">🛍️ Poo-Bag Dispenser</option>
                </select>
                <button
                  type="submit"
                  className="bg-primary text-white font-display text-xs font-bold px-4 py-2 rounded-lg hover:bg-primary-container shrink-0"
                >
                  Add Bin at Pin
                </button>
              </div>
              {binAddedFeedback && (
                <p className="text-xs font-bold text-primary">{binAddedFeedback}</p>
              )}
            </form>

            {/* Bin Directory Table */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {bins.map((bin) => (
                <div
                  key={bin.id}
                  className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display text-xs font-bold text-on-surface">
                        {bin.code}: {bin.locationName}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          bin.status === 'verified'
                            ? 'bg-emerald-100 text-primary'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {bin.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-secondary mt-0.5">
                      {bin.lat.toFixed(4)}° N, {Math.abs(bin.lng).toFixed(4)}° W • Source:{' '}
                      {bin.source.toUpperCase()} • Votes: {bin.yesVotes} yes / {bin.noVotes} no
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleVoteBin(bin.id, 'yes')}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-primary text-xs font-bold border border-emerald-200"
                    >
                      Confirm ({bin.yesVotes})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {/* ==================== TAB 4: BOMBARD COUNCIL EMAIL BUILDER & WATCHDOG (PRD §3.2, §4, §7) ==================== */}
      {activeTab === 'council' && (
        <main className="flex-1 overflow-y-auto max-w-screen-md w-full mx-auto px-4 pt-4 pb-28 space-y-6">
          {/* Bombard Council Action Campaign Hub */}
          <section className="bg-surface-container-lowest border-2 border-primary/25 rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-tertiary-fixed text-on-tertiary-fixed font-display font-bold">
                  ⚡ Direct Civic Action Hub (30-Second Email)
                </span>
                <span className="font-display text-xs text-primary font-extrabold">
                  {emailsDispatchedCount} Resident Emails Prepared
                </span>
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-on-surface">
                Send Overwhelming Visual & Spatial Evidence to Greystones Councillors
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant">
                Auto-populates live Greystones fouling counts, exact bin-proximity stats (proving{' '}
                <strong>{analysis.nearBin50mPct}%</strong> of poos happen within 50m of a bin), and
                verified Irish statutory citations (`s.22 Litter Pollution Act 1997` & the `€250`
                fixed penalty). Nothing is sent automatically — you review and press Send in your
                own email app.
              </p>
            </div>

            {/* 1. Template Selector */}
            <div className="space-y-2">
              <label className="font-display text-xs font-extrabold uppercase tracking-wider text-secondary">
                1. Choose Evidence Template & Tone
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EMAIL_TEMPLATES.map((tpl) => {
                  const active = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        active
                          ? 'border-2 border-primary bg-primary/10 shadow-xs'
                          : 'border-slate-200 bg-surface hover:bg-surface-container-low'
                      }`}
                    >
                      <p className="font-display text-xs font-extrabold text-on-surface">
                        {tpl.label}
                      </p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">{tpl.shortDesc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Target List: 6 Elected Greystones MD Councillors */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-display text-xs font-extrabold uppercase tracking-wider text-secondary">
                  2. Greystones Municipal District Councillors ({selectedCouncillorIds.length} of 6
                  Selected)
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
                  className="text-xs font-bold text-primary underline"
                >
                  {selectedCouncillorIds.length === GREYSTONES_COUNCILLORS.length
                    ? 'Deselect All'
                    : 'Select All 6'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                        checked
                          ? 'bg-emerald-50/60 border-primary/40'
                          : 'bg-surface border-slate-200 opacity-65'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-surface-container-high text-primary flex items-center justify-center font-display font-extrabold text-xs shrink-0">
                          {cllr.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-display text-xs font-bold text-on-surface truncate">
                            {cllr.name}
                          </p>
                          <p className="text-[10px] text-outline truncate">
                            {cllr.party} • {cllr.email}
                          </p>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-primary text-lg shrink-0">
                        {checked ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* CC Statutory Council Contacts */}
              <div className="pt-2 flex flex-wrap gap-2">
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
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-semibold border flex items-center gap-1 ${
                        checked
                          ? 'bg-surface-container-high border-primary/30 text-on-surface'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      <span>{checked ? '☑' : '☐'}</span>
                      <span>CC: {cc.email}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Sign-Off Name (Local Only) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label
                htmlFor="resident-signoff"
                className="font-display text-xs font-bold text-secondary shrink-0"
              >
                Sign email as (local only, never stored):
              </label>
              <input
                id="resident-signoff"
                type="text"
                value={residentSignOff}
                onChange={(e) => setResidentSignOff(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-on-surface"
              />
            </div>

            {/* 4. Prepared Formal Evidence Email Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-display text-xs font-extrabold uppercase tracking-wider text-secondary">
                  3. Prepared Formal Evidence Dossier Preview
                </label>
                <span className="text-[11px] text-primary font-semibold">
                  {activeCitations.length} Verified Citations Attached (Node N9)
                </span>
              </div>
              <div className="bg-surface-container-low/90 border border-outline-variant/60 rounded-xl p-3.5 space-y-2">
                <div className="border-b border-outline-variant/40 pb-2 text-xs">
                  <p className="text-outline font-bold">
                    TO: <span className="text-on-surface">{generatedEmail.toEmails.join(', ')}</span>
                  </p>
                  <p className="text-outline font-bold mt-0.5">
                    CC: <span className="text-on-surface">{generatedEmail.ccEmails.join(', ')}</span>
                  </p>
                  <p className="font-display font-bold text-error mt-1">
                    SUBJECT: {generatedEmail.subject}
                  </p>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-on-surface leading-relaxed max-h-64 overflow-y-auto">
                  {generatedEmail.body}
                </pre>
              </div>
            </div>

            {/* Primary Send & Copy Buttons */}
            <div className="space-y-2.5 pt-1">
              <a
                href={generatedEmail.mailtoHref}
                onClick={() => setEmailsDispatchedCount((c) => c + 1)}
                className="w-full py-3.5 px-4 bg-[#d97706] hover:bg-[#b45309] text-white font-display text-sm rounded-xl font-extrabold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 text-center"
              >
                <span className="material-symbols-outlined text-lg">mail</span>
                <span>Open Ready-to-Send Email in Your Mail App ({generatedEmail.toEmails.length} Cllrs)</span>
              </a>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyFullEmail}
                  className="py-2.5 px-3 bg-surface hover:bg-surface-container border border-outline text-on-surface font-display text-xs rounded-xl font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">content_copy</span>
                  <span>Copy Full Email & Addresses</span>
                </button>
                <a
                  href={generatedEmail.gmailHref}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-3 bg-surface hover:bg-surface-container border border-outline text-on-surface font-display text-xs rounded-xl font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5 text-center"
                >
                  <span className="material-symbols-outlined text-base">open_in_new</span>
                  <span>Compose in Gmail Web</span>
                </a>
              </div>

              {emailCopiedToast && (
                <p className="text-xs font-bold text-primary text-center bg-emerald-50 py-2 rounded-lg border border-emerald-200">
                  ✅ {emailCopiedToast}
                </p>
              )}

              <p className="text-[11px] text-secondary text-center">
                Official Wicklow Litter Line: <strong>Freephone 1800 365 123</strong> • Waste
                Management: <strong>0404 20127</strong>
              </p>
            </div>
          </section>

          {/* Council Minutes & Statutory Record Watchdog (from Stitch council_minutes_public_record_tracker) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-extrabold text-on-surface">
                  Wicklow Policy & Statutory Record Watchdog
                </h3>
                <p className="text-xs text-secondary">
                  Verified citations & public audit findings (Graph Node N9 — only VERIFIED sources shown)
                </p>
              </div>
              <span className="text-xs font-bold text-primary bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Verified 16 Oct 2026
              </span>
            </div>

            <div className="space-y-3">
              {HANSARD_RECORDS.map((rec) => (
                <article
                  key={rec.id}
                  className="bg-surface-container-lowest rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface font-display text-[11px] font-bold">
                        {rec.body}
                      </span>
                      <span className="text-xs text-outline">{rec.date}</span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-display text-[11px] font-bold ${
                        rec.statusTone === 'error'
                          ? 'bg-error-container text-on-error-container'
                          : rec.statusTone === 'success'
                          ? 'bg-emerald-100 text-primary'
                          : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      <span>{rec.statusEmoji}</span>
                      <span>{rec.statusLabel}</span>
                    </span>
                  </div>

                  <div>
                    <h4 className="font-display text-sm font-bold text-on-surface">{rec.title}</h4>
                    <p className="text-xs text-secondary mt-0.5">{rec.summary}</p>
                  </div>

                  <div className="bg-surface-container-low rounded-xl p-3 border-l-4 border-primary text-xs text-on-surface">
                    <p className="font-display text-[10px] text-primary font-extrabold uppercase mb-1">
                      {rec.quoteHeader}
                    </p>
                    <p className="italic text-on-surface-variant leading-relaxed">
                      “{rec.quoteText}”
                    </p>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-xs text-outline">
                    <span>{rec.footerMeta}</span>
                    <a
                      href={rec.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary font-display font-bold hover:underline flex items-center gap-1"
                    >
                      <span>Verify Official Source</span>
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}

      {/* Bottom Navigation Bar (4 Destinations matching Stitch Design System) */}
      <nav
        aria-label="Main Navigation"
        className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-3 py-1.5 bg-surface-container-lowest shadow-[0_-4px_12px_rgba(15,23,42,0.08)] border-t border-slate-200/80"
      >
        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all active:scale-95 ${
            activeTab === 'map'
              ? 'bg-primary-container text-on-primary-container font-bold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">map</span>
          <span className="font-display text-[11px] mt-0.5">Map & 1-Tap</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('report')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all active:scale-95 ${
            activeTab === 'report'
              ? 'bg-primary-container text-on-primary-container font-bold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">add_location_alt</span>
          <span className="font-display text-[11px] mt-0.5">Report</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bins')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all active:scale-95 ${
            activeTab === 'bins'
              ? 'bg-primary-container text-on-primary-container font-bold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">delete_outline</span>
          <span className="font-display text-[11px] mt-0.5">Bins & Stats</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('council')}
          className={`flex flex-col items-center justify-center rounded-xl px-4 py-1 transition-all active:scale-95 relative ${
            activeTab === 'council'
              ? 'bg-primary-container text-on-primary-container font-bold shadow-xs'
              : 'text-on-surface-variant hover:bg-surface-container'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">send</span>
          <span className="font-display text-[11px] mt-0.5">Email Council</span>
        </button>
      </nav>
    </div>
  );
}
export default App;
