'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { useAuth } from '@/lib/auth-context';
import { getAllRosters } from '@/lib/firestore-helpers';
import type { RosterPlayer } from '@/lib/types';
import {
  RefreshCw,
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Users,
  MessageSquare,
} from 'lucide-react';

type TeamMeta = {
  code: string;
  label: string;
  shortLabel: string;
  coach: string;
};

const TEAMS: TeamMeta[] = [
  { code: '16u-rob', label: '16u (Coach Rob)', shortLabel: '16u', coach: 'Coach Rob' },
  { code: '15u-white', label: '15u (Coach White)', shortLabel: '15u', coach: 'Coach White' },
  { code: '14u-jonas', label: '14u (Coach Jonas)', shortLabel: '14u', coach: 'Coach Jonas' },
  { code: '13u-josiah', label: '13u (Coach Josiah)', shortLabel: '13u', coach: 'Coach Josiah' },
  { code: '10u-salo', label: '10u (Coach Salo)', shortLabel: '10u', coach: 'Coach Salo' },
  { code: '9u-toni', label: '9u (Coach Toni)', shortLabel: '9u', coach: 'Coach Toni' },
];

export default function RosterAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getAllRosters();
      setRoster(data);
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

  const byTeam = useMemo(() => {
    const m: Record<string, RosterPlayer[]> = {};
    for (const t of TEAMS) m[t.code] = [];
    for (const p of roster) {
      if (m[p.teamCode]) m[p.teamCode].push(p);
    }
    return m;
  }, [roster]);

  const totals = useMemo(() => {
    const submitted = TEAMS.filter((t) => byTeam[t.code].length > 0).length;
    const players = roster.length;
    const complete = roster.filter((p) => {
      const hasParent = (p.parentFirstName && p.parentLastName) || p.parentName;
      return p.firstName && p.lastName && p.age && p.birthday && p.phone && hasParent && p.grade;
    }).length;
    return { submitted, players, complete };
  }, [byTeam, roster]);

  async function copyLink(team: TeamMeta) {
    const url = `${origin}/roster/${team.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(team.code);
      setTimeout(() => setCopiedCode((c) => (c === team.code ? null : c)), 2000);
    } catch {
      setError('Copy failed — long-press the link to copy manually.');
    }
  }

  function smsLink(team: TeamMeta): string {
    const url = `${origin}/roster/${team.code}`;
    const body =
      `Hey ${team.coach}, Coach Jonas. Please enter your ${team.shortLabel} roster for the San Diego tournament here: ${url} ` +
      `Need first/last name, age, phone, parent name, grade, HS, grad year for each player. Auto-saves as you go.`;
    return `sms:?&body=${encodeURIComponent(body)}`;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-text-muted text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeader />

      <main className="max-w-[1280px] mx-auto px-4 md:px-6 py-6 md:py-8">
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/dashboard/sd-tournament"
            className="text-text-muted hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <ArrowLeft size={14} />
            SD Tournament
          </Link>
        </div>

        <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
              San Diego Tournament
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-1 leading-tight">Team Rosters</h1>
            <div className="text-sm text-text-muted mt-1">
              Send each coach their team&rsquo;s link. They fill in player details, you see everything live.
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
          <div className="mb-4 px-4 py-3 rounded-lg border border-error/30 bg-error/5 text-error text-sm flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary */}
        <section className="rounded-2xl border border-border bg-surface-elevated p-5 md:p-6 mb-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                Teams submitted
              </div>
              <div className="text-3xl md:text-4xl font-bold tabular-nums">
                {totals.submitted}
                <span className="text-xl text-text-muted">/6</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                Players entered
              </div>
              <div className="text-3xl md:text-4xl font-bold tabular-nums">{totals.players}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">
                Complete rows
              </div>
              <div className="text-3xl md:text-4xl font-bold tabular-nums text-success">
                {totals.complete}
              </div>
              <div className="text-[11px] text-text-muted mt-1">all 6 required fields</div>
            </div>
          </div>
        </section>

        {/* Team cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {TEAMS.map((team) => {
            const players = byTeam[team.code] ?? [];
            const url = origin ? `${origin}/roster/${team.code}` : `/roster/${team.code}`;
            const copied = copiedCode === team.code;
            return (
              <section
                key={team.code}
                className="rounded-2xl border border-border bg-surface-elevated overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{team.shortLabel}</div>
                    <div className="text-xs text-text-muted">{team.coach}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold tabular-nums leading-none">
                      {players.length}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mt-1">
                      players
                    </div>
                  </div>
                </div>

                <div className="px-5 py-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyLink(team)}
                      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        copied
                          ? 'border-success/40 bg-success/10 text-success'
                          : 'border-border bg-background hover:border-accent text-foreground'
                      }`}
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <a
                      href={smsLink(team)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white shadow-lg shadow-black/20 transition-all hover:scale-[1.02]"
                      style={{ background: 'var(--color-accent)' }}
                    >
                      <MessageSquare size={13} />
                      Text coach
                    </a>
                    <Link
                      href={`/roster/${team.code}`}
                      target="_blank"
                      className="flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium border border-border bg-background hover:border-border-hover text-text-secondary transition-colors"
                      title="Open roster page"
                    >
                      <ExternalLink size={13} />
                    </Link>
                  </div>

                  <div className="text-[11px] text-text-muted font-mono break-all bg-background border border-border rounded-md px-2 py-1.5">
                    {url}
                  </div>

                  {players.length === 0 ? (
                    <div className="text-xs text-text-muted italic py-2">
                      No players submitted yet
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {players.map((p, i) => {
                        const name =
                          [p.firstName, p.lastName].filter(Boolean).join(' ') ||
                          `Player ${i + 1}`;
                        const parentDisplay =
                          [p.parentFirstName, p.parentLastName].filter(Boolean).join(' ') ||
                          p.parentName ||
                          '';
                        const meta = [
                          p.age ? `age ${p.age}` : null,
                          p.birthday || null,
                          p.grade ? p.grade : null,
                          p.highSchool || null,
                        ]
                          .filter(Boolean)
                          .join(' · ');
                        const hasParent =
                          (p.parentFirstName && p.parentLastName) || p.parentName;
                        const complete =
                          p.firstName &&
                          p.lastName &&
                          p.age &&
                          p.birthday &&
                          p.phone &&
                          hasParent &&
                          p.grade;
                        return (
                          <li
                            key={p.id}
                            className="py-2 flex items-start gap-2 text-xs"
                          >
                            <span
                              className={`shrink-0 w-1.5 h-1.5 rounded-full mt-1.5 ${
                                complete ? 'bg-success' : 'bg-warning'
                              }`}
                              title={complete ? 'Complete' : 'Missing required fields'}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-foreground truncate">{name}</div>
                              {meta && (
                                <div className="text-[11px] text-text-muted truncate">
                                  {meta}
                                </div>
                              )}
                              {(p.phone || parentDisplay) && (
                                <div className="text-[11px] text-text-muted truncate">
                                  {parentDisplay}
                                  {parentDisplay && p.phone ? ' · ' : ''}
                                  {p.phone}
                                </div>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {loading && roster.length === 0 && (
          <div className="text-center text-text-muted text-sm py-8">
            <Users size={20} className="inline mb-2" />
            <div>Loading rosters…</div>
          </div>
        )}

        <p className="text-[11px] text-text-muted mt-2 text-center">
          Auto-refresh as coaches type. Tap &ldquo;Text coach&rdquo; to open Messages with the link
          pre-filled.
        </p>
      </main>
    </div>
  );
}
