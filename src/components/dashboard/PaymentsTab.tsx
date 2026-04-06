'use client';

import { useState } from 'react';
import { teamConfig } from '@/lib/team-config';
import { demoPlayers, demoFees, demoPayments } from './demo-data';
import { ChevronDown, Bell, TrendingUp } from 'lucide-react';

const statusColors = {
  paid: { bg: 'bg-success/10', text: 'text-success' },
  unpaid: { bg: 'bg-error/10', text: 'text-error' },
  partial: { bg: 'bg-warning/10', text: 'text-warning' },
  waived: { bg: 'bg-text-muted/10', text: 'text-text-muted' },
};

export function PaymentsTab() {
  const [selectedFee, setSelectedFee] = useState(demoFees[1].id);
  const fee = demoFees.find((f) => f.id === selectedFee)!;
  const payments = demoPayments.filter((p) => p.feeId === selectedFee);

  const totalCollected = payments.reduce((sum, p) => sum + p.paidAmount, 0);
  const totalExpected = payments.filter(p => p.status !== 'waived').length * fee.amount;
  const paidCount = payments.filter((p) => p.status === 'paid').length;
  const unpaidCount = payments.filter((p) => p.status === 'unpaid' || p.status === 'partial').length;

  return (
    <div>
      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Collected" value={`$${totalCollected}`} />
        <StatCard label="Expected" value={`$${totalExpected}`} />
        <StatCard label="Paid" value={paidCount.toString()} accent />
        <StatCard label="Outstanding" value={unpaidCount.toString()} warn={unpaidCount > 0} />
      </div>

      {/* Fee selector + actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="relative">
          <select
            value={selectedFee}
            onChange={(e) => setSelectedFee(e.target.value)}
            className="appearance-none bg-surface border border-border rounded-lg px-4 py-2.5 pr-10 text-sm font-medium text-foreground focus:outline-none focus:border-accent transition-colors cursor-pointer"
          >
            {demoFees.map((f) => (
              <option key={f.id} value={f.id}>{f.title} — ${f.amount}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        </div>

        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
          style={{ background: teamConfig.accentColor }}
        >
          <Bell size={14} />
          Send Reminders
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs text-text-muted mb-2">
          <span>Collection Progress</span>
          <span>{totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0}%</span>
        </div>
        <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0}%`,
              background: teamConfig.accentColor,
            }}
          />
        </div>
      </div>

      {/* Payment grid */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] uppercase tracking-wider font-medium text-text-muted px-4 py-3">
                  {teamConfig.sportConfig.playerLabel}
                </th>
                <th className="text-left text-[10px] uppercase tracking-wider font-medium text-text-muted px-4 py-3">
                  Parent
                </th>
                <th className="text-left text-[10px] uppercase tracking-wider font-medium text-text-muted px-4 py-3">
                  Status
                </th>
                <th className="text-left text-[10px] uppercase tracking-wider font-medium text-text-muted px-4 py-3">
                  Paid
                </th>
                <th className="text-right text-[10px] uppercase tracking-wider font-medium text-text-muted px-4 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((payment) => {
                const player = demoPlayers.find((p) => p.id === payment.playerId);
                if (!player) return null;
                const colors = statusColors[payment.status];

                return (
                  <tr key={payment.id} className="group hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-semibold text-text-secondary">
                          {player.jerseyNumber || player.name.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-foreground">{player.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-text-secondary">{player.parentName}</div>
                      <div className="text-xs text-text-muted">{player.parentEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground">
                        ${payment.paidAmount}
                        {payment.status !== 'waived' && (
                          <span className="text-text-muted"> / ${fee.amount}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {payment.status !== 'paid' && payment.status !== 'waived' && (
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ActionButton label="Mark Paid" />
                          <ActionButton label="Waive" />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider font-medium text-text-muted mb-1">{label}</div>
      <div className={`text-xl font-display font-bold tracking-tight ${
        warn ? 'text-warning' : accent ? 'text-success' : 'text-foreground'
      }`}>
        {value}
      </div>
    </div>
  );
}

function ActionButton({ label }: { label: string }) {
  return (
    <button className="px-3 py-1.5 rounded-md text-[10px] font-medium text-text-secondary bg-surface-elevated hover:text-foreground hover:bg-border transition-colors">
      {label}
    </button>
  );
}
