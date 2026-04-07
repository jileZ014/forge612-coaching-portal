'use client';

import { useState, useEffect } from 'react';
import { teamConfig } from '@/lib/team-config';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    const sentinel = document.getElementById('nav-sentinel');
    if (sentinel) observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div id="nav-sentinel" className="absolute top-0 h-1 w-full" />
      <nav
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 ${
          scrolled
            ? 'w-[min(92%,680px)] bg-surface/80 backdrop-blur-xl border border-border shadow-2xl shadow-black/40 rounded-full px-6 py-3'
            : 'w-[min(92%,1400px)] bg-transparent px-6 py-4'
        }`}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src={teamConfig.logoUrl}
              alt={teamConfig.teamName}
              width={40}
              height={40}
              className="transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
            />
            <span className="font-display font-semibold text-lg tracking-tight text-foreground">
              {teamConfig.teamName}
            </span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            <NavLink href="#schedule">Schedule</NavLink>
            <NavLink href="/pay">Pay Fees</NavLink>
            <Link
              href="/login"
              className="ml-3 px-5 py-2 rounded-full text-sm font-medium text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
              style={{ background: teamConfig.accentColor }}
            >
              Coach Login
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-text-secondary hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden mt-4 pb-2 flex flex-col gap-2 border-t border-border pt-4">
            <MobileNavLink href="#schedule" onClick={() => setMobileOpen(false)}>Schedule</MobileNavLink>
            <MobileNavLink href="/pay" onClick={() => setMobileOpen(false)}>Pay Fees</MobileNavLink>
            <Link
              href="/login"
              onClick={() => setMobileOpen(false)}
              className="mt-2 px-5 py-2.5 rounded-full text-sm font-medium text-white text-center transition-all duration-300"
              style={{ background: teamConfig.accentColor }}
            >
              Coach Login
            </Link>
          </div>
        )}
      </nav>
    </>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-4 py-2 rounded-full text-sm font-medium text-text-secondary hover:text-foreground hover:bg-white/[0.04] transition-all duration-300"
    >
      {children}
    </Link>
  );
}

function MobileNavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="px-4 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-foreground hover:bg-surface-elevated transition-colors"
    >
      {children}
    </Link>
  );
}
