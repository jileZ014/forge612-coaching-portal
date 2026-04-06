'use client';

import { useState } from 'react';
import { teamConfig } from '@/lib/team-config';
import { demoPlayers } from './demo-data';
import { Plus, Mail, Phone, Search } from 'lucide-react';
import type { Player } from '@/lib/types';

export function RosterTab() {
  const [search, setSearch] = useState('');
  const filtered = demoPlayers.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.parentName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground tracking-tight">
            {demoPlayers.length} {teamConfig.sportConfig.playersLabel}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            {demoPlayers.filter(p => p.active).length} active
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roster"
              className="w-full sm:w-56 pl-9 pr-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97] shrink-0"
            style={{ background: teamConfig.accentColor }}
          >
            <Plus size={14} />
            Add {teamConfig.sportConfig.playerLabel}
          </button>
        </div>
      </div>

      {/* Player cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((player) => (
          <PlayerCard key={player.id} player={player} />
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center mx-auto mb-4">
            <Search size={20} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">
            No {teamConfig.sportConfig.playersLabel.toLowerCase()} match your search.
          </p>
        </div>
      )}
    </div>
  );
}

function PlayerCard({ player }: { player: Player }) {
  return (
    <div className="group flex items-center gap-4 p-4 bg-surface border border-border rounded-xl hover:border-border-hover transition-all duration-300">
      {/* Avatar */}
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display font-bold text-sm shrink-0"
        style={{ background: teamConfig.accentColor }}
      >
        {player.jerseyNumber || player.name.charAt(0)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">{player.name}</span>
          {player.position && (
            <span className="text-[10px] uppercase tracking-wider font-medium text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full shrink-0">
              {player.position}
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted mt-1 truncate">
          {player.parentName}
        </div>
      </div>

      {/* Contact actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <a
          href={`mailto:${player.parentEmail}`}
          className="p-2 rounded-lg text-text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          title={`Email ${player.parentName}`}
        >
          <Mail size={14} />
        </a>
        <a
          href={`tel:${player.parentPhone}`}
          className="p-2 rounded-lg text-text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          title={`Call ${player.parentName}`}
        >
          <Phone size={14} />
        </a>
      </div>
    </div>
  );
}
