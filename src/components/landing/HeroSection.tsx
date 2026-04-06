'use client';

import { teamConfig } from '@/lib/team-config';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import Link from 'next/link';
import { ArrowRight, Calendar, CreditCard, Users } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative min-h-[100dvh] flex items-center overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0">
        <div
          className="absolute top-0 right-0 w-[60%] h-[80%] opacity-[0.07] blur-[120px]"
          style={{ background: `radial-gradient(ellipse, ${teamConfig.accentColor}, transparent 70%)` }}
        />
        <div className="absolute bottom-0 left-0 w-[40%] h-[50%] opacity-[0.04] blur-[100px] bg-white" />
      </div>

      <div className="relative w-full max-w-[1400px] mx-auto px-6 pt-32 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center">
          {/* Left — Text */}
          <div className="max-w-xl">
            <ScrollReveal>
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium border mb-8"
                style={{
                  color: teamConfig.accentColor,
                  borderColor: `${teamConfig.accentColor}33`,
                  background: `${teamConfig.accentColor}0A`,
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: teamConfig.accentColor }} />
                Powered by Forge612
              </div>
            </ScrollReveal>

            <ScrollReveal delay={0.05}>
              <h1 className="font-display text-4xl md:text-6xl tracking-tighter leading-none text-foreground mb-6">
                Your team.{' '}
                <span className="block" style={{ color: teamConfig.accentColor }}>
                  Organized.
                </span>
              </h1>
            </ScrollReveal>

            <ScrollReveal delay={0.1}>
              <p className="text-base md:text-lg text-text-secondary leading-relaxed max-w-[50ch] mb-10">
                Schedules, payments, and roster management in one place.
                Parents pay online. Coaches stay focused on what matters.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.15}>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/pay"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
                  style={{ background: teamConfig.accentColor }}
                >
                  Pay Fees
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="#schedule"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-foreground bg-surface-elevated border border-border hover:border-border-hover transition-all duration-300 active:scale-[0.97]"
                >
                  View Schedule
                </Link>
              </div>
            </ScrollReveal>
          </div>

          {/* Right — Floating UI cards (PlayMetrics-inspired) */}
          <div className="relative hidden lg:block">
            <div className="relative h-[520px]">
              {/* Card 1: Schedule preview */}
              <ScrollReveal delay={0.2} className="absolute top-0 left-0 w-[320px]">
                <FloatingCard>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${teamConfig.accentColor}1A` }}>
                      <Calendar size={16} style={{ color: teamConfig.accentColor }} />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Upcoming</span>
                  </div>
                  <div className="space-y-3">
                    <ScheduleRow day="Tue" date="Apr 8" label={teamConfig.sportConfig.practiceLabel} time="5:30 PM" />
                    <ScheduleRow day="Thu" date="Apr 10" label={teamConfig.sportConfig.practiceLabel} time="5:30 PM" />
                    <ScheduleRow day="Sat" date="Apr 12" label={teamConfig.sportConfig.gameLabel} time="9:00 AM" accent />
                  </div>
                </FloatingCard>
              </ScrollReveal>

              {/* Card 2: Payment status */}
              <ScrollReveal delay={0.3} className="absolute top-12 right-0 w-[280px]">
                <FloatingCard>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${teamConfig.accentColor}1A` }}>
                      <CreditCard size={16} style={{ color: teamConfig.accentColor }} />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Payments</span>
                  </div>
                  <div className="space-y-3">
                    <PaymentRow label="Registration Fee" amount="$150" status="paid" />
                    <PaymentRow label="April Monthly" amount="$75" status="unpaid" />
                    <PaymentRow label="Tournament Entry" amount="$45" status="unpaid" />
                  </div>
                </FloatingCard>
              </ScrollReveal>

              {/* Card 3: Roster count */}
              <ScrollReveal delay={0.4} className="absolute bottom-16 left-8 w-[240px]">
                <FloatingCard>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${teamConfig.accentColor}1A` }}>
                      <Users size={18} style={{ color: teamConfig.accentColor }} />
                    </div>
                    <div>
                      <div className="text-2xl font-display font-bold text-foreground tracking-tight">14</div>
                      <div className="text-xs text-text-muted">{teamConfig.sportConfig.playersLabel} Active</div>
                    </div>
                  </div>
                </FloatingCard>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatingCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface/60 backdrop-blur-xl border border-border rounded-2xl p-5 shadow-2xl shadow-black/20 hover:border-border-hover transition-all duration-500">
      {children}
    </div>
  );
}

function ScheduleRow({ day, date, label, time, accent }: { day: string; date: string; label: string; time: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[10px] font-medium ${accent ? 'text-white' : 'text-text-secondary bg-surface-elevated'}`}
          style={accent ? { background: teamConfig.accentColor } : {}}
        >
          <span className="uppercase leading-none">{day}</span>
          <span className="text-xs font-semibold leading-none mt-0.5">{date.split(' ')[1]}</span>
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-text-muted">{time}</div>
        </div>
      </div>
    </div>
  );
}

function PaymentRow({ label, amount, status }: { label: string; amount: string; status: 'paid' | 'unpaid' }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-text-muted">{amount}</div>
      </div>
      <span className={`text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full ${
        status === 'paid'
          ? 'bg-success/10 text-success'
          : 'bg-warning/10 text-warning'
      }`}>
        {status}
      </span>
    </div>
  );
}
