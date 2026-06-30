'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { teamConfig } from '@/lib/team-config';
import {
  getFamily,
  setFamilyLifecycleStage,
  updateFamily,
  getPlayersForFamily,
  getCommunicationsForFamily,
  getDocumentsForFamily,
  getPayments,
} from '@/lib/firestore-helpers';
import type {
  Family,
  Player,
  Communication,
  FamilyDocument,
  Payment,
  LifecycleStage,
} from '@/lib/types';
import { LIFECYCLE_STAGES } from '@/lib/types';
import {
  ArrowLeft,
  Mail,
  Phone,
  Send,
  MessageSquare,
  FileText,
  CreditCard,
  Users,
  StickyNote,
  Tag,
} from 'lucide-react';

const STAGE_COLORS: Record<LifecycleStage, string> = {
  lead: 'bg-[#141418]/[0.08] text-white/60',
  tryout: 'bg-amber-400/10 text-amber-200/80',
  offered: 'bg-amber-400/10 text-amber-200/80',
  committed: 'bg-sky-400/10 text-sky-200/80',
  registered: 'bg-sky-400/10 text-sky-200/80',
  active: 'bg-emerald-400/10 text-emerald-200/80',
  lapsed: 'bg-[#141418]/[0.06] text-white/45',
  alumni: 'bg-violet-400/10 text-violet-200/80',
  declined: 'bg-red-400/10 text-red-200/80',
};

type Tab = 'overview' | 'players' | 'payments' | 'comms' | 'documents';

