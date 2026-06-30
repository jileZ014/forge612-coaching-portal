'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { teamConfig } from '@/lib/team-config';
import {
  getSchedule,
  addScheduleEvent,
  updateScheduleEvent,
  deleteScheduleEvent,
} from '@/lib/firestore-helpers';
import type { ScheduleEvent, EventType } from '@/lib/types';
import { ArrowLeft, Plus, Clock, MapPin, Edit3, Trash2, XCircle, Calendar } from 'lucide-react';

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'game', label: 'Game' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'scrimmage', label: 'Scrimmage' },
];

function fmt(dateStr: string, opt: Intl.DateTimeFormatOptions) {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', opt);
  } catch {
    return dateStr;
  }
}

const ACCENT = teamConfig.accentColor;
const emptyForm = { title: '', type: 'practice' as EventType, date: '', startTime: '18:00', endTime: '19:30', location: '', notes: '' };

export default function SchedulePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const s = await getSchedule();
      s.sort((a, b) => a.date.localeCompare(b.date));
      setSchedule(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(ev: ScheduleEvent) {
    setEditingId(ev.id);
    setForm({
      title: ev.title, type: (ev.type as EventType) || 'practice', date: ev.date,
      startTime: ev.startTime, endTime: ev.endTime, location: ev.location, notes: ev.notes || '',
    });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const existing = schedule.find((s) => s.id === editingId);
    const data = { ...form, title: form.title.trim(), location: form.location.trim(), notes: form.notes.trim(), cancelled: existing?.cancelled || false };
    try {
      if (editingId) await updateScheduleEvent(editingId, data);
      else await addScheduleEvent(data);
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await deleteScheduleEvent(id);
    await load();
  }

  async function toggleCancel(ev: ScheduleEvent) {
    await updateScheduleEvent(ev.id, { cancelled: !ev.cancelled });
    await load();
  }

  const inputClass = 'w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-colors';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-[1000px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-white/50 hover:text-white transition-colors"><ArrowLeft size={22} /></Link>
            <div>
              <h1 className="text-2xl font-bold">Schedule</h1>
              <p className="text-white/45 text-sm">Practices, games, and tournaments</p>
            </div>
          </div>
          <button onClick={openAdd}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-bold uppercase tracking-wider text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: ACCENT }}>
            <Plus size={16} /> Add Event
          </button>
        </div>

        {showForm && (
          <form onSubmit={save} className="bg-[#141418] border border-white/10 rounded-xl p-6 mb-6 space-y-4">
            <h2 className="text-lg font-bold">{editingId ? 'Edit Event' : 'New Event'}</h2>
            <input className={inputClass} placeholder="Event title (e.g. Tuesday Practice)" required
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}>
                {EVENT_TYPES.map((t) => <option key={t.value} value={t.value} className="bg-[#141414]">{t.label}</option>)}
              </select>
              <input className={inputClass} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input className={inputClass} type="time" required value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              <input className={inputClass} type="time" required value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <input className={inputClass} placeholder="Location (e.g. Bombers Fieldhouse, Court 2)"
              value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <textarea className={inputClass} placeholder="Notes (optional)" rows={2}
              value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <div className="flex gap-3">
              <button type="submit" disabled={saving}
                className="flex-1 py-3 rounded-lg font-bold uppercase tracking-wider text-white transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: ACCENT }}>
                {saving ? 'Saving...' : editingId ? 'Update Event' : 'Add Event'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}
                className="px-6 py-3 rounded-lg font-bold uppercase tracking-wider text-white/60 border border-white/10 hover:bg-white/5 transition-all">
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[88px] rounded-xl" />)}
          </div>
        ) : schedule.length === 0 ? (
          <div className="bg-[#141418] border border-white/10 rounded-xl p-12 text-center">
            <Calendar size={40} className="mx-auto mb-3 text-white/20" />
            <p className="text-white/50">No events scheduled yet. Add your first one.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedule.map((event, i) => {
              const accent = event.type === 'game' || event.type === 'tournament';
              return (
                <div key={event.id} style={{ ['--delay' as string]: `${Math.min(i, 12) * 50}ms` }} className={`bg-[#141418] border border-white/10 rounded-xl p-4 animate-fade-up transition-colors hover:border-white/20 ${event.cancelled ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="text-center w-14 shrink-0">
                        <p className="text-xs uppercase tracking-wider" style={{ color: accent ? ACCENT : 'rgba(255,255,255,0.45)' }}>{fmt(event.date, { weekday: 'short' })}</p>
                        <p className="text-2xl font-bold">{fmt(event.date, { day: 'numeric' })}</p>
                        <p className="text-xs text-white/45">{fmt(event.date, { month: 'short' })}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                            style={{ color: accent ? ACCENT : 'rgba(255,255,255,0.5)', background: accent ? `${ACCENT}1f` : 'rgba(255,255,255,0.06)' }}>
                            {event.type}
                          </span>
                          {event.cancelled && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Cancelled</span>}
                        </div>
                        <p className="font-bold">{event.title}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-white/45 mt-0.5">
                          <span className="flex items-center gap-1"><Clock size={12} />{event.startTime}–{event.endTime}</span>
                          {event.location && <span className="flex items-center gap-1"><MapPin size={12} />{event.location}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => toggleCancel(event)} title={event.cancelled ? 'Uncancel' : 'Cancel'} className="p-2 hover:bg-white/10 rounded-lg text-white/50 transition-colors"><XCircle size={16} /></button>
                      <button onClick={() => openEdit(event)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 transition-colors"><Edit3 size={16} /></button>
                      <button onClick={() => remove(event.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-white/50 hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
