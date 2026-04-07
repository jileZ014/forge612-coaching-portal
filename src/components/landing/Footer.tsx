import { teamConfig } from '@/lib/team-config';
import Link from 'next/link';
import Image from 'next/image';

export function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image
              src={teamConfig.logoUrl}
              alt={teamConfig.teamName}
              width={28}
              height={28}
            />
            <span className="text-sm text-text-muted">
              {teamConfig.teamName}
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-text-muted">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <span>Powered by <a href="https://forge612.com" className="text-text-secondary hover:text-foreground transition-colors">Forge612</a></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
