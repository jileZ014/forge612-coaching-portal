'use client';

import { teamConfig } from '@/lib/team-config';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';

export function CTASection() {
  return (
    <section className="relative py-32 md:py-40">
      <div className="max-w-[1400px] mx-auto px-6">
        <ScrollReveal>
          <div className="relative rounded-3xl border border-border bg-surface overflow-hidden">
            {/* Background image */}
            <div className="absolute inset-0">
              <Image
                src="/ball-bg.png"
                alt=""
                fill
                className="object-cover object-center opacity-50"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-surface/90 via-surface/70 to-surface/40" />
            </div>

            {/* Glow */}
            <div
              className="absolute top-0 right-0 w-1/2 h-full opacity-[0.08] blur-[100px]"
              style={{ background: teamConfig.accentColor }}
            />

            <div className="relative p-10 md:p-16 max-w-xl">
              <h2 className="font-display text-3xl md:text-4xl tracking-tighter leading-none text-foreground mb-4">
                Ready to pay your fees?
              </h2>
              <p className="text-base text-text-secondary leading-relaxed mb-8 max-w-[45ch]">
                Look up your balance and pay online in under a minute. Secure payments via Stripe.
              </p>
              <Link
                href="/pay"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
                style={{ background: teamConfig.accentColor }}
              >
                Pay Now
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
