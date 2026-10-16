import { FoulingReport, LegalCitation, PublicBin, SeverityType } from '../types';

export const SEVERITY_META: Record<
  SeverityType,
  {
    emoji: string;
    shortLabel: string;
    label: string;
    subtext: string;
    badgeBg: string;
    badgeText: string;
    borderClass: string;
    isHighImpact: boolean;
  }
> = {
  just_poop: {
    emoji: '💩',
    shortLabel: 'Just Poop',
    label: 'Just Poop (Uncollected)',
    subtext: 'Left on path or promenade',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    borderClass: 'border-amber-700',
    isHighImpact: false,
  },
  stepped_in: {
    emoji: '👟',
    shortLabel: 'Stepped In',
    label: 'Stepped In by Pedestrian',
    subtext: 'Footwear contaminated on route',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-900',
    borderClass: 'border-error',
    isHighImpact: true,
  },
  buggy_wheels: {
    emoji: '👶',
    shortLabel: 'Buggy Wheels',
    label: 'Stroller / Buggy Wheels',
    subtext: 'Wheel caught in mess — brought home',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-900',
    borderClass: 'border-tertiary-container',
    isHighImpact: true,
  },
  wheelchair_wheels: {
    emoji: '♿',
    shortLabel: 'Wheelchair',
    label: 'Wheelchair Contamination',
    subtext: 'Direct wheel roll-through — severe hazard',
    badgeBg: 'bg-error',
    badgeText: 'text-white',
    borderClass: 'border-error',
    isHighImpact: true,
  },
};

/**
 * Haversine distance in metres between two WGS84 coordinates (deterministic PostGIS ST_Distance equivalent).
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Deterministic spatial cell identifier (H3-r9 style ~100m grid over Greystones)
 */
export function computeGreystonesCell(lat: number, lng: number): string {
  const latIdx = Math.floor((lat - 53.12) * 500);
  const lngIdx = Math.floor((lng + 6.11) * 500);
  return `891e204${Math.abs(latIdx).toString(16).padStart(2, '0')}${Math.abs(lngIdx).toString(16).padStart(2, '0')}ffff`;
}

/**
 * Graph Node N5: Snap to known Greystones street / coastal landmark based on coordinates
 */
export function inferGreystonesLocation(lat: number, lng: number): {
  streetName: string;
  areaName: string;
  locationType: 'beach' | 'park' | 'road';
} {
  const landmarks: {
    lat: number;
    lng: number;
    streetName: string;
    areaName: string;
    locationType: 'beach' | 'park' | 'road';
  }[] = [
    {
      lat: 53.1442,
      lng: -6.0604,
      streetName: 'South Beach Promenade (near Lifeguard Hut)',
      areaName: 'South Beach Prom',
      locationType: 'beach',
    },
    {
      lat: 53.1422,
      lng: -6.0593,
      streetName: 'South Beach Car Park & Slipway',
      areaName: 'South Beach Prom',
      locationType: 'beach',
    },
    {
      lat: 53.1495,
      lng: -6.0618,
      streetName: 'Greystones Harbour Marina Boardwalk',
      areaName: 'Harbour Marina Walk',
      locationType: 'beach',
    },
    {
      lat: 53.1518,
      lng: -6.0652,
      streetName: 'Cliff Walk Southern Trailhead',
      areaName: 'Cliff Walk Start',
      locationType: 'beach',
    },
    {
      lat: 53.1462,
      lng: -6.0638,
      streetName: 'Church Road (near DART Station & Bakery)',
      areaName: 'Church Road',
      locationType: 'road',
    },
    {
      lat: 53.1475,
      lng: -6.0692,
      streetName: 'Church Road Upper (St. Killian’s Approach)',
      areaName: 'Church Road',
      locationType: 'road',
    },
    {
      lat: 53.1448,
      lng: -6.0658,
      streetName: 'Burnaby Park Playground Gate',
      areaName: 'Burnaby Park',
      locationType: 'park',
    },
    {
      lat: 53.1398,
      lng: -6.0585,
      streetName: 'The Cove & Ladies Cove Walkway',
      areaName: 'The Cove',
      locationType: 'beach',
    },
    {
      lat: 53.1325,
      lng: -6.0675,
      streetName: 'Charlesland Spine Road Footpath',
      areaName: 'Charlesland',
      locationType: 'park',
    },
    {
      lat: 53.1468,
      lng: -6.0772,
      streetName: 'Kindlestown Woods & Tesco Approach',
      areaName: 'Kindlestown',
      locationType: 'park',
    },
  ];

  let best = landmarks[0];
  let bestDist = Infinity;
  for (const lm of landmarks) {
    const d = haversineDistanceMeters(lat, lng, lm.lat, lm.lng);
    if (d < bestDist) {
      bestDist = d;
      best = lm;
    }
  }
  return {
    streetName: best.streetName,
    areaName: best.areaName,
    locationType: best.locationType,
  };
}

