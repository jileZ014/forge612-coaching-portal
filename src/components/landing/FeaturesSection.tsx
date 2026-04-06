'use client';

import { teamConfig } from '@/lib/team-config';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { CreditCard, CalendarDays, Users, Bell } from 'lucide-react';

const features = [
  {
    icon: CreditCard,
    title: 'Online Payments',
    description: 'Parents look up and pay fees instantly with Stripe. No more chasing checks or Venmo requests.',
  },
  {
    icon: CalendarDays,
    title: 'Schedule & Events',
    description: 'Practices, games, and tournaments in one feed. Parents always know where to be and when.',
  },
  {
    icon: Users,
    title: 'Roster Management',
    description: 'Player details, parent contacts, and jersey numbers. Add, edit, or archive players anytime.',
  },
  {
    icon: Bell,
    title: 'Fee Reminders',
    description: 'Send payment reminders with one click. Track who paid and who owes at a glance.',
  },
];

export function FeaturesSection() {
  return (
    <section className="relative py-32 md:py-40">
      <div className="max-w-[1400px] mx-auto px-6">
        <ScrollReveal>
          <div className="max-w-2xl mb-20">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium border mb-6"
              style={{
                color: teamConfig.accentColor,
                borderColor: `${teamConfig.accentColor}33`,
                background: `${teamConfig.accentColor}0A`,
              }}
            >
              Built for coaches
            </div>
            <h2 className="font-display text-3xl md:text-5xl tracking-tighter leading-none text-foreground mb-4">
              Everything you need.
              <span className="block text-text-muted">Nothing you don&apos;t.</span>
            </h2>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border border-border">
          {features.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={i * 0.08}>
              <div className="bg-surface p-8 md:p-10 group hover:bg-surface-elevated transition-colors duration-500">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-6 transition-transform duration-500 group-hover:scale-110"
                  style={{ background: `${teamConfig.accentColor}12` }}
                >
                  <feature.icon size={20} style={{ color: teamConfig.accentColor }} />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground tracking-tight mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed max-w-[45ch]">
                  {feature.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
