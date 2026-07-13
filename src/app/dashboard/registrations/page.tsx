'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, X, Users } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { RATE_CONFIG, type RateType } from '@/lib/flight-types';
import type { Registration } from '@/lib/registration-types';
import { approveRegistration, rejectRegistration } from '@/lib/registration-approve';

export default function RegistrationsReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rateChoice, setRateChoice] = useState<Record<string, RateType>>({});
  const [customRate, setCustomRate] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'registrations'), where('status', '==', 'pending')));
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Registration, 'id'>) }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      setRegs(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  }

  async function act(reg: Registration, action: 'approve' | 'reject') {
    if (!user?.email) return;
    setBusyId(reg.id);
    try {
      if (action === 'reject') {
        await rejectRegistration(reg.id, user.email);
      } else {
        const rateType = rateChoice[reg.id] ?? 'regular';
        let monthlyRate: number | undefined;
        if (rateType === 'custom') {
          const cr = parseFloat(customRate[reg.id] ?? '');
          if (Number.isNaN(cr)) {
            setBusyId(null);
            return flash('Enter a custom rate first.');
          }
          monthlyRate = cr;
        }
        await approveRegistration(reg, { rateType, monthlyRate, reviewerEmail: user.email });
      }
      setRegs((prev) => prev.filter((r) => r.id !== reg.id));
      const name = [reg.parentFirstName, reg.parentLastName].filter(Boolean).join(' ');
      flash(
        action === 'approve'
          ? `Approved ${name}. Added to billing + families.`
          : `Rejected ${name}.`,
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <p className="text-white">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="bg-[#141418] border-b border-white/[0.09]">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <Link href="/dashboard" className="text-white/45 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-semibold">Registrations</h1>
          <span className="ml-auto text-sm text-white/45 inline-flex items-center gap-1.5">
            <Users size={14} /> {regs.length} pending
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {toast && (
          <div className="mb-4 px-4 py-3 rounded-md border border-white/15 bg-white/[0.04] text-sm text-white/90">
            {toast}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-md border border-red-400/30 bg-red-500/10 text-red-200 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-white/45 text-sm">Loading registrations…</p>
        ) : regs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.12] px-6 py-16 text-center">
            <p className="text-white/70 font-medium mb-1">No pending registrations</p>
            <p className="text-white/40 text-sm">
              New parent registrations from the public form will show up here for your approval.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {regs.map((reg) => {
              const busy = busyId === reg.id;
              const name = [reg.parentFirstName, reg.parentLastName].filter(Boolean).join(' ');
              const rt = rateChoice[reg.id] ?? 'regular';
              return (
                <li key={reg.id} className="rounded-xl border border-white/[0.09] bg-[#141418] overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/[0.06] flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{name || 'Unnamed parent'}</div>
                      <div className="text-sm text-white/50 mt-0.5">
                        {reg.parentPhone}
                        {reg.parentEmail ? ` · ${reg.parentEmail}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] px-2 py-1 rounded-full bg-white/[0.06] text-white/60">
                      {reg.teamLabel || reg.teamCode}
                    </span>
                  </div>

                  <div className="px-5 py-4 space-y-2">
                    {reg.players.map((p, i) => (
                      <div key={i} className="text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-white/45">
                          {[
                            p.birthYear ? `b. ${p.birthYear}` : '',
                            p.gradYear ? `grad ${p.gradYear}` : '',
                            p.school || '',
                          ]
                            .filter(Boolean)
                            .map((str) => ` · ${str}`)
                            .join('')}
                        </span>
                      </div>
                    ))}
                    {reg.secondaryParentName && (
                      <div className="text-sm text-white/50">
                        2nd parent: {reg.secondaryParentName}
                        {reg.secondaryParentPhone ? ` · ${reg.secondaryParentPhone}` : ''}
                        {reg.secondaryParentEmail ? ` · ${reg.secondaryParentEmail}` : ''}
                      </div>
                    )}
                    {reg.notes && (
                      <div className="text-sm text-white/60 bg-white/[0.03] rounded-md px-3 py-2 mt-1">
                        {reg.notes}
                      </div>
                    )}
                    <div className="text-[11px] text-white/35 pt-1">
                      Submitted {new Date(reg.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="px-5 py-4 border-t border-white/[0.06] flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-white/60">
                      Rate
                      <select
                        value={rt}
                        onChange={(e) =>
                          setRateChoice((prev) => ({ ...prev, [reg.id]: e.target.value as RateType }))
                        }
                        disabled={busy}
                        className="px-2.5 py-1.5 rounded-md bg-[#0A0A0A] border border-white/[0.12] text-white text-sm outline-none focus:border-white/30"
                      >
                        {(Object.keys(RATE_CONFIG) as RateType[]).map((k) => (
                          <option key={k} value={k}>
                            {RATE_CONFIG[k].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {rt === 'custom' && (
                      <input
                        type="number"
                        placeholder="$/mo"
                        value={customRate[reg.id] ?? ''}
                        onChange={(e) =>
                          setCustomRate((prev) => ({ ...prev, [reg.id]: e.target.value }))
                        }
                        disabled={busy}
                        className="w-24 px-2.5 py-1.5 rounded-md bg-[#0A0A0A] border border-white/[0.12] text-white text-sm outline-none focus:border-white/30"
                      />
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => act(reg, 'reject')}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-sm font-medium border border-white/15 text-white/70 hover:bg-white/[0.04] disabled:opacity-50"
                      >
                        <X size={14} /> Reject
                      </button>
                      <button
                        onClick={() => act(reg, 'approve')}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: 'var(--color-accent, #E8632A)' }}
                      >
                        <Check size={14} /> {busy ? 'Working…' : 'Approve'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
