import type { TownConfig } from '../config/schema';
import { distanceToNearestLitterBin, nearBinSentence, summariseBinDistance } from './binDistance';
import { headlineStat, monthlyReportStat, trendSentence } from './monthlyStat';
import type { LitterBin, Report } from '../types';

export function councilReportMarkdown(
  config: Pick<TownConfig, 'name' | 'legal' | 'binsNote' | 'timeZone'>,
  reports: Report[],
  bins: LitterBin[],
  now: Date,
): string {
  const stat = monthlyReportStat(reports, now, config.timeZone);
  const distance = summariseBinDistance(reports, bins);
  return [
    `# ${config.name} dog fouling report`,
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
    config.binsNote,
    '',
    '## Law',
    '',
    config.legal.offence,
    config.legal.citationUrl,
    '',
    config.legal.fineWording,
    '',
    config.legal.fixedPaymentNote,
    config.legal.fixedPaymentUrl,
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
