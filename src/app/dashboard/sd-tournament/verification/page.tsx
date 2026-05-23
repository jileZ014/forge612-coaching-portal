'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { useAuth } from '@/lib/auth-context';
import {
  getSdVerificationRecords,
  upsertSdVerification,
} from '@/lib/firestore-helpers';
import type { SdVerificationRecord, VerificationStatus } from '@/lib/types';
import {
  RefreshCw,
  ArrowLeft,
  Check,
  Search,
  AlertCircle,
  Save,
} from 'lucide-react';

type SdPayment = {
  id: string;
  source: 'stripe' | 'zelle';
  playerName: string;
  team: string;
  amount: number;
  playerCount: number;
  paidAt: number;
};

const TEAM_OPTIONS = [
  '16u (Coach Rob)',
  '15u (Coach White)',
  '14u (Coach Jonas)',
  '13u (Coach Josiah)',
  '10u (Coach Salo)',
  '9u (Coach Toni)',
];

type Row = {
  paymentId: string;
  playerName: string;
  team: string;
  playerCount: number;
  source: 'stripe' | 'zelle';
  birthCertStatus: VerificationStatus;
  gradeProofStatus: VerificationStatus;
  notes: string;
  updatedAt?: number;
};

function statusScore(r: Row): number {
  const b = r.birthCertStatus === 'verified' ? 1 : 0;
  const g = r.gradeProofStatus === 'verified' ? 1 : 0;
  return b + g;
}

