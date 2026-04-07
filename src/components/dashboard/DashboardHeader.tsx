'use client';

import { teamConfig } from '@/lib/team-config';
import Link from 'next/link';
import Image from 'next/image';
import { LogOut, ExternalLink } from 'lucide-react';

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src={teamConfig.logoUrl}
            alt={teamConfig.teamName}
            width={32}
            height={32}
          />
          <div>
            <div className="text-sm font-semibold text-foreground leading-none">{teamConfig.teamName}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{teamConfig.sportConfig.coachLabel} Dashboard</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <ExternalLink size={12} />
            Team Page
          </Link>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-error hover:bg-error/5 transition-colors"
          >
            <LogOut size={12} />
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
