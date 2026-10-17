import { useEffect, useMemo, useState } from 'react';
import { Baby, Accessibility, Camera, Footprints, MapPin, Route } from 'lucide-react';
import type { Impact, Report } from '../types';
import { GREYSTONES_CENTRE } from '../lib/geo';
import { createReport, moveReport, withImpact, withPhoto } from '../lib/reportFlow';
import { MapView, type MapPoint } from './MapView';

const IMPACTS: { id: Impact; label: string; Icon: typeof MapPin }[] = [
  { id: 'on_the_path', label: 'On the path', Icon: Route },
  { id: 'stepped_in', label: 'Stepped in', Icon: Footprints },
  { id: 'buggy', label: 'Buggy', Icon: Baby },
  { id: 'wheelchair', label: 'Wheelchair', Icon: Accessibility },
];

interface ReportScreenProps {
  reports: Report[];
  onChange: (reports: Report[]) => void;
}

async function currentLocation(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 },
    );
  });
}

export function ReportScreen({ reports, onChange }: ReportScreenProps) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ id: string; hint: string } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; nonce: string } | null>(null);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const points = useMemo<MapPoint[]>(
    () =>
      reports.map((report) => ({
        id: report.id,
        lat: report.lat,
        lng: report.lng,
        count: 1,
        draggable: report.id === toast?.id,
      })),
    [reports, toast?.id],
  );

  function update(id: string, next: (report: Report) => Report) {
    onChange(reports.map((report) => (report.id === id ? next(report) : report)));
  }

  async function logReport() {
    if (busy) return;
    setBusy(true);
    const located = await currentLocation();
    const point = located ?? GREYSTONES_CENTRE;
    const report = createReport({
      lat: point.lat,
      lng: point.lng,
      impact,
      hasPhoto: photoReady,
    });
    onChange([report, ...reports]);
    setToast({
      id: report.id,
      hint: located ? 'Drag the pin to adjust.' : 'Drag the pin to the spot.',
    });
    setFocus({ lat: report.lat, lng: report.lng, nonce: report.id });
    setBusy(false);
  }

  function chooseImpact(next: Impact) {
    const value = impact === next ? null : next;
    setImpact(value);
    if (toast) update(toast.id, (report) => withImpact(report, value));
  }

  function onPhotoSelected(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setPhotoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setPhotoReady(true);
    if (toast) update(toast.id, (report) => withPhoto(report, true));
  }

  function undo() {
    if (!toast) return;
    onChange(reports.filter((report) => report.id !== toast.id));
    setToast(null);
  }

  return (
    <div className="relative h-full">
      <h2 className="sr-only">Report dog fouling</h2>
      <MapView
        points={points}
        zoom={15}
        focus={focus}
        attributionInset={176}
        onMovePoint={(id, lat, lng) => update(id, (report) => moveReport(report, lat, lng))}
      />

      {toast && (
        <div
          role="status"
          data-testid="thanks-toast"
          className="absolute left-3 right-16 top-3 z-[500] flex items-start justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-lg"
        >
          <div>
            <p className="font-semibold text-ink">Thanks, logged</p>
            <p className="text-sm text-muted">{toast.hint}</p>
          </div>
          <button type="button" onClick={undo} className="shrink-0 text-sm font-semibold text-primary">
            Undo
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-gradient-to-t from-white via-white to-white/0 px-3 pb-3 pt-10">
        <div className="pointer-events-auto mx-auto flex max-w-md flex-col gap-2">
          <div role="group" aria-label="Impact, optional" className="flex flex-wrap gap-2">
            {IMPACTS.map(({ id, label, Icon }) => {
              const selected = impact === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseImpact(id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${
                    selected
                      ? 'border-primary bg-primary text-white'
                      : 'border-line bg-white text-ink'
                  }`}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={2} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <input
              id="report-photo"
              name="report-photo"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => onPhotoSelected(event.target.files?.[0])}
            />
            <label
              htmlFor="report-photo"
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-medium text-ink"
            >
              <Camera aria-hidden="true" size={16} />
              {photoReady ? 'Photo added' : 'Add a photo'}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            {photoUrl && (
              <img src={photoUrl} alt="Photo added for this report" className="h-10 w-10 rounded-lg object-cover" />
            )}
          </div>

          <button
            type="button"
            onClick={() => void logReport()}
            disabled={busy}
            aria-busy={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-white shadow-sm disabled:opacity-70"
          >
            <MapPin aria-hidden="true" size={20} />
            Report this spot
          </button>
        </div>
      </div>
    </div>
  );
}
