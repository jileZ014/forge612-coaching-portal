'use client';

import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// PUBLIC parent self-registration (2026-2027 season). No auth. Submits to Firestore
// (client SDK, create-only pending rule) then pings Coach Jonas via /api/notify-registration.

type TeamOption = { code: string; label: string };
const TEAMS: TeamOption[] = [
  { code: '9u', label: '9U' },
  { code: '10u', label: '10U' },
  { code: '12u/13u', label: '12U / 13U' },
  { code: '14u', label: '14U' },
  { code: '15u', label: '15U' },
];

type PlayerInput = { name: string; birthYear: string; gradYear: string; school: string };
const emptyPlayer = (): PlayerInput => ({ name: '', birthYear: '', gradYear: '', school: '' });

const WAIVER_URL =
  'https://forms.zohopublic.com/virtualoffice22550/form/AZWestValleyFlightWaiverandReleaseForm/formperma/YsZX8UohvyRTa9RJ7_AjWPo8Dbb-bADqzzniMNLF7pc';
const CONDUCT_URL =
  'https://forms.zohopublic.com/virtualoffice22550/form/AZWestValleyFlightBasketballClubEnrollmentChecklis/formperma/bUGl_5b9IK7zDH3VBBnlOXo82CoPLK1_HxmACftpymk';
const AAU_URL = 'https://play.aausports.org/joinaau/multimembershipapplication.aspx';

