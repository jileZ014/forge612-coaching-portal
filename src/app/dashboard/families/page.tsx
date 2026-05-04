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

const STAGE_COLORS: Record<LifecycleStage, string> = {
  lead:       'bg-slate-200 text-slate-700',
  tryout:     'bg-amber-200 text-amber-900',
  offered:    'bg-yellow-200 text-yellow-900',
  committed:  'bg-blue-200 text-blue-900',
  registered: 'bg-indigo-200 text-indigo-900',
  active:     'bg-emerald-200 text-emerald-900',
  lapsed:     'bg-orange-200 text-orange-900',
  alumni:     'bg-violet-200 text-violet-900',
  declined:   'bg-rose-200 text-rose-900',
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: teamConfig.primaryColor }}>
        <p className="text-white">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-slate-500 hover:text-slate-900">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">Families</h1>
            <span className="text-slate-500 text-sm">{families.length} total</span>
          </div>
          <Link
            href="/dashboard/onboarding/new"
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white"
            style={{ background: teamConfig.accentColor }}
          >
            <Plus size={16} /> New Family
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setStageFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              stageFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            All ({stageCounts.all})
          </button>
          {LIFECYCLE_STAGES.map((stage) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                stageFilter === stage ? 'bg-slate-900 text-white' : `${STAGE_COLORS[stage]} hover:brightness-95`
              }`}
            >
              {stage} ({stageCounts[stage] ?? 0})
            </button>
          ))}
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, phone, tags, notes…"
            className="w-full pl-10 pr-4 py-2.5 rounded-md border border-slate-200 focus:border-slate-400 focus:outline-none bg-white"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-md border border-slate-200 p-12 text-center text-slate-500">
            {families.length === 0
              ? 'No families yet. Add your first via "New Family".'
              : 'No families match the current filter.'}
          </div>
        ) : (
          <div className="bg-white rounded-md border border-slate-200 divide-y divide-slate-100">
            {filtered.map((f) => (
              <Link
                key={f.id}
                href={`/dashboard/families/${f.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900 truncate">{f.primaryParentName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLORS[f.lifecycleStage]}`}>
                      {f.lifecycleStage}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 truncate">
                    {f.primaryParentEmail}
                    {f.primaryParentPhone && <span> · {f.primaryParentPhone}</span>}
                    {f.playerIds.length > 0 && <span> · {f.playerIds.length} player{f.playerIds.length === 1 ? '' : 's'}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-end max-w-[40%]">
                  {(f.tags ?? []).slice(0, 3).map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
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