export default function SdVerificationPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [payments, setPayments] = useState<SdPayment[]>([]);
  const [records, setRecords] = useState<SdVerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [hideComplete, setHideComplete] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [paymentsResp, dbRecords] = await Promise.all([
        fetch('/api/sd-tournament', { cache: 'no-store' }).then((r) => r.json()),
        getSdVerificationRecords(),
      ]);
      if (paymentsResp.error) throw new Error(paymentsResp.error);
      setPayments(paymentsResp.payments ?? []);
      setRecords(dbRecords);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const rows: Row[] = useMemo(() => {
    const byPid = new Map(records.map((r) => [r.paymentId, r]));
    return payments
      .map<Row>((p) => {
        const rec = byPid.get(p.id);
        return {
          paymentId: p.id,
          playerName: p.playerName,
          team: p.team,
          playerCount: p.playerCount,
          source: p.source,
          birthCertStatus: rec?.birthCertStatus ?? 'missing',
          gradeProofStatus: rec?.gradeProofStatus ?? 'missing',
          notes: rec?.notes ?? '',
          updatedAt: rec?.updatedAt,
        };
      })
      .sort((a, b) => {
        const sa = statusScore(a);
        const sb = statusScore(b);
        if (sa !== sb) return sa - sb;
        return a.playerName.localeCompare(b.playerName);
      });
  }, [payments, records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (teamFilter !== 'all' && r.team !== teamFilter) return false;
      if (hideComplete && statusScore(r) === 2) return false;
      if (q && !r.playerName.toLowerCase().includes(q) && !r.team.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, teamFilter, search, hideComplete]);

  const totals = useMemo(() => {
    let totalPlayers = 0;
    let bcVerified = 0;
    let gpVerified = 0;
    let bothVerified = 0;
    for (const r of rows) {
      totalPlayers += r.playerCount;
      const bc = r.birthCertStatus === 'verified';
      const gp = r.gradeProofStatus === 'verified';
      if (bc) bcVerified += r.playerCount;
      if (gp) gpVerified += r.playerCount;
      if (bc && gp) bothVerified += r.playerCount;
    }
    return { totalPlayers, bcVerified, gpVerified, bothVerified };
  }, [rows]);

  async function toggle(
    row: Row,
    field: 'birthCertStatus' | 'gradeProofStatus',
  ) {
    if (!user) return;
    const next: VerificationStatus = row[field] === 'verified' ? 'missing' : 'verified';
    setSavingId(row.paymentId + ':' + field);

    setRecords((prev) => {
      const existing = prev.find((r) => r.paymentId === row.paymentId);
      const stamp = Date.now();
      const patched: SdVerificationRecord = existing
        ? { ...existing, [field]: next, updatedAt: stamp }
        : {
            id: row.paymentId,
            paymentId: row.paymentId,
            playerName: row.playerName,
            team: row.team,
            playerCount: row.playerCount,
            birthCertStatus: field === 'birthCertStatus' ? next : 'missing',
            gradeProofStatus: field === 'gradeProofStatus' ? next : 'missing',
            updatedAt: stamp,
          };
      if (field === 'birthCertStatus' && next === 'verified') patched.birthCertCheckedAt = stamp;
      if (field === 'gradeProofStatus' && next === 'verified') patched.gradeProofCheckedAt = stamp;
      return existing
        ? prev.map((r) => (r.paymentId === row.paymentId ? patched : r))
        : [...prev, patched];
    });

    try {
      const stamp = Date.now();
      const fieldUpdate: Partial<SdVerificationRecord> = {
        playerName: row.playerName,
        team: row.team,
        playerCount: row.playerCount,
        [field]: next,
        updatedBy: user.email ?? user.uid,
      };
      if (field === 'birthCertStatus' && next === 'verified') {
        fieldUpdate.birthCertCheckedAt = stamp;
      }
      if (field === 'gradeProofStatus' && next === 'verified') {
        fieldUpdate.gradeProofCheckedAt = stamp;
      }
      await upsertSdVerification(row.paymentId, fieldUpdate);
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
      load();
    } finally {
      setSavingId(null);
    }
  }

  async function saveNote(row: Row) {
    if (!user) return;
    const note = noteDraft[row.paymentId] ?? row.notes ?? '';
    setSavingId(row.paymentId + ':notes');
    try {
      await upsertSdVerification(row.paymentId, {
        playerName: row.playerName,
        team: row.team,
        playerCount: row.playerCount,
        notes: note,
        updatedBy: user.email ?? user.uid,
      });
      setRecords((prev) => {
        const existing = prev.find((r) => r.paymentId === row.paymentId);
        if (existing) {
          return prev.map((r) =>
            r.paymentId === row.paymentId ? { ...r, notes: note, updatedAt: Date.now() } : r,
          );
        }
        return [
          ...prev,
          {
            id: row.paymentId,
            paymentId: row.paymentId,
            playerName: row.playerName,
            team: row.team,
            playerCount: row.playerCount,
            birthCertStatus: row.birthCertStatus,
            gradeProofStatus: row.gradeProofStatus,
            notes: note,
            updatedAt: Date.now(),
          },
        ];
      });
      setNoteDraft((d) => {
        const next = { ...d };
        delete next[row.paymentId];
        return next;
      });
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingId(null);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-muted text-sm">Loading…</p>
      </div>
    );
  }

  const percent = totals.totalPlayers === 0
    ? 0
    : Math.round((totals.bothVerified / totals.totalPlayers) * 100);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />

      <main className="max-w-[1280px] mx-auto px-3 md:px-6 py-4 md:py-8">
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/dashboard/sd-tournament"
            className="text-text-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeft size={14} />
            SD Tournament
          </Link>
        </div>

        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
              San Diego Tournament
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1 leading-tight">
              Age &amp; Grade Verification
            </h1>
            <div className="text-sm text-text-muted mt-1">
              Mark each player as you receive their birth certificate &amp; grade proof at the registration desk.
            </div>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-text-secondary bg-surface-elevated border border-border hover:border-border-hover disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Updating' : 'Refresh'}
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-error/30 bg-error/5 text-error text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Summary */}
        <section className="rounded-2xl border border-border bg-surface-elevated p-5 md:p-6 mb-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                Fully verified
              </div>
              <div className="text-3xl md:text-4xl font-bold tabular-nums">
                {totals.bothVerified}
                <span className="text-xl text-text-muted">/{totals.totalPlayers}</span>
              </div>
              <div className="text-[11px] text-text-muted mt-1">{percent}% complete</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                Birth cert
              </div>
              <div className="text-3xl md:text-4xl font-bold tabular-nums text-success">
                {totals.bcVerified}
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                {totals.totalPlayers - totals.bcVerified} missing
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                Grade proof
              </div>
              <div className="text-3xl md:text-4xl font-bold tabular-nums text-success">
                {totals.gpVerified}
              </div>
              <div className="text-[11px] text-text-muted mt-1">
                {totals.totalPlayers - totals.gpVerified} missing
              </div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-background overflow-hidden mt-5">
            <div
              className="h-full transition-all duration-700 ease-out"
              style={{
                width: `${percent}%`,
                background: 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-light) 100%)',
              }}
            />
          </div>
        </section>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player or team…"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface-elevated border border-border focus:border-accent text-sm outline-none transition-colors text-foreground"
            />
          </div>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-surface-elevated border border-border focus:border-accent text-sm outline-none transition-colors text-foreground"
          >
            <option value="all">All teams</option>
            {TEAM_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            onClick={() => setHideComplete((v) => !v)}
            className={`px-3 py-2.5 rounded-lg text-xs font-medium transition-colors border ${
              hideComplete
                ? 'bg-accent/10 border-accent/30 text-accent'
                : 'bg-surface-elevated border-border text-text-muted hover:text-foreground'
            }`}
          >
            {hideComplete ? 'Hiding verified' : 'Showing all'}
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-xl skeleton" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface-elevated px-6 py-16 text-center">
            <div className="text-text-muted text-sm">
              {rows.length === 0
                ? 'No paid players yet. They will show up here as parents complete payment.'
                : 'No players match the current filters.'}
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => {
              const bc = r.birthCertStatus === 'verified';
              const gp = r.gradeProofStatus === 'verified';
              const fullyVerified = bc && gp;
              const noteValue = noteDraft[r.paymentId] ?? r.notes;
              const noteDirty = noteValue !== r.notes;
              return (
                <li
                  key={r.paymentId}
                  className={`rounded-xl border bg-surface-elevated overflow-hidden transition-colors ${
                    fullyVerified
                      ? 'border-success/30 bg-success/5'
                      : 'border-border'
                  }`}
                >
                  <div className="p-3 md:p-4">
                    <div className="flex items-baseline justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm md:text-base truncate">
                          {r.playerName}
                          {r.playerCount > 1 && (
                            <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent align-middle">
                              {r.playerCount} players
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5 truncate">
                          {r.team}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          fullyVerified
                            ? 'bg-success/10 text-success'
                            : statusScore(r) === 1
                            ? 'bg-warning/10 text-warning'
                            : 'bg-error/10 text-error'
                        }`}
                      >
                        {fullyVerified ? 'Verified' : statusScore(r) === 1 ? 'Partial' : 'Missing'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => toggle(r, 'birthCertStatus')}
                        disabled={savingId === r.paymentId + ':birthCertStatus'}
                        className={`flex items-center justify-between gap-2 px-3 py-3 rounded-lg border text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-60 ${
                          bc
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-border bg-background text-text-muted hover:border-border-hover'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              bc ? 'border-success bg-success/20' : 'border-border'
                            }`}
                          >
                            {bc && <Check size={12} className="text-success" />}
                          </span>
                          <span>Birth cert</span>
                        </span>
                      </button>
                      <button
                        onClick={() => toggle(r, 'gradeProofStatus')}
                        disabled={savingId === r.paymentId + ':gradeProofStatus'}
                        className={`flex items-center justify-between gap-2 px-3 py-3 rounded-lg border text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-60 ${
                          gp
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-border bg-background text-text-muted hover:border-border-hover'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                              gp ? 'border-success bg-success/20' : 'border-border'
                            }`}
                          >
                            {gp && <Check size={12} className="text-success" />}
                          </span>
                          <span>Grade proof</span>
                        </span>
                      </button>
                    </div>

                    <div className="mt-2.5 flex gap-2 items-start">
                      <input
                        value={noteValue}
                        onChange={(e) =>
                          setNoteDraft((d) => ({ ...d, [r.paymentId]: e.target.value }))
                        }
                        onBlur={() => noteDirty && saveNote(r)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="Notes (e.g. brought physical copy, missing grade)…"
                        className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border focus:border-accent text-[12px] outline-none transition-colors text-foreground placeholder:text-text-muted"
                      />
                      {noteDirty && (
                        <button
                          onClick={() => saveNote(r)}
                          disabled={savingId === r.paymentId + ':notes'}
                          className="shrink-0 px-3 py-2 rounded-lg text-[11px] font-medium text-white inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                          style={{ background: 'var(--color-accent)' }}
                        >
                          {savingId === r.paymentId + ':notes' ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <Save size={11} />
                          )}
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] text-text-muted mt-6 text-center">
          Roster comes from paid Stripe + Zelle entries on the SD tournament dashboard. Tap a button to toggle verification. Notes auto-save when you click away.
        </p>
      </main>
    </div>
  );
}
