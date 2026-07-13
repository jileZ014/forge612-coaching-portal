'use client';

import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// PUBLIC parent self-registration. No auth. Submits to /api/register, which
// quarantines the entry (status 'pending') and pings Coach Jonas on Telegram.
// Styled to match the public roster page (semantic tokens + accent).

type TeamOption = { code: string; label: string };
const TEAMS: TeamOption[] = [
  { code: '16u-rob', label: '16u (Coach Rob)' },
  { code: '15u-white', label: '15u (Coach White)' },
  { code: '14u-jonas', label: '14u (Coach Jonas)' },
  { code: '13u-josiah', label: '13u (Coach Josiah)' },
  { code: '10u-salo', label: '10u (Coach Salo)' },
  { code: '9u-toni', label: '9u (Coach Toni)' },
  { code: 'unsure', label: 'Not sure yet' },
];

type PlayerInput = { name: string; birthYear: string; gradYear: string; school: string };
const emptyPlayer = (): PlayerInput => ({ name: '', birthYear: '', gradYear: '', school: '' });

export default function RegisterPage() {
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [secondaryParentName, setSecondaryParentName] = useState('');
  const [secondaryParentPhone, setSecondaryParentPhone] = useState('');
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!parentFirstName.trim()) return setError('Please enter your first name.');
    if (!parentPhone.trim()) return setError('Please enter a phone number.');
    if (!teamCode) return setError('Please choose a team or age group.');
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
      // Write the pending registration directly (client SDK). Firestore rules allow a
      // public CREATE of a shape-checked pending doc; only the coach can read/approve it.
      await addDoc(collection(db, 'registrations'), {
        status: 'pending',
        parentFirstName: parentFirstName.trim(),
        parentLastName: parentLastName.trim(),
        parentEmail: parentEmail.trim().toLowerCase(),
        parentPhone: parentPhone.trim(),
        secondaryParentName: secondaryParentName.trim(),
        secondaryParentPhone: secondaryParentPhone.trim(),
        players: validPlayers.map((p) => ({
          name: p.name.trim(),
          birthYear: p.birthYear.trim(),
          gradYear: p.gradYear.trim(),
          school: p.school.trim(),
        })),
        teamCode,
        teamLabel,
        notes: notes.trim(),
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface-elevated">
        <div className="max-w-xl mx-auto px-5 py-6">
          <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
            AZ Flight Hoops
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 leading-tight">Player Registration</h1>
          <p className="text-sm text-text-muted mt-1">
            Fill this out to join the club. Coach Jonas reviews every registration before it&rsquo;s
            confirmed.
          </p>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-5 py-6">
        <form onSubmit={submit} className="space-y-6">
          {/* Parent */}
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
            <FormField label="Team / age group *">
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
            <div className="grid grid-cols-2 gap-3 mt-4">
              <FormField label="Second parent name">
                <TextInput value={secondaryParentName} onChange={setSecondaryParentName} />
              </FormField>
              <FormField label="Second parent phone">
                <TextInput value={secondaryParentPhone} onChange={setSecondaryParentPhone} type="tel" inputMode="tel" />
              </FormField>
            </div>
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
