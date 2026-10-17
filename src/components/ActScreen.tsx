import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Copy, Mail } from 'lucide-react';
import { ENVIRONMENT_OFFICE_EMAIL, GREYSTONES_COUNCILLORS } from '../data/councillors';
import { buildCouncillorEmail, TONE_OPTIONS } from '../lib/emailBuilder';
import { monthlyReportStat } from '../lib/monthlyStat';
import type { Report, ToneId } from '../types';

interface ActScreenProps {
  reports: Report[];
  now?: Date;
}

export function ActScreen({ reports, now = new Date() }: ActScreenProps) {
  const [open, setOpen] = useState(false);
  const [toneId, setToneId] = useState<ToneId>('factual');
  const [selectedIds, setSelectedIds] = useState<string[]>(GREYSTONES_COUNCILLORS.map((c) => c.id));
  const [includeOffice, setIncludeOffice] = useState(true);
  const [signOff, setSignOff] = useState('A Greystones resident');
  const [notice, setNotice] = useState('');
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const signOffId = useId();
  const officeId = useId();
  const stat = monthlyReportStat(reports, now);

  const draft = useMemo(
    () =>
      buildCouncillorEmail({
        toneId,
        councillorIds: selectedIds,
        includeEnvironmentOffice: includeOffice,
        signOff,
        stat,
      }),
    [toneId, selectedIds, includeOffice, signOff, stat],
  );

  useEffect(() => {
    if (open) document.getElementById('tone-factual')?.focus();
  }, [open]);

  function toggleCouncillor(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(draft.plainText);
      setNotice('Email copied');
    } catch {
      setNotice('Select the preview and copy it from there');
    }
  }

  if (!open) {
    return (
      <div className="mx-auto flex h-full max-w-md flex-col justify-between px-4 py-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">Tell your councillors</h2>
          <p className="mt-2 text-base leading-relaxed text-muted">
            Write to the six Greystones Municipal District councillors. Nothing is sent until you send it from your own email app.
          </p>
        </div>
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-white"
        >
          <Mail aria-hidden="true" size={20} />
          Tell your councillors
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-md overflow-y-auto px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Tell your councillors</h2>
        <button
          type="button"
          className="text-sm font-semibold text-primary"
          onClick={() => {
            setOpen(false);
            openButtonRef.current?.focus();
          }}
        >
          Close
        </button>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.mailto) window.location.href = draft.mailto;
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Tone</legend>
          {TONE_OPTIONS.map((tone) => (
            <div key={tone.id} className="rounded-xl border border-line bg-white px-3 py-2">
              <input
                id={`tone-${tone.id}`}
                name="tone"
                type="radio"
                value={tone.id}
                checked={toneId === tone.id}
                onChange={() => setToneId(tone.id)}
                className="mr-2 accent-primary"
              />
              <label htmlFor={`tone-${tone.id}`} className="text-sm font-medium text-ink">
                {tone.label}
              </label>
              <p className="pl-6 text-sm text-muted">{tone.description}</p>
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Councillors</legend>
          {GREYSTONES_COUNCILLORS.map((councillor) => (
            <div key={councillor.id} className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2">
              <input
                id={`councillor-${councillor.id}`}
                name="councillors"
                type="checkbox"
                checked={selectedIds.includes(councillor.id)}
                onChange={() => toggleCouncillor(councillor.id)}
                className="mt-1 accent-primary"
              />
              <label htmlFor={`councillor-${councillor.id}`} className="min-w-0 text-sm">
                <span className="block font-medium text-ink">{councillor.name}</span>
                <span className="block break-all text-muted">{councillor.email}</span>
              </label>
            </div>
          ))}
        </fieldset>

        <div className="flex items-start gap-2">
          <input
            id={officeId}
            name="copy-environment-office"
            type="checkbox"
            checked={includeOffice}
            onChange={(event) => setIncludeOffice(event.target.checked)}
            className="mt-1 accent-primary"
          />
          <label htmlFor={officeId} className="text-sm text-ink">
            Also copy the environment office
            <span className="mt-0.5 block break-all text-muted">{ENVIRONMENT_OFFICE_EMAIL}</span>
          </label>
        </div>

        <div className="space-y-1">
          <label htmlFor={signOffId} className="text-sm font-semibold text-ink">
            Sign off
          </label>
          <input
            id={signOffId}
            name="sign-off"
            type="text"
            value={signOff}
            maxLength={80}
            autoComplete="name"
            onChange={(event) => setSignOff(event.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
          />
        </div>

        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink">Preview</h3>
          <p className="text-sm font-medium text-ink">{draft.subject}</p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white p-3 font-sans text-sm leading-relaxed text-ink">
            {draft.body}
          </pre>
        </div>

        <div className="space-y-2 pb-4">
          <a
            href={draft.canSend ? draft.mailto : undefined}
            aria-disabled={!draft.canSend}
            className={`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold text-white ${
              draft.canSend ? 'bg-primary' : 'pointer-events-none bg-primary/50'
            }`}
            onClick={(event) => {
              if (!draft.canSend) event.preventDefault();
            }}
          >
            <Mail aria-hidden="true" size={20} />
            Open in your email app
          </a>
          <button
            type="button"
            onClick={() => void copyEmail()}
            disabled={!draft.canSend}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white text-sm font-semibold text-ink disabled:opacity-50"
          >
            <Copy aria-hidden="true" size={18} />
            Copy email
          </button>
          <p className="text-center text-sm text-muted" role="status">
            {notice || 'This app never sends email.'}
          </p>
          <p className="text-center text-sm text-muted">Council litter line 1800 365 123</p>
        </div>
      </form>
    </div>
  );
}
