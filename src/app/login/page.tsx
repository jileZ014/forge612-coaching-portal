'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { teamConfig } from '@/lib/team-config';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      const msg = code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')
        ? 'Invalid email or password.'
        : `Sign-in failed: ${code || (err instanceof Error ? err.message : 'unknown error')}`;
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-[45%] relative items-end p-12">
        <div className="absolute inset-0 bg-surface" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            background: `radial-gradient(ellipse at bottom right, ${teamConfig.accentColor}, transparent 70%)`,
          }}
        />
        <div className="relative">
          <Image
            src={teamConfig.logoUrl}
            alt={teamConfig.teamName}
            width={64}
            height={64}
            className="mb-8"
          />
          <h2 className="font-display text-3xl tracking-tighter leading-none text-foreground mb-3">
            {teamConfig.teamName}
          </h2>
          <p className="text-sm text-text-secondary max-w-[30ch] leading-relaxed">
            {teamConfig.tagline}
          </p>
          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-xs text-text-muted">
              Powered by Forge612
            </p>
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-text-muted hover:text-foreground transition-colors mb-12"
          >
            <ArrowLeft size={14} />
            Back to team page
          </Link>

          <div className="mb-8">
            {/* Mobile only brand mark */}
            <Image
              src={teamConfig.logoUrl}
              alt={teamConfig.teamName}
              width={48}
              height={48}
              className="lg:hidden mb-6"
            />
            <h1 className="font-display text-2xl tracking-tighter leading-none text-foreground mb-2">
              {teamConfig.sportConfig.coachLabel} Login
            </h1>
            <p className="text-sm text-text-secondary">
              Sign in to manage your team portal.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@team.com"
                autoComplete="email"
                className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-300"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-12 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors duration-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-xs text-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: teamConfig.accentColor }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button className="text-xs font-medium transition-colors hover:text-foreground" style={{ color: teamConfig.accentColor }}>
              Forgot your password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
