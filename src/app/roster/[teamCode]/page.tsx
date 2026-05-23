'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  getRosterByTeam,
  addRosterPlayer,
  updateRosterPlayer,
  deleteRosterPlayer,
} from '@/lib/firestore-helpers';
import type { RosterPlayer } from '@/lib/types';
import { Plus, Trash2, Check, AlertCircle, Users } from 'lucide-react';

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

const GRADE_OPTIONS = [
  'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th',
  '8th', '9th', '10th', '11th', '12th',
];

type FieldKey =
  | 'firstName'
  | 'lastName'
  | 'age'
  | 'birthday'
  | 'phone'
  | 'parentFirstName'
  | 'parentLastName'
  | 'grade'
  | 'highSchool'
  | 'gradYear';

type Draft = Partial<RosterPlayer>;

export default function CoachRosterPage() {
  const params = useParams<{ teamCode: string }>();
  const teamCode = params?.teamCode ?? '';
  const team = useMemo(() => TEAMS.find((t) => t.code === teamCode), [teamCode]);

  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!team) return;
    try {
      const data = await getRosterByTeam(team.code);
      setPlayers(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [team]);

  useEffect(() => {
    load();
  }, [load]);

  if (!team) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Team not found</h1>
          <p className="text-text-muted text-sm">
            The team code <code className="font-mono text-foreground">{teamCode}</code> isn&rsquo;t
            in the list. Double-check the link Coach Jonas sent you.
          </p>
        </div>
      </div>
    );
  }

  async function handleAdd() {
    if (!team) return;
    setSavingId('new');
    try {
      const ref = await addRosterPlayer({
        teamCode: team.code,
        firstName: '',
        lastName: '',
        age: null,
        birthday: '',
        phone: '',
        parentFirstName: '',
        parentLastName: '',
        grade: '',
        highSchool: '',
        gradYear: null,
      });
      await load();
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>(
          `[data-player-id="${ref.id}"] [data-field="firstName"]`,
        );
        el?.focus();
      }, 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function saveField(player: RosterPlayer, field: FieldKey) {
    const draft = drafts[player.id];
    if (!draft || !(field in draft)) return;
    let value = draft[field];
    if (field === 'age' || field === 'gradYear') {
      if (typeof value === 'string') {
        const n = parseInt(value as string, 10);
        value = isNaN(n) ? null : n;
      }
    }
    if (value === player[field]) {
      setDrafts((d) => {
        const next = { ...d };
        if (next[player.id]) {
          const { [field]: _omit, ...rest } = next[player.id]!;
          void _omit;
          if (Object.keys(rest).length === 0) delete next[player.id];
          else next[player.id] = rest;
        }
        return next;
      });
      return;
    }
    setSavingId(player.id);
    try {
      await updateRosterPlayer(player.id, { [field]: value } as Partial<RosterPlayer>);
      setPlayers((ps) =>
        ps.map((p) => (p.id === player.id ? { ...p, [field]: value, updatedAt: Date.now() } : p)),
      );
      setDrafts((d) => {
        const next = { ...d };
        if (next[player.id]) {
          const { [field]: _omit, ...rest } = next[player.id]!;
          void _omit;
          if (Object.keys(rest).length === 0) delete next[player.id];
          else next[player.id] = rest;
        }
        return next;
      });
      setJustSavedId(player.id);
      setTimeout(() => setJustSavedId((cur) => (cur === player.id ? null : cur)), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(player: RosterPlayer) {
    const display = [player.firstName, player.lastName].filter(Boolean).join(' ') || 'this player';
    if (!confirm(`Remove ${display}?`)) return;
    setSavingId(player.id);
    try {
      await deleteRosterPlayer(player.id);
      setPlayers((ps) => ps.filter((p) => p.id !== player.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  }

  function getValue(p: RosterPlayer, field: FieldKey): string {
    const draft = drafts[p.id];
    if (draft && field in draft) {
      const v = draft[field];
      return v === null || v === undefined ? '' : String(v);
    }
    const v = p[field];
    if (v !== null && v !== undefined && v !== '') return String(v);
    // Legacy fallback: split combined parentName into first/last for entries
    // created before parentFirstName/parentLastName existed. Coach can edit.
    if ((field === 'parentFirstName' || field === 'parentLastName') && p.parentName) {
      const parts = p.parentName.trim().split(/\s+/);
      if (field === 'parentFirstName') return parts[0] ?? '';
      return parts.slice(1).join(' ');
    }
    return '';
  }

  function setDraft(playerId: string, field: FieldKey, value: string) {
    setDrafts((d) => ({
      ...d,
      [playerId]: { ...(d[playerId] ?? {}), [field]: value },
    }));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface-elevated">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="text-[11px] uppercase tracking-wider text-text-muted font-medium">
            AZ Flight Hoops &middot; San Diego Tournament
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 leading-tight">
            {team.shortLabel} Roster
          </h1>
          <div className="text-sm text-text-muted mt-1">
            {team.coach} &middot; tap <span className="font-semibold text-foreground">Add Player</span> for each kid on your team.
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg border border-error/30 bg-error/5 text-error text-sm flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <Users size={12} />
            <span className="tabular-nums">{players.length}</span>
            <span>{players.length === 1 ? 'player' : 'players'}</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={savingId === 'new'}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white shadow-lg shadow-black/20 transition-all hover:scale-[1.02] disabled:opacity-60"
            style={{ background: 'var(--color-accent)' }}
          >
            <Plus size={13} />
            {savingId === 'new' ? 'Adding…' : 'Add Player'}
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 rounded-xl skeleton" />
            ))}
          </div>
        ) : players.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-elevated px-6 py-12 text-center">
            <div className="text-sm text-text-muted mb-4">
              No players yet. Tap <span className="font-semibold text-foreground">Add Player</span> to start your roster.
            </div>
            <button
              onClick={handleAdd}
              disabled={savingId === 'new'}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold text-white shadow-lg shadow-black/20 transition-all hover:scale-[1.02] disabled:opacity-60"
              style={{ background: 'var(--color-accent)' }}
            >
              <Plus size={13} />
              Add first player
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {players.map((p, idx) => {
              const saving = savingId === p.id;
              const saved = justSavedId === p.id;
              const display =
                [p.firstName, p.lastName].filter(Boolean).join(' ') || `Player ${idx + 1}`;
              return (
                <li
                  key={p.id}
                  data-player-id={p.id}
                  className="rounded-xl border border-border bg-surface-elevated overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center text-[11px] font-semibold tabular-nums text-text-muted">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-sm truncate">{display}</span>
                      {saved && (
                        <span className="text-[10px] font-medium text-success inline-flex items-center gap-0.5">
                          <Check size={11} /> Saved
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(p)}
                      disabled={saving}
                      className="shrink-0 text-text-muted hover:text-error transition-colors p-1 disabled:opacity-30"
                      title="Remove player"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3">
                    <RosterField
                      label="First name"
                      value={getValue(p, 'firstName')}
                      onChange={(v) => setDraft(p.id, 'firstName', v)}
                      onBlur={() => saveField(p, 'firstName')}
                      autoFocus={!p.firstName && !p.lastName}
                      dataField="firstName"
                      autoComplete="given-name"
                    />
                    <RosterField
                      label="Last name"
                      value={getValue(p, 'lastName')}
                      onChange={(v) => setDraft(p.id, 'lastName', v)}
                      onBlur={() => saveField(p, 'lastName')}
                      dataField="lastName"
                      autoComplete="family-name"
                    />
                    <RosterField
                      label="Age"
                      value={getValue(p, 'age')}
                      onChange={(v) => setDraft(p.id, 'age', v)}
                      onBlur={() => saveField(p, 'age')}
                      type="number"
                      inputMode="numeric"
                      dataField="age"
                      min={5}
                      max={19}
                    />
                    <RosterField
                      label="Birthday"
                      value={getValue(p, 'birthday')}
                      onChange={(v) => setDraft(p.id, 'birthday', v)}
                      onBlur={() => saveField(p, 'birthday')}
                      type="date"
                      dataField="birthday"
                    />
                    <RosterField
                      label="Phone"
                      value={getValue(p, 'phone')}
                      onChange={(v) => setDraft(p.id, 'phone', v)}
                      onBlur={() => saveField(p, 'phone')}
                      type="tel"
                      inputMode="tel"
                      placeholder="(555) 555-1234"
                      dataField="phone"
                      autoComplete="tel"
                      className="col-span-2"
                    />
                    <RosterField
                      label="Parent first name"
                      value={getValue(p, 'parentFirstName')}
                      onChange={(v) => setDraft(p.id, 'parentFirstName', v)}
                      onBlur={() => saveField(p, 'parentFirstName')}
                      dataField="parentFirstName"
                    />
                    <RosterField
                      label="Parent last name"
                      value={getValue(p, 'parentLastName')}
                      onChange={(v) => setDraft(p.id, 'parentLastName', v)}
                      onBlur={() => saveField(p, 'parentLastName')}
                      dataField="parentLastName"
                    />
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
                        Grade
                      </label>
                      <select
                        value={getValue(p, 'grade')}
                        onChange={(e) => {
                          setDraft(p.id, 'grade', e.target.value);
                          setTimeout(() => saveField(p, 'grade'), 0);
                        }}
                        className="px-3 py-2 rounded-lg bg-background border border-border focus:border-accent text-sm outline-none transition-colors text-foreground"
                      >
                        <option value="">Select…</option>
                        {GRADE_OPTIONS.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <RosterField
                      label="Grad year"
                      value={getValue(p, 'gradYear')}
                      onChange={(v) => setDraft(p.id, 'gradYear', v)}
                      onBlur={() => saveField(p, 'gradYear')}
                      type="number"
                      inputMode="numeric"
                      placeholder="2030"
                      dataField="gradYear"
                      min={2025}
                      max={2040}
                    />
                    <RosterField
                      label="High school"
                      value={getValue(p, 'highSchool')}
                      onChange={(v) => setDraft(p.id, 'highSchool', v)}
                      onBlur={() => saveField(p, 'highSchool')}
                      placeholder="e.g. Mountain Ridge HS"
                      dataField="highSchool"
                      className="col-span-2"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-6 mb-4">
          <button
            onClick={handleAdd}
            disabled={savingId === 'new'}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-lg text-sm font-semibold border-2 border-dashed border-border hover:border-accent text-text-secondary hover:text-accent transition-colors disabled:opacity-60"
          >
            <Plus size={14} />
            {savingId === 'new' ? 'Adding…' : 'Add another player'}
          </button>
        </div>

        <p className="text-[11px] text-text-muted text-center mt-6 mb-4 leading-relaxed">
          Changes save automatically as you type and tap out of each field. Coach Jonas can see this roster live.
        </p>
      </main>
    </div>
  );
}

function RosterField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  autoFocus,
  dataField,
  className = '',
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  type?: string;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email';
  autoComplete?: string;
  placeholder?: string;
  autoFocus?: boolean;
  dataField?: string;
  className?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        autoFocus={autoFocus}
        data-field={dataField}
        min={min}
        max={max}
        className="px-3 py-2 rounded-lg bg-background border border-border focus:border-accent text-sm outline-none transition-colors text-foreground placeholder:text-text-muted"
      />
    </div>
  );
}
