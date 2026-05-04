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
  lead: 'bg-slate-200 text-slate-700',
  tryout: 'bg-amber-200 text-amber-900',
  offered: 'bg-yellow-200 text-yellow-900',
  committed: 'bg-blue-200 text-blue-900',
  registered: 'bg-indigo-200 text-indigo-900',
  active: 'bg-emerald-200 text-emerald-900',
  lapsed: 'bg-orange-200 text-orange-900',
  alumni: 'bg-violet-200 text-violet-900',
  declined: 'bg-rose-200 text-rose-900',
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
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState<string | null>(null);

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

  async function sendSms() {
    if (!family || !smsBody.trim()) return;
    setSmsSending(true);
    setSmsResult(null);
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ familyId: family.id, body: smsBody }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setSmsBody('');
        setSmsResult(`Sent (${data.delivery?.status ?? 'queued'})`);
        await load();
      } else {
        setSmsResult(`Failed: ${data.error ?? 'unknown error'}`);
      }
    } catch (err) {
      setSmsResult(`Error: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSmsSending(false);
    }
  }

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: teamConfig.primaryColor }}>
        <p className="text-white">Loading…</p>
      </div>
    );
  }

  if (!family) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-700 mb-4">Family not found.</p>
          <Link href="/dashboard/families" className="text-blue-600 hover:underline">
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Link href="/dashboard/families" className="text-slate-500 hover:text-slate-900">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900">{family.primaryParentName}</h1>
            <span className={`text-xs px-2 py-1 rounded-full ${STAGE_COLORS[family.lifecycleStage]}`}>
              {family.lifecycleStage}
            </span>
            {family.doNotContact && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">do-not-contact</span>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-600">
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

        <nav className="max-w-6xl mx-auto px-6 flex gap-1 border-t border-slate-100">
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                tab === key
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon size={14} />
              {label}
              {count !== undefined && (
                <span className="text-xs text-slate-400">({count})</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-md border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Lifecycle</h2>
              <div className="flex flex-wrap gap-1.5">
                {LIFECYCLE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => changeStage(stage)}
                    className={`text-xs px-2.5 py-1 rounded-full transition ${
                      family.lifecycleStage === stage
                        ? `${STAGE_COLORS[stage]} ring-2 ring-slate-900`
                        : `${STAGE_COLORS[stage]} opacity-60 hover:opacity-100`
                    }`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
              {family.lifecycleStageChangedAt && (
                <p className="text-xs text-slate-500 mt-3">
                  Last changed {new Date(family.lifecycleStageChangedAt).toLocaleDateString()}
                </p>
              )}
            </section>

            <section className="bg-white rounded-md border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Tag size={16} /> Tags
              </h2>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(family.tags ?? []).length === 0 && (
                  <p className="text-sm text-slate-500">No tags yet.</p>
                )}
                {(family.tags ?? []).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => removeTag(tag)}
                    className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-rose-100 hover:text-rose-700 transition"
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
                  className="flex-1 px-3 py-1.5 rounded-md border border-slate-200 text-sm focus:border-slate-400 focus:outline-none"
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

            <section className="bg-white rounded-md border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <Send size={16} /> Send SMS
              </h2>
              <textarea
                value={smsBody}
                onChange={(e) => setSmsBody(e.target.value)}
                placeholder={`Message to ${family.primaryParentName.split(' ')[0]}…`}
                rows={4}
                disabled={family.doNotContact}
                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
              />
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={toggleDoNotContact}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  {family.doNotContact ? 'Re-enable contact' : 'Mark do-not-contact'}
                </button>
                <button
                  onClick={sendSms}
                  disabled={smsSending || !smsBody.trim() || family.doNotContact}
                  className="px-4 py-1.5 rounded-md text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: teamConfig.accentColor }}
                >
                  {smsSending ? 'Sending…' : 'Send SMS'}
                </button>
              </div>
              {smsResult && <p className="text-xs mt-2 text-slate-600">{smsResult}</p>}
            </section>

            <section className="bg-white rounded-md border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-900 mb-3">Log a note</h2>
              <input
                value={noteSummary}
                onChange={(e) => setNoteSummary(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNote()}
                placeholder='e.g. "Called about July tournament — left voicemail"'
                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:border-slate-400 focus:outline-none mb-3"
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
          <div className="bg-white rounded-md border border-slate-200">
            {players.length === 0 ? (
              <p className="p-12 text-center text-slate-500">No players linked to this family yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {players.map((p) => (
                  <div key={p.id} className="px-5 py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="text-sm text-slate-500">
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
          <div className="bg-white rounded-md border border-slate-200">
            {payments.length === 0 ? (
              <p className="p-12 text-center text-slate-500">No payment history yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-left">
                  <tr>
                    <th className="px-5 py-2 font-medium">Player</th>
                    <th className="px-5 py-2 font-medium">Amount</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.status === 'partial'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-slate-500">
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
          <div className="bg-white rounded-md border border-slate-200">
            {comms.length === 0 ? (
              <p className="p-12 text-center text-slate-500">No communications logged yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {comms.map((c) => (
                  <div key={c.id} className="px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-slate-500">
                          {c.channel} · {c.direction}
                        </span>
                        {c.twilioStatus && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {c.twilioStatus}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(c.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-900">{c.summary}</p>
                    {c.body && (
                      <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap font-mono text-xs bg-slate-50 rounded p-2 border border-slate-100">
                        {c.body}
                      </p>
                    )}
                    {c.authorEmail && (
                      <p className="text-xs text-slate-400 mt-1">by {c.authorEmail}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'documents' && (
          <div className="bg-white rounded-md border border-slate-200 p-5">
            {docs.length === 0 ? (
              <p className="text-center text-slate-500 py-12">
                No documents uploaded yet. Upload UI ships in v0.1.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {docs.map((d) => (
                  <li key={d.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{d.fileName}</p>
                      <p className="text-xs text-slate-500">
                        {d.type} · {(d.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                        {new Date(d.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <a
                      href={d.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
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