export default function RegisterPage() {
  // Primary parent
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  // Optional second parent
  const [showSecond, setShowSecond] = useState(false);
  const [sec2First, setSec2First] = useState('');
  const [sec2Last, setSec2Last] = useState('');
  const [sec2Phone, setSec2Phone] = useState('');
  const [sec2Email, setSec2Email] = useState('');

  const [teamCode, setTeamCode] = useState('');
  const [notes, setNotes] = useState('');
  const [players, setPlayers] = useState<PlayerInput[]>([emptyPlayer()]);
  const [company, setCompany] = useState(''); // honeypot

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function updatePlayer(idx: number, patch: Partial<PlayerInput>) {
    setPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  function addPlayer() {
    setPlayers((prev) => [...prev, emptyPlayer()]);
  }
  function removePlayer(idx: number) {
    setPlayers((prev) => prev.filter((_, i) => i !== idx));
  }
  function removeSecondParent() {
    setShowSecond(false);
    setSec2First('');
    setSec2Last('');
    setSec2Phone('');
    setSec2Email('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!parentFirstName.trim()) return setError('Please enter your first name.');
    if (!parentPhone.trim()) return setError('Please enter a phone number.');
    if (!teamCode) return setError('Please choose an age group.');
    const validPlayers = players.filter((p) => p.name.trim());
    if (validPlayers.length === 0) return setError('Please add at least one player.');

    // Honeypot: bots fill the hidden field. Pretend success, write nothing.
    if (company.trim()) {
      setDone(true);
      return;
    }

    setSubmitting(true);
    try {
      const teamLabel = TEAMS.find((t) => t.code === teamCode)?.label ?? teamCode;
      const secName = [sec2First.trim(), sec2Last.trim()].filter(Boolean).join(' ');
      await addDoc(collection(db, 'registrations'), {
        status: 'pending',
        parentFirstName: parentFirstName.trim(),
        parentLastName: parentLastName.trim(),
        parentEmail: parentEmail.trim().toLowerCase(),
        parentPhone: parentPhone.trim(),
        secondaryParentName: showSecond ? secName : '',
        secondaryParentPhone: showSecond ? sec2Phone.trim() : '',
        secondaryParentEmail: showSecond ? sec2Email.trim().toLowerCase() : '',
        players: validPlayers.map((p) => ({
          name: p.name.trim(),
          birthYear: p.birthYear.trim(),
          gradYear: p.gradYear.trim(),
          school: p.school.trim(),
        })),
        teamCode,
        teamLabel,
        notes: notes.trim(),
        season: '2026-2027',
        source: 'self-registration',
        createdAt: new Date().toISOString(),
      });

      // Best-effort coach notification — never blocks the parent's success screen.
      try {
        await fetch('/api/notify-registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parentName: [parentFirstName.trim(), parentLastName.trim()].filter(Boolean).join(' '),
            phone: parentPhone.trim(),
            email: parentEmail.trim(),
            players: validPlayers.map((p) => p.name.trim()).join(', '),
            team: teamLabel,
            notes: notes.trim(),
          }),
        });
      } catch {
        /* notify is best-effort */
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-5">
        <div className="max-w-md w-full text-center">
          <div
            className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-5"
            style={{ background: 'var(--color-accent)' }}
          >
            <Check size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold mb-2">You&rsquo;re registered!</h1>
          <p className="text-text-muted text-sm leading-relaxed">
            Thanks, {parentFirstName.trim()}. Coach Jonas has been notified and will confirm your
            spot shortly. You&rsquo;ll get a text with your first invoice once you&rsquo;re approved.
          </p>
          <p className="text-text-muted text-xs leading-relaxed mt-4">
            Next steps: complete the{' '}
            <a href={WAIVER_URL} className="text-accent underline" target="_blank" rel="noreferrer">
              Waiver &amp; Release
            </a>{' '}
            and{' '}
            <a href={CONDUCT_URL} className="text-accent underline" target="_blank" rel="noreferrer">
              Code of Conduct
            </a>
            , and sign up for{' '}
            <a href={AAU_URL} className="text-accent underline" target="_blank" rel="noreferrer">
              AAU membership
            </a>{' '}
            (club: Arizona Flight Basketball Club, code W3E3ED).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface-elevated">
        <div className="max-w-xl mx-auto px-5 py-6">
          <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
            AZ Flight Hoops &middot; 2026&ndash;2027 Season
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 leading-tight">Player Registration</h1>
          <p className="text-sm text-text-muted mt-1">
            Fill this out to join the club. Coach Jonas reviews every registration before it&rsquo;s
            confirmed.
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-6">
        {/* Registration info */}
        <section className="rounded-xl border border-border bg-surface-elevated p-5 mb-6 text-sm leading-relaxed">
          <h2 className="font-semibold mb-3">What to know</h2>
          <p className="text-text-muted mb-3">
            AZ Flight is a non-profit, all-volunteer club. Monthly dues cover gym time, games,
            tournaments, and equipment.
          </p>
          <ul className="space-y-2 text-text-secondary">
            <li>
              <span className="font-medium text-foreground">Monthly dues:</span> $95 per player
              ($170 for two players), due by the 7th of each month.
            </li>
            <li className="rounded-md px-3 py-2" style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' }}>
              <span className="font-semibold text-foreground">Heads up:</span> starting{' '}
              <span className="font-semibold text-foreground">September 2026</span>, monthly club
              fees will increase.
            </li>
            <li>
              <span className="font-medium text-foreground">New players:</span>{' '}
              your first payment is two months up front ($190), non-refundable, to hold your
              player&rsquo;s spot (a two-month commitment). It&rsquo;s $95/month after that.
            </li>
            <li>
              <span className="font-medium text-foreground">Team kit:</span> $90 one-time (reversible
              jersey + backpack).
            </li>
            <li>
              <span className="font-medium text-foreground">Ways to pay:</span> monthly invoice by
              text or email, Zelle to 303-908-6810, or check/cash.
            </li>
            <li>
              <span className="font-medium text-foreground">AAU membership</span> is required. Sign
              up at{' '}
              <a href={AAU_URL} className="text-accent underline" target="_blank" rel="noreferrer">
                AAU
              </a>{' '}
              under &ldquo;Arizona Flight Basketball Club&rdquo; (code W3E3ED).
            </li>
            <li>
              <span className="font-medium text-foreground">Also complete:</span>{' '}
              <a href={WAIVER_URL} className="text-accent underline" target="_blank" rel="noreferrer">
                Waiver &amp; Release
              </a>{' '}
              and{' '}
              <a href={CONDUCT_URL} className="text-accent underline" target="_blank" rel="noreferrer">
                Code of Conduct
              </a>
              .
            </li>
            <li>
              <span className="font-medium text-foreground">Team communication</span>{' '}
              and schedules go out through the Band app (we&rsquo;ll invite the email you provide).
            </li>
          </ul>
        </section>

        <form onSubmit={submit} className="space-y-6">
          {/* Parent(s) */}
          <section className="rounded-xl border border-border bg-surface-elevated p-5">
            <h2 className="font-semibold mb-4">Parent / guardian</h2>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="First name *">
                <TextInput value={parentFirstName} onChange={setParentFirstName} autoComplete="given-name" />
              </FormField>
              <FormField label="Last name">
                <TextInput value={parentLastName} onChange={setParentLastName} autoComplete="family-name" />
              </FormField>
              <FormField label="Phone *" className="col-span-2">
                <TextInput value={parentPhone} onChange={setParentPhone} type="tel" inputMode="tel" placeholder="(602) 555-1234" autoComplete="tel" />
              </FormField>
              <FormField label="Email" className="col-span-2">
                <TextInput value={parentEmail} onChange={setParentEmail} type="email" inputMode="email" placeholder="you@email.com" autoComplete="email" />
              </FormField>
            </div>

            {!showSecond ? (
              <button
                type="button"
                onClick={() => setShowSecond(true)}
                className="mt-4 text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1"
              >
                <Plus size={13} /> Add another parent
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
                    Second parent / guardian
                  </span>
                  <button type="button" onClick={removeSecondParent} className="text-text-muted hover:text-error p-1" title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="First name">
                    <TextInput value={sec2First} onChange={setSec2First} autoComplete="given-name" />
                  </FormField>
                  <FormField label="Last name">
                    <TextInput value={sec2Last} onChange={setSec2Last} autoComplete="family-name" />
                  </FormField>
                  <FormField label="Phone" className="col-span-2">
                    <TextInput value={sec2Phone} onChange={setSec2Phone} type="tel" inputMode="tel" autoComplete="tel" />
                  </FormField>
                  <FormField label="Email" className="col-span-2">
                    <TextInput value={sec2Email} onChange={setSec2Email} type="email" inputMode="email" />
                  </FormField>
                </div>
              </div>
            )}
          </section>

          {/* Players */}
          <section className="rounded-xl border border-border bg-surface-elevated p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Player(s)</h2>
              <button type="button" onClick={addPlayer} className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1">
                <Plus size={13} /> Add player
              </button>
            </div>
            <div className="space-y-4">
              {players.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
                      Player {idx + 1}
                    </span>
                    {players.length > 1 && (
                      <button type="button" onClick={() => removePlayer(idx)} className="text-text-muted hover:text-error p-1" title="Remove">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Full name *" className="col-span-2">
                      <TextInput value={p.name} onChange={(v) => updatePlayer(idx, { name: v })} />
                    </FormField>
                    <FormField label="Birth year">
                      <TextInput value={p.birthYear} onChange={(v) => updatePlayer(idx, { birthYear: v })} type="number" inputMode="numeric" placeholder="2014" />
                    </FormField>
                    <FormField label="Grad year">
                      <TextInput value={p.gradYear} onChange={(v) => updatePlayer(idx, { gradYear: v })} type="number" inputMode="numeric" placeholder="2032" />
                    </FormField>
                    <FormField label="School" className="col-span-2">
                      <TextInput value={p.school} onChange={(v) => updatePlayer(idx, { school: v })} placeholder="Current school" />
                    </FormField>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Team + extras */}
          <section className="rounded-xl border border-border bg-surface-elevated p-5">
            <h2 className="font-semibold mb-4">Team &amp; details</h2>
            <FormField label="Age group *">
              <select
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-accent text-sm outline-none transition-colors text-foreground"
              >
                <option value="">Select…</option>
                {TEAMS.map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Anything we should know?" className="mt-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional — allergies, prior team, questions, etc."
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-accent text-sm outline-none transition-colors text-foreground placeholder:text-text-muted"
              />
            </FormField>
          </section>

          {/* Honeypot — visually hidden, off-screen; bots fill it, humans never see it */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            name="company"
            aria-hidden="true"
            style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
          />

          {error && (
            <div className="px-4 py-3 rounded-lg border border-error/30 bg-error/5 text-error text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-lg text-sm font-semibold text-white shadow-lg shadow-black/20 transition-all hover:scale-[1.01] disabled:opacity-60"
            style={{ background: 'var(--color-accent)' }}
          >
            {submitting ? 'Submitting…' : 'Submit registration'}
          </button>
          <p className="text-[11px] text-text-muted text-center leading-relaxed">
            By registering you agree to be contacted about club fees and team info. Standard message
            rates may apply.
          </p>
        </form>
      </main>
    </div>
  );
}

function FormField({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  type = 'text',
  inputMode,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email';
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode={inputMode}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-accent text-sm outline-none transition-colors text-foreground placeholder:text-text-muted"
    />
  );
}
