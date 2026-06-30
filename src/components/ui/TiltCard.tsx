'use client';

import { useRef } from 'react';

/**
 * Subtle cursor-tracking 3D tilt + lift for metric cards. Restrained so it reads
 * premium on a data dashboard. Transform-only (GPU), custom easing, no-op under
 * prefers-reduced-motion.
 *
 * IMPORTANT: the entrance reveal (`animate-fade-up`) lives on the OUTER node and
 * the tilt on the INNER node. A CSS animation with fill-mode retains control of
 * `transform`, so if both lived on one element the keyframe would clobber the
 * JS-set tilt transform (symptom: card "only glows" on hover, never rotates).
 */
export function TiltCard({
  children,
  className = '',
  max = 9,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-6px) scale(1.025)`;
  }

  function handleLeave() {
    const el = ref.current;
    if (el) el.style.transform = '';
  }

  return (
    <div className={className} style={{ ['--delay' as string]: `${delay}ms` }}>
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)' }}
        className="h-full will-change-transform"
      >
        {children}
      </div>
    </div>
  );
}
