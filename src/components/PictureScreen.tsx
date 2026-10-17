import { useMemo } from 'react';
import type { Report } from '../types';
import { clusterReports } from '../lib/cluster';
import { headlineStat, monthlyReportStat, sameMonth, trendSentence, yearMonth } from '../lib/monthlyStat';
import { MapView, type MapPoint } from './MapView';

interface PictureScreenProps {
  reports: Report[];
  now?: Date;
}

export function PictureScreen({ reports, now = new Date() }: PictureScreenProps) {
  const stat = monthlyReportStat(reports, now);
  const points = useMemo<MapPoint[]>(
    () =>
      clusterReports(reports.filter((report) => sameMonth(report.createdAt, yearMonth(now)))).map((cluster) => ({
        id: cluster.id,
        lat: cluster.lat,
        lng: cluster.lng,
        count: cluster.count,
        draggable: false,
      })),
    [reports, now],
  );

  return (
    <div className="flex h-full flex-col bg-canvas">
      <section className="px-4 pb-3 pt-4" aria-labelledby="month-stat">
        <h2 id="month-stat" className="font-display text-[2rem] font-semibold leading-tight text-ink">
          {headlineStat(stat)}
        </h2>
        <p className="mt-1 text-base text-muted">{trendSentence(stat)}</p>
      </section>
      <div className="min-h-0 flex-1">
        <MapView points={points} zoom={13} />
      </div>
    </div>
  );
}
