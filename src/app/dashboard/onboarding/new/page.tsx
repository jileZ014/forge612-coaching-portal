'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { teamConfig } from '@/lib/team-config';
import {
  addFamily,
  getFamilyByEmail,
  updateFamily,
} from '@/lib/firestore-helpers';
import type { LifecycleStage } from '@/lib/types';
import { LIFECYCLE_STAGES } from '@/lib/types';
import { ArrowLeft } from 'lucide-react';

type PlayerInput = {
  name: string;
  birthYear: string;
  position: string;
  school: string;
  graduationYear: string;
};

const SOURCE_OPTIONS = [
  'tryout',
  'referral',
  'website',
  'instagram',
  'tournament',
  'word-of-mouth',
  'other',
];

const TEAM_ID = teamConfig.teamId;

export default function NewFamilyOnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [primaryParentName, setPrimaryParentName] = useState('');
  const [primaryParentEmail, setPrimaryParentEmail] = useState('');
  const [primaryParentPhone, setPrimaryParentPhone] = useState('');
  const [secondaryParentName, setSecondaryParentName] = useState('');
  const [secondaryParentEmail, setSecondaryParentEmail] = useState('');
  const [secondaryParentPhone, setSecondaryParentPhone] = useState('');
  const [stage, setStage] = useState<LifecycleStage>('lead');
  const [source, setSource] = useState('tryout');
  const [notes, setNotes] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');

  const [players, setPlayers] = useState<PlayerInput[]>([
    { name: '', birthYear: '', position: '', school: '', graduationYear: '' },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  function updatePlayer(idx: number, patch: Partial<PlayerInput>) {
    setPlayers((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function addPlayerRow() {
    setPlayers((prev) => [...prev, { name: '', birthYear: '', position: '', school: '', graduationYear: '' }]);
  }

  function removePlayerRow(idx: number) {
    setPlayers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!primaryParentName.trim() || !primaryParentEmail.trim() || !primaryParentPhone.trim()) {
      setError('Parent name, email, and phone are required.');
      return;
    }
    const validPlayers = players.filter((p) => p.name.trim());
    if (validPlayers.length === 0) {
      setError('Add at least one player.');
      return;
    }

    setSubmitting(true);
    try {
      const existing = await getFamilyByEmail(primaryParentEmail.trim().toLowerCase());
      let familyId: string;
      const now = new Date().toISOString();
      const tags = tagsRaw
        .split(',')
        .map((t) => t.trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean);

      if (existing) {
        familyId = existing.id;
        await updateFamily(familyId, {
          primaryParentName: primaryParentName.trim(),
          primaryParentPhone: primaryParentPhone.trim(),
          secondaryParentName: secondaryParentName.trim() || undefined,
          secondaryParentEmail: secondaryParentEmail.trim().toLowerCase() || undefined,
          secondaryParentPhone: secondaryParentPhone.trim() || undefined,
          source: source || existing.source,
          notes: notes.trim() || existing.notes,
          tags: Array.from(new Set([...(existing.tags ?? []), ...tags])),
        });
      } else {
        const ref = await addFamily({
          primaryParentName: primaryParentName.trim(),
          primaryParentEmail: primaryParentEmail.trim().toLowerCase(),
          primaryParentPhone: primaryParentPhone.trim(),
          secondaryParentName: secondaryParentName.trim() || undefined,
          secondaryParentEmail: secondaryParentEmail.trim().toLowerCase() || undefined,
          secondaryParentPhone: secondaryParentPhone.trim() || undefined,
          playerIds: [],
          lifecycleStage: stage,
          lifecycleStageChangedAt: now,
          source,
          notes: notes.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        });
        familyId = ref.id;
      }

      const playersCol = collection(db, 'teams', TEAM_ID, 'players');
      const playerIds: string[] = [];
      for (const p of validPlayers) {
        const playerRef = await addDoc(playersCol, {
          name: p.name.trim(),
          parentName: primaryParentName.trim(),
          parentEmail: primaryParentEmail.trim().toLowerCase(),
          parentPhone: primaryParentPhone.trim(),
          active: stage === 'active' || stage === 'registered',
          familyId,
          lifecycleStage: stage,
          lifecycleStageChangedAt: now,
          ...(p.birthYear ? { birthYear: parseInt(p.birthYear, 10) } : {}),
          ...(p.position ? { position: p.position.trim() } : {}),
          ...(p.school ? { school: p.school.trim() } : {}),
          ...(p.graduationYear ? { graduationYear: parseInt(p.graduationYear, 10) } : {}),
        });
        playerIds.push(playerRef.id);
      }

      const finalIds = existing
        ? Array.from(new Set([...(existing.playerIds ?? []), ...playerIds]))
        : playerIds;
      await updateFamily(familyId, { playerIds: finalIds });

      router.push(`/dashboard/families/${familyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: teamConfig.primaryColor }}>
        <p className="text-white">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/dashboard/families" className="text-slate-500 hover:text-slate-900">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">New Family</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        <form onSubmit={submit} className="space-y-6">
          <section className="bg-white rounded-md border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Primary parent / guardian</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name *">
                <input
                  required
                  value={primaryParentName}
                  onChange={(e) => setPrimaryParentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </Field>
              <Field label="Email *">
                <input
                  required
                  type="email"
                  value={primaryParentEmail}
                  onChange={(e) => setPrimaryParentEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </Field>
              <Field label="Phone *">
                <input
                  required
                  type="tel"
                  value={primaryParentPhone}
                  onChange={(e) => setPrimaryParentPhone(e.target.value)}
                  placeholder="(602) 555-1234"
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </Field>
            </div>
          </section>

          <section className="bg-white rounded-md border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">
              Secondary parent / guardian <span className="text-slate-400 text-sm">(optional)</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name">
                <input
                  value={secondaryParentName}
                  onChange={(e) => setSecondaryParentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={secondaryParentEmail}
                  onChange={(e) => setSecondaryParentEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={secondaryParentPhone}
                  onChange={(e) => setSecondaryParentPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </Field>
            </div>
          </section>

          <section className="bg-white rounded-md border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Players</h2>
              <button
                type="button"
                onClick={addPlayerRow}
                className="text-sm text-blue-600 hover:underline"
              >
                + Add another
              </button>
            </div>
            {players.map((p, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3 pb-3 border-b border-slate-100 last:border-0 last:mb-0 last:pb-0">
                <input
                  required={idx === 0}
                  value={p.name}
                  onChange={(e) => updatePlayer(idx, { name: e.target.value })}
                  placeholder="Player name *"
                  className="md:col-span-2 px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
                <input
                  value={p.position}
                  onChange={(e) => updatePlayer(idx, { position: e.target.value })}
                  placeholder="Position"
                  className="px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
                <input
                  type="number"
                  value={p.birthYear}
                  onChange={(e) => updatePlayer(idx, { birthYear: e.target.value })}
                  placeholder="Birth year"
                  className="px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={p.graduationYear}
                    onChange={(e) => updatePlayer(idx, { graduationYear: e.target.value })}
                    placeholder="Grad yr"
                    className="flex-1 px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                  />
                  {players.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePlayerRow(idx)}
                      className="text-rose-600 hover:text-rose-800 px-2"
                    >
                      ×
                    </button>
                  )}
                </div>
                <input
                  value={p.school}
                  onChange={(e) => updatePlayer(idx, { school: e.target.value })}
                  placeholder="School"
                  className="md:col-span-5 px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
                />
              </div>
            ))}
          </section>

          <section className="bg-white rounded-md border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">Onboarding details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Starting lifecycle stage">
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as LifecycleStage)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400 bg-white"
                >
                  {LIFECYCLE_STAGES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="How did they find us?">
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400 bg-white"
                >
                  {SOURCE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Tags (comma-separated)" className="mt-4">
              <input
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="needs-financial-aid, transfer-from-X, 8th-grade-2027"
                className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
              />
            </Field>
            <Field label="Notes" className="mt-4">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything you want future-you to remember about this family"
                className="w-full px-3 py-2 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none text-slate-900 placeholder:text-slate-400"
              />
            </Field>
          </section>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-md p-4 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Link
              href="/dashboard/families"
              className="px-4 py-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-md text-sm font-medium text-white disabled:opacity-50"
              style={{ background: teamConfig.accentColor }}
            >
              {submitting ? 'Creating…' : 'Create family'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
