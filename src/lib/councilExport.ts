import { distanceToNearestLitterBin, nearBinSentence, summariseBinDistance } from './binDistance';
import {
  FIXED_PENALTY_WORDING,
  LITTER_ACT_OFFENCE,
  LITTER_ACT_SECTION_22_URL,
  LITTERING_FIXED_PAYMENT_NOTE,
  LITTERING_FIXED_PAYMENT_URL,
} from './legal';
import { headlineStat, monthlyReportStat, trendSentence } from './monthlyStat';
import type { LitterBin, Report } from '../types';

export function councilReportMarkdown(reports: Report[], bins: LitterBin[], now: Date): string {
  const stat = monthlyReportStat(reports, now);
  const distance = summariseBinDistance(reports, bins);
  return [
    '# Greystones dog fouling report',
    '',
    `Prepared ${now.toISOString().slice(0, 10)}.`,
    '',
    '## Reports',
    '',
    `${headlineStat(stat)}. ${trendSentence(stat)}.`,
    '',
    '## Distance to litter bins',
    '',
    nearBinSentence(distance),
    '',
    `Reports within 50 metres: ${distance.withinNearBin}. Within 100 metres: ${distance.within100m}. Within 200 metres: ${distance.within200m}. Beyond 200 metres: ${distance.beyond200m}.`,
    '',
    'Distances use OpenStreetMap litter bins (amenity waste basket) from the 16 October 2026 snapshot. Recycling bring-banks are excluded. This is a comparison of reported spots with mapped bins, not a finding about why people did not use a bin.',
    '',
    '## Law',
    '',
    LITTER_ACT_OFFENCE,
    LITTER_ACT_SECTION_22_URL,
    '',
    FIXED_PENALTY_WORDING,
    '',
    LITTERING_FIXED_PAYMENT_NOTE,
    LITTERING_FIXED_PAYMENT_URL,
    '',
  ].join('\n');
}

export function councilReportCsv(reports: Report[], bins: LitterBin[]): string {
  const lines = ['id,created_at,latitude,longitude,impact,has_photo,nearest_litter_bin_metres'];
  for (const report of reports) {
    const metres = distanceToNearestLitterBin(report.lat, report.lng, bins);
    lines.push(
      [
        report.id,
        report.createdAt,
        report.lat,
        report.lng,
        report.impact ?? '',
        report.hasPhoto ? 'yes' : 'no',
        metres ?? '',
      ].join(','),
    );
  }
  return lines.join('\n');
}
