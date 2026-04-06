'use client';

import { useState } from 'react';
import { teamConfig } from '@/lib/team-config';
import { Navbar } from '@/components/ui/Navbar';
import { Footer } from '@/components/landing/Footer';
import { Search, CreditCard, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import type { Fee, Payment } from '@/lib/types';

type LookupState = 'idle' | 'loading' | 'results' | 'error' | 'success';

// Demo data for development
const demoResults = {
  playerName: 'Marcus Rivera',
  fees: [
    { id: '1', title: 'Registration Fee', type: 'registration' as const, amount: 150, status: 'paid' as const, paidDate: '2026-03-15' },
    { id: '2', title: 'April Monthly', type: 'monthly' as const, amount: 75, status: 'unpaid' as const, paidDate: null },
    { id: '3', title: 'Spring Tournament', type: 'tournament' as const, amount: 45, status: 'unpaid' as const, paidDate: null },
    { id: '4', title: 'Equipment Fee', type: 'equipment' as const, amount: 60, status: 'partial' as const, paidDate: null, paidAmount: 30 },
  ],
};

export default function PayPage() {
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [lookupValue, setLookupValue] = useState('');

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!lookupValue.trim()) return;
    setLookupState('loading');
    // Simulate API call
    setTimeout(() => setLookupState('results'), 800);
  }

  return (
    <>
      <Navbar />
      <main className="flex-1 pt-28 pb-24">
        <div className="max-w-2xl mx-auto px-6">
          {/* Header */}
          <div className="mb-12">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium border mb-6"
              style={{
                color: teamConfig.accentColor,
                borderColor: `${teamConfig.accentColor}33`,
                background: `${teamConfig.accentColor}0A`,
              }}
            >
              <CreditCard size={12} />
              Payment Portal
            </div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tighter leading-none text-foreground mb-3">
              Pay Your Fees
            </h1>
            <p className="text-base text-text-secondary leading-relaxed max-w-[50ch]">
              Look up your balance by parent name, email, or {teamConfig.sportConfig.playerLabel.toLowerCase()} name.
            </p>
          </div>

          {/* Lookup Form */}
          <form onSubmit={handleLookup} className="mb-10">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
                placeholder="Enter parent name, email, or player name"
                className="w-full pl-12 pr-32 py-4 bg-surface border border-border rounded-xl text-foreground text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-300"
              />
              <button
                type="submit"
                disabled={!lookupValue.trim() || lookupState === 'loading'}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: teamConfig.accentColor }}
              >
                {lookupState === 'loading' ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Looking up
                  </span>
                ) : (
                  'Look Up'
                )}
              </button>
            </div>
          </form>

          {/* Loading skeleton */}
          {lookupState === 'loading' && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
              ))}
            </div>
          )}

          {/* Results */}
          {lookupState === 'results' && (
            <div className="animate-fade-up">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-sm text-text-muted">Showing fees for</div>
                  <div className="text-lg font-display font-semibold text-foreground tracking-tight">
                    {demoResults.playerName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-text-muted">Total Due</div>
                  <div className="text-lg font-display font-bold tracking-tight" style={{ color: teamConfig.accentColor }}>
                    ${demoResults.fees.filter(f => f.status !== 'paid').reduce((sum, f) => sum + (f.status === 'partial' ? f.amount - (f.paidAmount || 0) : f.amount), 0).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {demoResults.fees.map((fee) => (
                  <FeeCard key={fee.id} fee={fee} />
                ))}
              </div>

              <div className="mt-8 p-4 rounded-xl bg-surface border border-border">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle size={14} className="text-text-muted" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground mb-1">Secure payments via Stripe</div>
                    <div className="text-xs text-text-muted leading-relaxed">
                      A 5.5% processing fee will be added at checkout. Your card information is handled securely by Stripe and never stored on our servers.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Success state */}
          {lookupState === 'success' && (
            <div className="animate-fade-up text-center py-16">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={32} className="text-success" />
              </div>
              <h2 className="font-display text-2xl font-semibold text-foreground tracking-tight mb-2">
                Payment Successful
              </h2>
              <p className="text-sm text-text-secondary mb-8">
                A confirmation has been sent to your email.
              </p>
              <button
                onClick={() => { setLookupState('idle'); setLookupValue(''); }}
                className="text-sm font-medium transition-colors hover:text-foreground"
                style={{ color: teamConfig.accentColor }}
              >
                Make Another Payment
              </button>
            </div>
          )}

          {/* Idle state */}
          {lookupState === 'idle' && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center mx-auto mb-6">
                <Search size={24} className="text-text-muted" />
              </div>
              <p className="text-sm text-text-muted max-w-[35ch] mx-auto">
                Enter your information above to look up outstanding fees and make a payment.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}

function FeeCard({ fee }: { fee: typeof demoResults.fees[0] }) {
  const isPaid = fee.status === 'paid';
  const isPartial = fee.status === 'partial';
  const remaining = isPartial ? fee.amount - (fee.paidAmount || 0) : fee.amount;

  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border transition-all duration-300 ${
      isPaid
        ? 'bg-surface/50 border-border opacity-60'
        : 'bg-surface border-border hover:border-border-hover'
    }`}>
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          isPaid ? 'bg-success/10' : 'bg-surface-elevated'
        }`}>
          {isPaid ? (
            <CheckCircle2 size={18} className="text-success" />
          ) : (
            <CreditCard size={18} className="text-text-muted" />
          )}
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">{fee.title}</div>
          <div className="text-xs text-text-muted">
            {isPaid
              ? `Paid on ${new Date(fee.paidDate!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
              : isPartial
                ? `$${fee.paidAmount} of $${fee.amount} paid`
                : `$${fee.amount.toFixed(2)} due`
            }
          </div>
        </div>
      </div>

      {!isPaid && (
        <button
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
          style={{ background: teamConfig.accentColor }}
        >
          Pay ${remaining.toFixed(2)}
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