/**
 * Graph Node N6: Compute nearest bin distance across all bins and verified bins
 */
export function findNearestBins(
  lat: number,
  lng: number,
  bins: PublicBin[]
): {
  nearestAll: PublicBin;
  dBinAllM: number;
  nearestVerified: PublicBin;
  dBinVerifiedM: number;
} {
  const activeBins = bins.filter((b) => b.status !== 'removed');
  const verifiedBins = activeBins.filter((b) => b.status === 'verified');

  let nearestAll = activeBins[0];
  let minAll = Infinity;
  for (const b of activeBins) {
    const d = haversineDistanceMeters(lat, lng, b.lat, b.lng);
    if (d < minAll) {
      minAll = d;
      nearestAll = b;
    }
  }

  let nearestVerified = verifiedBins[0] ?? nearestAll;
  let minVerified = Infinity;
  for (const b of verifiedBins) {
    const d = haversineDistanceMeters(lat, lng, b.lat, b.lng);
    if (d < minVerified) {
      minVerified = d;
      nearestVerified = b;
    }
  }

  return {
    nearestAll,
    dBinAllM: Number.isFinite(minAll) ? minAll : 999,
    nearestVerified,
    dBinVerifiedM: Number.isFinite(minVerified) ? minVerified : minAll,
  };
}

export interface BinsAnalysisSummary {
  totalActiveReports: number;
  nearBin15mCount: number;
  nearBin15mPct: number;
  nearBin50mCount: number;
  nearBin50mPct: number;
  le100mPct: number;
  le200mPct: number;
  gt200mCount: number;
  gt200mPct: number;
  highImpactCount: number;
  highImpactPct: number;
  bySeverity: Record<SeverityType, { count: number; pct: number }>;
  verdict: 'not_bins' | 'bins_gap' | 'inconclusive';
  verdictHeadline: string;
  verdictExplanation: string;
  nearBinHotspots: { areaName: string; count: number; minBinDistM: number; nearestBinCode: string }[];
  farFromBinHotspots: { areaName: string; count: number; minBinDistM: number }[];
}

/**
 * Graph Node N10: Bins vs Fouling Analysis Engine
 * Evaluates both "Fouling right beside bins" (Council Myth-Buster) AND "Far from any bin (>200m)" hotspots
 * so the data cannot be cherry-picked.
 */
