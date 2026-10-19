export type SeverityType = 'just_poop' | 'stepped_in' | 'buggy_wheels' | 'wheelchair_wheels';

export type ReportStatus = 'spotted' | 'stale' | 'pending' | 'merged';

export type CivicAppStream = 'clean_greystones' | 'greystones_roads';

export interface FoulingReport {
  id: string;
  appStream?: CivicAppStream;
  createdAt: string; // ISO
  lat: number;
  lng: number;
  accuracyM: number;
  streetName: string;
  areaName: string;
  routeCode?: string;
  h3Cell: string;
  severity: SeverityType;
  status: ReportStatus;
  confirmations: number;
  note?: string;
  damageEuro?: number;
  depthCm?: number;
  submitterToken: string; // Provable unique anonymous device identifier (no PII)
  nearestBinId: string;
  nearestBinCode: string;
  dBinAllM: number;
  dBinVerifiedM: number;
  hasPhoto?: boolean;
  photoDataUrl?: string;
  photoCaption?: string;
  isSeededDemo?: boolean;
  mergedIntoId?: string;
  lastConfirmedAt?: string;
  additionalSubmitters?: string[];
}

export type BinKind = 'general' | 'dog_waste' | 'bag_dispenser' | 'recycling';
export type BinSource = 'osm' | 'crowd' | 'council';
export type BinStatus = 'unverified' | 'verified' | 'disputed' | 'removed';

export interface PublicBin {
  id: string;
  code: string;
  osmId?: string;
  lat: number;
  lng: number;
  locationName: string;
  kind: BinKind;
  source: BinSource;
  status: BinStatus;
  yesVotes: number;
  noVotes: number;
  lastConfirmedAt: string;
  capacityStatus?: 'EMPTY' | 'SERVICED' | 'OVERFLOWING';
}

export interface Councillor {
  id: string;
  name: string;
  initials: string;
  party: string;
  district: string;
  roleNote: string;
  email: string;
  motionsRaised: number;
  motionsCarried: number;
  latestMotion: string;
  followUpNote: string;
  isDefaultSelected: boolean;
}

export interface LegalCitation {
  id: string;
  code: string;
  title: string;
  quote: string;
  sourceUrl: string;
  status: 'verified' | 'unverified';
  verifiedAt: string;
  tags: ('always' | 'beach' | 'park' | 'bin_request' | 'enforcement')[];
}

export interface HansardRecord {
  id: string;
  body: 'Greystones MD' | 'Wicklow Plenary';
  date: string;
  statusLabel: string;
  statusTone: 'error' | 'success' | 'neutral';
  statusEmoji: string;
  title: string;
  summary: string;
  quoteHeader: string;
  quoteText: string;
  footerMeta: string;
  pdfUrl: string;
}

export type EmailTemplateId =
  | 'practical_action'
  | 'hotspot_evidence'
  | 'bin_mythbuster'
  | 'wheel_contamination'
  | 'request_bin';

export interface EmailTemplateOption {
  id: EmailTemplateId;
  label: string;
  shortDesc: string;
  intent: 'enforcement' | 'bin_request' | 'general';
}

export interface GraphRunSummary {
  runId: string;
  reportId: string;
  submitterToken: string;
  timestamp: string;
  n1Validate: { ok: boolean; reason: string };
  n4Dedupe: { action: 'new' | 'confirm' | 'merge'; targetId?: string; distanceM?: number };
  n5Snap: { snapped: boolean; street: string };
  n6BinDist: {
    nearestBinCode: string;
    distanceM: number;
    isNearBinMythbuster: boolean;
    promptType: 'confirm_bin' | 'survey_cell' | 'none';
  };
  n7Commit: { status: ReportStatus };
}

export type MapTimeRange = 'today' | 'week';

export interface DailyFoulingSnapshot {
  date: string; // YYYY-MM-DD
  generatedAt: string; // ISO
  totalReports: number;
  distinctSubmitters: number;
  highImpactCount: number;
  nearBin15mCount: number;
  nearBin50mCount: number;
  nearBin50mPct: number;
  topHotspots: { areaName: string; streetName: string; count: number }[];
  reportIds: string[];
}

export interface WeeklyEvidenceSummary {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  totalReports: number;
  distinctSubmitters: number;
  todayCount: number;
  highImpactCount: number;
  nearBin50mPct: number;
  dailyBreakdown: { date: string; dayLabel: string; count: number }[];
  topHotspots: { areaName: string; streetName: string; count: number }[];
}

export type CivicEventType =
  | 'email_council_mailto'
  | 'email_council_copy'
  | 'email_council_gmail'
  | 'report_logged'
  | 'report_corroborated'
  | 'report_deleted';

export interface CivicActionEvent {
  id: string;
  type: CivicEventType;
  submitterToken: string;
  timestamp: string; // ISO
  appStream?: CivicAppStream;
  metadata?: {
    targetButton?: 'mailto' | 'copy' | 'gmail';
    councillorCount?: number;
    councillors?: string[];
    templateId?: string;
    templateLabel?: string;
    subject?: string;
    reportId?: string;
    streetName?: string;
    areaName?: string;
    severity?: SeverityType;
    nearestBinCode?: string;
    userAgent?: string;
  };
}

export interface ProductMetricsSummary {
  dau: number; // Daily Active Users (last 24 hours)
  wau: number; // Weekly Active Users (last 7 days)
  mau: number; // Monthly Active Users (last 30 days)
  totalUniqueTokens: number;
  totalEmailClicks: number;
  mailtoClicks: number;
  copyClicks: number;
  gmailClicks: number;
  uniqueEmailSenders: number;
  emailConversionRate: number; // % of total unique users who clicked email
  totalPoosLogged: number;
  avgPoosPerDay: number;
  dailyPoos: {
    date: string;
    dayLabel: string;
    count: number;
    highImpactCount: number;
    distinctSubmitters: number;
  }[];
  monthlyPoos: {
    month: string;
    monthLabel: string;
    count: number;
    distinctSubmitters: number;
  }[];
  emailLedger: CivicActionEvent[];
  corroborationRate: number;
  highImpactPct: number;
  nearBin50mPct: number;
}

