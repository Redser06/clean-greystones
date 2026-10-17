import { useEffect, useState } from 'react';
import { BarChart3, Mail, MapPin } from 'lucide-react';
import { town } from '../config/town';
import type { Report } from '../types';
import { isDemoEnabled, reportsForSession } from '../lib/reportFlow';
import { readStoredReports, writeStoredReports } from '../lib/storage';
import { ActScreen } from './ActScreen';
import { PictureScreen } from './PictureScreen';
import { ReportScreen } from './ReportScreen';

type Tab = 'report' | 'picture' | 'act';

const TABS: { id: Tab; label: string; Icon: typeof MapPin }[] = [
  { id: 'report', label: 'Report', Icon: MapPin },
  { id: 'picture', label: 'Picture', Icon: BarChart3 },
  { id: 'act', label: 'Act', Icon: Mail },
];

function browserStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function ResidentApp() {
  const [tab, setTab] = useState<Tab>('report');
  const [reports, setReports] = useState<Report[]>(() => {
    const store = browserStore();
    const stored = store ? readStoredReports(store, town.storageKey) : null;
    return reportsForSession({
      demo: isDemoEnabled(import.meta.env.VITE_DEMO_DATA),
      stored,
      now: new Date(),
      samples: town.demoReports,
      timeZone: town.timeZone,
    });
  });

  useEffect(() => {
    const store = browserStore();
    if (store) writeStoredReports(store, reports, town.storageKey);
  }, [reports]);

  return (
    <div className="flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white px-4">
        <img src={town.branding.logo} alt="" className="h-8 w-8 rounded-lg" />
        <div className="min-w-0">
          <h1 className="font-display text-base font-semibold leading-tight">{town.branding.name}</h1>
          <p className="truncate text-xs text-muted">{town.branding.tagline}</p>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {tab === 'report' && <ReportScreen reports={reports} onChange={setReports} />}
        {tab === 'picture' && <PictureScreen reports={reports} />}
        {tab === 'act' && <ActScreen reports={reports} />}
      </main>

      <nav
        aria-label="Primary"
        className="grid h-16 shrink-0 grid-cols-3 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map(({ id, label, Icon }) => {
          const selected = tab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={selected ? 'page' : undefined}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                selected ? 'text-primary' : 'text-muted'
              }`}
            >
              <Icon aria-hidden="true" size={20} strokeWidth={selected ? 2.4 : 2} />
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