export function computeBinsVsFoulingAnalysis(
  reports: FoulingReport[]
): BinsAnalysisSummary {
  const active = reports.filter((r) => r.status === 'spotted' || r.status === 'cleared');
  const total = Math.max(active.length, 1);

  const near15 = active.filter((r) => r.dBinAllM <= 15).length;
  const near50 = active.filter((r) => r.dBinAllM <= 50).length;
  const le100 = active.filter((r) => r.dBinAllM <= 100).length;
  const le200 = active.filter((r) => r.dBinAllM <= 200).length;
  const gt200 = active.filter((r) => r.dBinAllM > 200).length;

  const highImpact = active.filter((r) => SEVERITY_META[r.severity].isHighImpact).length;

  const bySeverity: Record<SeverityType, { count: number; pct: number }> = {
    just_poop: { count: 0, pct: 0 },
    stepped_in: { count: 0, pct: 0 },
    buggy_wheels: { count: 0, pct: 0 },
    wheelchair_wheels: { count: 0, pct: 0 },
  };

  for (const r of active) {
    bySeverity[r.severity].count += 1;
  }
  (Object.keys(bySeverity) as SeverityType[]).forEach((k) => {
    bySeverity[k].pct = Math.round((bySeverity[k].count / total) * 100);
  });

  // Group by areaName for hotspots
  const byArea = new Map<
    string,
    { count: number; totalDist: number; minDist: number; nearestBinCode: string }
  >();
  for (const r of active) {
    const prev = byArea.get(r.areaName) ?? {
      count: 0,
      totalDist: 0,
      minDist: Infinity,
      nearestBinCode: r.nearestBinCode,
    };
    prev.count += 1;
    prev.totalDist += r.dBinAllM;
    if (r.dBinAllM < prev.minDist) {
      prev.minDist = r.dBinAllM;
      prev.nearestBinCode = r.nearestBinCode;
    }
    byArea.set(r.areaName, prev);
  }

  const nearBinHotspots: {
    areaName: string;
    count: number;
    minBinDistM: number;
    nearestBinCode: string;
  }[] = [];
  const farFromBinHotspots: {
    areaName: string;
    count: number;
    minBinDistM: number;
  }[] = [];

  for (const [areaName, stats] of byArea.entries()) {
    const avgDist = Math.round(stats.totalDist / stats.count);
    if (avgDist <= 65) {
      nearBinHotspots.push({
        areaName,
        count: stats.count,
        minBinDistM: stats.minDist,
        nearestBinCode: stats.nearestBinCode,
      });
    } else if (avgDist > 150) {
      farFromBinHotspots.push({
        areaName,
        count: stats.count,
        minBinDistM: avgDist,
      });
    }
  }

  nearBinHotspots.sort((a, b) => b.count - a.count);
  farFromBinHotspots.sort((a, b) => b.count - a.count);

  const near50Pct = Math.round((near50 / total) * 100);
  const gt200Pct = Math.round((gt200 / total) * 100);

  let verdict: 'not_bins' | 'bins_gap' | 'inconclusive' = 'not_bins';
  let verdictHeadline = `${near50Pct}% of Fouling Occurs Within 50m of a Public Bin`;
  let verdictExplanation =
    'Bins sit right beside the main coastal and town-centre hotspots, proving that coastal fouling is driven by unpunished behaviour and lack of warden patrols — while outer estates (Kindlestown, Charlesland, Cliff Walk) have zero mapped dog bins.';

  if (gt200Pct > 55) {
    verdict = 'bins_gap';
    verdictHeadline = `${gt200Pct}% of Reports Are >200m From Any Public Bin`;
    verdictExplanation =
      'Outer walking routes show significant bin gaps (>200m from any verified bin), alongside heavy repeat fouling right beside existing seafront bins.';
  }

  return {
    totalActiveReports: active.length,
    nearBin15mCount: near15,
    nearBin15mPct: Math.round((near15 / total) * 100),
    nearBin50mCount: near50,
    nearBin50mPct: near50Pct,
    le100mPct: Math.round((le100 / total) * 100),
    le200mPct: Math.round((le200 / total) * 100),
    gt200mCount: gt200,
    gt200mPct: gt200Pct,
    highImpactCount: highImpact,
    highImpactPct: Math.round((highImpact / total) * 100),
    bySeverity,
    verdict,
    verdictHeadline,
    verdictExplanation,
    nearBinHotspots,
    farFromBinHotspots,
  };
}

/**
 * Graph Node N9: Deterministic verified citation picker
 * Only returns citations where status === 'verified'. Never returns unverified rows.
 */
export function selectVerifiedCitations(
  allCitations: LegalCitation[],
  intent: 'enforcement' | 'bin_request' | 'general',
  locationType: 'beach' | 'park' | 'road' = 'beach'
): LegalCitation[] {
  const verifiedOnly = allCitations.filter((c) => c.status === 'verified');
  return verifiedOnly.filter((c) => {
    if (c.tags.includes('always')) return true;
    if (intent === 'bin_request' && c.tags.includes('bin_request')) return true;
    if (intent === 'enforcement' && c.tags.includes('enforcement')) return true;
    if (locationType === 'beach' && c.tags.includes('beach')) return true;
    if (locationType === 'park' && c.tags.includes('park')) return true;
    return false;
  });
}

/**
 * Graph Node N13: Guardrail PII & Honesty Checker for Resident Notes & Emails
 */
export function checkPiiAndGuardrails(text: string): {
  ok: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  // Detect Irish car registration plate pattern (e.g. 241-WW-1234 or 192-D-4521)
  if (/\b\d{2,3}\s*-\s*[A-Za-z]{1,2}\s*-\s*\d{1,6}\b/.test(text)) {
    warnings.push(
      'Vehicle registration plates are prohibited under our GDPR & anti-shaming rules. Please remove the plate number.'
    );
  }
  // Detect house number accusation pattern (e.g. "number 14", "No. 22", "lives at 8")
  if (/\b(house\s*(no|number)?\s*\d+|lives\s+at\s+\d+|owner\s+at\s+\d+)\b/i.test(text)) {
    warnings.push(
      'Identifying private residences or naming individual dog owners is blocked. Focus on public footpath locations and council enforcement.'
    );
  }
  return {
    ok: warnings.length === 0,
    warnings,
  };
}
