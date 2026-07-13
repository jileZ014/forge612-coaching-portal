export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { sendTelegram } from '@/lib/telegram';

// Telegram-only notifier for a new self-registration. NO Firebase/admin dependency,
// so it works in production with just TELEGRAM_BOT_TOKEN set. The public /register page
// writes the registration doc directly (client SDK) and then calls this to ping the coach.
// Summary fields come from the request body (the client already has the data it submitted).

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flight-pay.netlify.app';
const s = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export async function POST(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parentName = s(b.parentName, 120);
  const phone = s(b.phone, 40);
  const email = s(b.email, 160);
  const players = s(b.players, 300);
  const team = s(b.team, 80);
  const notes = s(b.notes, 500);

  const msg = [
    '🏀 New AZ Flight registration (pending)',
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