export default function FamilyHubPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [family, setFamily] = useState<Family | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [comms, setComms] = useState<Communication[]>([]);
  const [docs, setDocs] = useState<FamilyDocument[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [smsBody, setSmsBody] = useState('');

  const [noteSummary, setNoteSummary] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const f = await getFamily(id);
    setFamily(f);
    if (!f) {
      setLoading(false);
      return;
    }
    const [p, c, d, allPay] = await Promise.all([
      getPlayersForFamily(id),
      getCommunicationsForFamily(id, 50),
      getDocumentsForFamily(id),
      getPayments(),
    ]);
    setPlayers(p);
    setComms(c);
    setDocs(d);
    const playerIds = new Set(p.map((pl) => pl.id));
    setPayments(allPay.filter((pay) => playerIds.has(pay.playerId)));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function authHeaders(): Promise<HeadersInit> {
    const token = user ? await user.getIdToken() : '';
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }

  async function changeStage(stage: LifecycleStage) {
    if (!family) return;
    await setFamilyLifecycleStage(family.id, stage);
    await load();
  }

  // SMS via Twilio retired — A2P 10DLC unregistered (carrier-blocked after 5 attempts).
  // Parent contact now goes through mailto + sms: deep links from the coach's own account (no A2P needed).

  async function saveNote() {
    if (!family || !noteSummary.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch('/api/communications/log', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          familyId: family.id,
          channel: 'phone',
          direction: 'outbound',
          summary: noteSummary,
        }),
      });
      if (res.ok) {
        setNoteSummary('');
        await load();
      }
    } finally {
      setNoteSaving(false);
    }
  }

  async function addTag() {
    if (!family || !newTag.trim()) return;
    const tag = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    const existing = family.tags ?? [];
    if (existing.includes(tag)) {
      setNewTag('');
      return;
    }
    await updateFamily(family.id, { tags: [...existing, tag] });
    setNewTag('');
    await load();
  }

  async function removeTag(tag: string) {
    if (!family) return;
    const next = (family.tags ?? []).filter((t) => t !== tag);
    await updateFamily(family.id, { tags: next });
    await load();
  }

  async function toggleDoNotContact() {
    if (!family) return;
    await updateFamily(family.id, { doNotContact: !family.doNotContact });
    await load();
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <p className="text-white">Loading…</p>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/70 mb-4">Family not found.</p>
          <Link href="/dashboard/families" className="text-white/70 hover:underline">
            Back to families
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof Users; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: StickyNote },
    { key: 'players', label: 'Players', icon: Users, count: players.length },
    { key: 'payments', label: 'Payments', icon: CreditCard, count: payments.length },
    { key: 'comms', label: 'Communications', icon: MessageSquare, count: comms.length },
    { key: 'documents', label: 'Documents', icon: FileText, count: docs.length },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <header className="bg-[#141418] border-b border-white/[0.09] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/dashboard/families" className="text-white/45 hover:text-white">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-semibold text-white">{family.primaryParentName}</h1>
            <span className={`text-xs px-2 py-1 rounded-full ${STAGE_COLORS[family.lifecycleStage]}`}>
              {family.lifecycleStage}
            </span>
            {family.doNotContact && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-400/10 text-red-200/80">do-not-contact</span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-white/55">
            {family.primaryParentEmail && (
              <span className="inline-flex items-center gap-1.5">
                <Mail size={14} /> {family.primaryParentEmail}
              </span>
            )}
            {family.primaryParentPhone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} /> {family.primaryParentPhone}
              </span>
            )}
          </div>
        </div>

        <nav className="max-w-6xl mx-auto px-6 flex gap-1 border-t border-white/[0.06]">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                tab === key
                  ? 'border-white text-white'
                  : 'border-transparent text-white/45 hover:text-white'
              }`}
            >
              <Icon size={14} />
              {label}
              {count !== undefined && (
                <span className="text-xs text-white/35">({count})</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 animate-fade-up">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-[#141418] rounded-md border border-white/[0.09] p-5">
              <h2 className="font-semibold text-white mb-3">Lifecycle</h2>
              <div className="flex flex-wrap gap-1.5">
                {LIFECYCLE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => changeStage(stage)}
                    className={`text-xs px-2.5 py-1 rounded-full transition ${
                      family.lifecycleStage === stage
                        ? `${STAGE_COLORS[stage]} ring-2 ring-white/40`
                        : `${STAGE_COLORS[stage]} opacity-60 hover:opacity-100`
                    }`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
              {family.lifecycleStageChangedAt && (
                <p className="text-xs text-white/45 mt-3">
                  Last changed {new Date(family.lifecycleStageChangedAt).toLocaleDateString()}
                </p>
              )}
            </section>

            <section className="bg-[#141418] rounded-md border border-white/[0.09] p-5">
              <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Tag size={16} /> Tags
              </h2>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(family.tags ?? []).length === 0 && (
                  <p className="text-sm text-white/45">No tags yet.</p>
                )}
                {(family.tags ?? []).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => removeTag(tag)}
                    className="text-xs px-2.5 py-1 rounded bg-white/10 text-white/70 hover:bg-red-400/10 hover:text-red-200/80 transition"
                    title="Click to remove"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  placeholder="Add a tag (e.g. needs-financial-aid)"
                  className="flex-1 px-3 py-1.5 rounded-md border border-white/[0.09] text-sm focus:border-white/30 focus:outline-none text-white placeholder:text-white/35"
                />
                <button
                  onClick={addTag}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-white"
                  style={{ background: teamConfig.accentColor }}
                >
                  Add
                </button>
              </div>
            </section>

            <section className="bg-[#141418] rounded-md border border-white/[0.09] p-5">
              <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Send size={16} /> Contact {family.primaryParentName.split(' ')[0]}
              </h2>
              <textarea
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                placeholder={`Message to ${family.primaryParentName.split(' ')[0]}…`}
                rows={4}
                disabled={family.doNotContact}
                className="w-full px-3 py-2 rounded-md border border-white/[0.09] text-sm focus:border-white/30 focus:outline-none text-white placeholder:text-white/35 disabled:bg-white/[0.02] disabled:text-white/30"
              />
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <a
                  href={family.primaryParentEmail && smsBody.trim() && !family.doNotContact ? `mailto:${family.primaryParentEmail}?subject=${encodeURIComponent('Message from your coach')}&body=${encodeURIComponent(smsBody)}` : undefined}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium text-white transition ${family.primaryParentEmail && smsBody.trim() && !family.doNotContact ? 'hover:brightness-110' : 'opacity-40 pointer-events-none'}`}
                  style={{ background: teamConfig.accentColor }}
                >
                  <Mail size={14} /> Email
                </a>
                <a
                  href={family.primaryParentPhone && smsBody.trim() && !family.doNotContact ? `sms:${family.primaryParentPhone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(smsBody)}` : undefined}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium text-white/80 border border-white/15 transition ${family.primaryParentPhone && smsBody.trim() && !family.doNotContact ? 'hover:bg-white/10' : 'opacity-40 pointer-events-none'}`}
                >
                  <MessageSquare size={14} /> Text
                </a>
                <button
                  onClick={toggleDoNotContact}
                  className="ml-auto text-xs text-white/45 hover:text-white"
                >
                  {family.doNotContact ? 'Re-enable contact' : 'Mark do-not-contact'}
                </button>
              </div>
              <p className="text-xs mt-3 text-white/40">
                Email opens your mail app and Text opens Messages, both prefilled and sent from your own account. Automated SMS stays off until carrier A2P clears.
              </p>
            </section>

            <section className="bg-[#141418] rounded-md border border-white/[0.09] p-5">
              <h2 className="font-semibold text-white mb-3">Log a note</h2>
              <input
                value={noteSummary}
                onChange={(e) => setNoteSummary(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNote()}
                placeholder='e.g. "Called about July tournament — left voicemail"'
                className="w-full px-3 py-2 rounded-md border border-white/[0.09] text-sm focus:border-white/30 focus:outline-none text-white placeholder:text-white/35 mb-3"
              />
              <button
                onClick={saveNote}
                disabled={noteSaving || !noteSummary.trim()}
                className="px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
                style={{ background: teamConfig.accentColor }}
              >
                {noteSaving ? 'Saving…' : 'Save note'}
              </button>
            </section>
          </div>
        )}

        {tab === 'players' && (
          <div className="bg-[#141418] rounded-md border border-white/[0.09]">
            {players.length === 0 ? (
              <p className="p-12 text-center text-white/45">No players linked to this family yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {players.map((p) => (
                  <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{p.name}</p>
                      <p className="text-sm text-white/45">
                        {p.position && <span>{p.position} · </span>}
                        {p.jerseyNumber !== undefined && p.jerseyNumber !== null && (
                          <span>#{p.jerseyNumber} · </span>
                        )}
                        {p.school && <span>{p.school}</span>}
                        {p.graduationYear && <span> · {p.graduationYear}</span>}
                        {!p.position && !p.jerseyNumber && !p.school && (
                          <span>{p.active ? 'Active' : 'Inactive'}</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'payments' && (
          <div className="bg-[#141418] rounded-md border border-white/[0.09]">
            {payments.length === 0 ? (
              <p className="p-12 text-center text-white/45">No payment history yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-[#0A0A0A] text-white/55 text-left">
                  <tr>
                    <th className="px-5 py-2 font-medium">Player</th>
                    <th className="px-5 py-2 font-medium">Amount</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {payments.map((p) => {
                    const player = players.find((pl) => pl.id === p.playerId);
                    return (
                      <tr key={p.id}>
                        <td className="px-5 py-2.5">{player?.name ?? p.playerId}</td>
                        <td className="px-5 py-2.5">${p.amount.toFixed(2)}</td>
                        <td className="px-5 py-2.5">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              p.status === 'paid'
                                ? 'bg-emerald-400/10 text-emerald-200/80'
                                : p.status === 'partial'
                                ? 'bg-amber-400/10 text-amber-200/80'
                                : 'bg-red-400/10 text-red-200/80'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-white/45">
                          {p.paidDate ? new Date(p.paidDate).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'comms' && (
          <div className="bg-[#141418] rounded-md border border-white/[0.09]">
            {comms.length === 0 ? (
              <p className="p-12 text-center text-white/45">No communications logged yet.</p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {comms.map((c) => (
                  <div key={c.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-white/45">
                          {c.channel} · {c.direction}
                        </span>
                        {c.twilioStatus && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/70">
                            {c.twilioStatus}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-white/45">
                        {new Date(c.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-white">{c.summary}</p>
                    {c.body && (
                      <p className="text-sm text-white/55 mt-1 whitespace-pre-wrap font-mono text-xs bg-[#0A0A0A] rounded p-2 border border-white/[0.06]">
                        {c.body}
                      </p>
                    )}
                    {c.authorEmail && (
                      <p className="text-xs text-white/35 mt-1">by {c.authorEmail}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="bg-[#141418] rounded-md border border-white/[0.09] p-5">
            {docs.length === 0 ? (
              <p className="text-center text-white/45 py-12">
                No documents uploaded yet. Upload UI ships in v0.1.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {docs.map((d) => (
                  <li key={d.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{d.fileName}</p>
                      <p className="text-xs text-white/45">
                        {d.type} · {(d.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                        {new Date(d.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-white/70 hover:underline"
                    >
                      View
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
