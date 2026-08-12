export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';
import { getAdminDb } from '@/lib/firebase-admin';
import { teamConfig } from '@/lib/team-config';

// Telegram notifier for a new self-registration. The public /register page writes the
// registration doc (client SDK, create-only per firestore.rules) and then calls this
// with the resulting registrationId to ping the coach.
//
// This endpoint is intentionally PUBLIC — coach auth would break public signup. Instead
// the anti-forgery control is that the message is built from the STORED document, never
// from the request body: a caller who cannot create a registration cannot make this send
// anything. Fixes the spam/forgery vector found in the 2026-08-11 audit.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flight-pay.netlify.app';
const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const registrationId = s(b.registrationId, 200);
  if (!registrationId) {
    return NextResponse.json({ ok: false, error: 'registrationId is required' }, { status: 400 });
  }

  // Read the registration back. If it does not exist, this is a forged ping — drop it.
  let doc: Record<string, unknown>;
  try {
    const snap = await getAdminDb().collection('registrations').doc(registrationId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'registration not found' }, { status: 404 });
    }
    doc = snap.data() as Record<string, unknown>;
  } catch (err) {
    console.error('[notify-registration] lookup failed:', err);
    // Registration itself is already saved; never fail the parent's submission on this.
    const diag =
      process.env.DEBUG_ADMIN === '1'
        ? {
            code: (err as { code?: string })?.code ?? null,
            message: String((err as Error)?.message ?? err).slice(0, 300),
            hasKey: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
            keyLen: (process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '').length,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null,
          }
        : undefined;
    return NextResponse.json({ ok: false, error: 'lookup unavailable', diag }, { status: 503 });
  }

  const parentName = s(
    [doc.parentFirstName, doc.parentLastName].filter(Boolean).join(' '),
    120,
  );
  const phone = s(doc.parentPhone, 40);
  const email = s(doc.parentEmail, 160);
  const players = s(
    Array.isArray(doc.players)
      ? (doc.players as Array<Record<string, unknown>>)
          .map((p) => (typeof p?.name === 'string' ? p.name.trim() : ''))
          .filter(Boolean)
          .join(', ')
      : '',
    300,
  );
  const team = s(doc.teamLabel ?? doc.teamCode, 80);
  const notes = s(doc.notes, 500);

  const msg = [
    `🏀 New ${teamConfig.teamName} registration (pending)`,
    '',
    `Parent: ${parentName}`,
    `Phone: ${phone}`,
    ...(email ? [`Email: ${email}`] : []),
    `Player(s): ${players}`,
    `Team: ${team}`,
    ...(notes ? [`Notes: ${notes}`] : []),
    '',
    `Review + approve: ${SITE_URL}/dashboard/registrations`,
  ].join('\n');

  const tg = await sendTelegram(msg);
  // Never fail the caller on a notify hiccup — the registration is already saved.
  return NextResponse.json({ ok: tg.ok, error: tg.error });
}
