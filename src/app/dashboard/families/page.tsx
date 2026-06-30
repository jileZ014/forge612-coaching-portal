'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { teamConfig } from '@/lib/team-config';
import { getFamilies } from '@/lib/firestore-helpers';
import type { Family, LifecycleStage } from '@/lib/types';
import { LIFECYCLE_STAGES } from '@/lib/types';
import { ArrowLeft, Plus, Search } from 'lucide-react';
import { CountUp } from '@/components/ui/CountUp';

// Calm dark-mode stage chips — muted tints, one quiet hue per group (not the old rainbow).
const STAGE_COLORS: Record<LifecycleStage, string> = {
  lead:       'bg-white/[0.08] text-white/60',
  tryout:     'bg-amber-400/10 text-amber-200/80',
  offered:    'bg-amber-400/10 text-amber-200/80',
  committed:  'bg-sky-400/10 text-sky-200/80',
  registered: 'bg-sky-400/10 text-sky-200/80',
  active:     'bg-emerald-400/10 text-emerald-200/80',
  lapsed:     'bg-white/[0.06] text-white/45',
  alumni:     'bg-violet-400/10 text-violet-200/80',
  declined:   'bg-red-400/10 text-red-200/80',
};

export default function FamiliesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<LifecycleStage | 'all'>('all');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const f = await getFamilies();
      setFamilies(f);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: families.length };
    for (const stage of LIFECYCLE_STAGES) counts[stage] = 0;
    for (const f of families) {
      counts[f.lifecycleStage] = (counts[f.lifecycleStage] ?? 0) + 1;
    }
    return counts;
  }, [families]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return families.filter((f) => {
      if (stageFilter !== 'all' && f.lifecycleStage !== stageFilter) return false;
      if (q) {
        const hay = [
          f.primaryParentName,
          f.primaryParentEmail,
          f.primaryParentPhone,
          f.secondaryParentName ?? '',
          f.notes ?? '',
          ...(f.tags ?? []),
        ].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [families, search, stageFilter]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="skeleton h-7 w-40 rounded mb-6" />
          <div className="skeleton h-9 w-full rounded mb-4" />
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="bg-[#0A0A0A] border-b border-white/[0.09] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-xl font-semibold tracking-tight text-white">Families</h1>
            <span className="text-white/40 text-sm tabular-nums"><CountUp value={families.length} /> total</span>
          </div>
          <Link
            href="/dashboard/onboarding/new"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
            style={{ background: teamConfig.accentColor }}
          >
            <Plus size={16} /> New Family
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setStageFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              stageFilter === 'all' ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-white/55 border border-white/[0.08] hover:text-white'
            }`}
          >
            All ({stageCounts.all})
          </button>
          {LIFECYCLE_STAGES.map((stage) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                stageFilter === stage ? 'bg-white/15 text-white' : `${STAGE_COLORS[stage]} hover:brightness-125`
              }`}
            >
              {stage} ({stageCounts[stage] ?? 0})
            </button>
          ))}
        </div>

        <div className="relative mb-5">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, tags, notes…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-white/[0.09] bg-white/[0.03] focus:border-white/20 focus:outline-none text-white placeholder:text-white/30"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white/[0.03] rounded-xl border border-white/[0.09] p-16 text-center text-white/40">
            {families.length === 0
              ? 'No families yet. Add your first via "New Family".'
              : 'No families match the current filter.'}
          </div>
        ) : (
          <div className="bg-white/[0.02] rounded-xl border border-white/[0.09] divide-y divide-white/[0.06] overflow-hidden">
            {filtered.map((f, i) => (
              <Link
                key={f.id}
                href={`/dashboard/families/${f.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors animate-fade-up"
                style={{ ['--delay' as string]: `${Math.min(i, 12) * 40}ms` }}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-white truncate">{f.primaryParentName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLORS[f.lifecycleStage]}`}>
                      {f.lifecycleStage}
                    </span>
                  </div>
                  <div className="text-sm text-white/45 truncate">
                    {f.primaryParentEmail}
                    {f.primaryParentPhone && <span> · {f.primaryParentPhone}</span>}
                    {f.playerIds.length > 0 && <span> · {f.playerIds.length} player{f.playerIds.length === 1 ? '' : 's'}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end max-w-[40%]">
                  {(f.tags ?? []).slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-white/[0.06] text-white/55">
                      {tag}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
