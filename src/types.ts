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
