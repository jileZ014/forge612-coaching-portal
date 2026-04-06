'use client';

import { teamConfig } from '@/lib/team-config';
import { demoFees, demoPayments, demoPlayers } from './demo-data';
import { Plus, Users, CheckCircle2, AlertCircle } from 'lucide-react';

export function FeesTab() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-display font-semibold text-foreground tracking-tight">
          {demoFees.length} Fees
        </h2>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
          style={{ background: teamConfig.accentColor }}
        >
          <Plus size={14} />
          Create Fee
        </button>
      </div>

      {/* Fee cards */}
      <div className="space-y-3">
        {demoFees.map((fee) => {
          const payments = demoPayments.filter((p) => p.feeId === fee.id);
          const paidCount = payments.filter((p) => p.status === 'paid').length;
          const totalPlayers = payments.length;
          const collected = payments.reduce((sum, p) => sum + p.paidAmount, 0);
          const expected = payments.filter(p => p.status !== 'waived').length * fee.amount;
          const progress = expected > 0 ? (collected / expected) * 100 : 0;

          return (
            <div key={fee.id} className="bg-surface border border-border rounded-xl p-5 hover:border-border-hover transition-all duration-300">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{fee.title}</h3>
                    <span className="text-[10px] uppercase tracking-wider font-medium text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full">
                      {fee.type}
                    </span>
                    {fee.recurring && (
                      <span className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded-full" style={{ color: teamConfig.accentColor, background: `${teamConfig.accentColor}15` }}>
                        Recurring
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted">
                    Due {new Date(fee.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-display font-bold text-foreground tracking-tight">
                    ${fee.amount}
                  </div>
                  <div className="text-xs text-text-muted">per {teamConfig.sportConfig.playerLabel.toLowerCase()}</div>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
                  <span className="flex items-center gap-1.5">
                    {progress >= 100 ? (
                      <CheckCircle2 size={12} className="text-success" />
                    ) : (
                      <AlertCircle size={12} />
                    )}
                    ${collected} of ${expected} collected
                  </span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(progress, 100)}%`,
                      background: progress >= 100 ? 'var(--success)' : teamConfig.accentColor,
                    }}
                  />
                </div>
              </div>

              {/* Player count */}
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <Users size={12} />
                  {paidCount}/{totalPlayers} paid
                </span>
                {fee.appliesTo !== 'all' && (
                  <span>Applies to {(fee.appliesTo as string[]).length} {teamConfig.sportConfig.playersLabel.toLowerCase()}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
