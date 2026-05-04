export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, isAuthError } from '@/lib/auth-helpers';
import { teamConfig } from '@/lib/team-config';

const TEAM_ID = teamConfig.teamId;

export async function POST(req: NextRequest) {
  const authResult = await verifyAuthToken(req);
  if (isAuthError(authResult)) return authResult;

  let body: {
    familyId?: string;
    channel?: string;
    direction?: string;
    summary?: string;
    body?: string;
    playerId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.familyId || !body.summary) {
    return NextResponse.json({ error: 'familyId and summary are required' }, { status: 400 });
  }

  const allowedChannels = ['sms', 'email', 'phone', 'in_person', 'system'] as const;
  const channel = (body.channel ?? 'phone') as (typeof allowedChannels)[number];
  if (!allowedChannels.includes(channel)) {
    return NextResponse.json(
      { error: `channel must be one of: ${allowedChannels.join(', ')}` },
      { status: 400 },
    );
  }

  const direction = (body.direction ?? 'outbound') as 'inbound' | 'outbound';
  if (direction !== 'inbound' && direction !== 'outbound') {
    return NextResponse.json(
      { error: 'direction must be inbound or outbound' },
      { status: 400 },
    );
  }

  const adminDb = getAdminDb();
  const now = new Date().toISOString();

  const ref = await adminDb
    .collection('teams')
    .doc(TEAM_ID)
    .collection('communications')
    .add({
      familyId: body.familyId,
      playerId: body.playerId,
      timestamp: now,
      channel,
      direction,
      summary: body.summary,
      body: body.body,
      authorEmail: authResult.email,
      createdAt: now,
    });

  return NextResponse.json({ ok: true, id: ref.id });
}
