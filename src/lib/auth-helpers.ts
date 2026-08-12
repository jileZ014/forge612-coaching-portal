import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { teamConfig } from '@/lib/team-config';

/**
 * Verifies the caller presented a genuine Firebase ID token.
 *
 * NOTE: this proves "some real account", NOT "this club's coach". Anything that
 * touches family PII, money, or outbound messaging must use requireCoach()
 * instead — see the 2026-08-11 audit.
 */
export async function verifyAuthToken(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded;
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
}

/**
 * Verifies the caller is THIS club's coach.
 *
 * Identity comes from team-config.json (the same source firestore.rules uses via
 * teams/{teamId}.coachEmail), so a fork for a different club scopes automatically.
 * Returns the decoded token on success, or a NextResponse to return as-is.
 */
export async function requireCoach(req: NextRequest) {
  const result = await verifyAuthToken(req);
  if (isAuthError(result)) return result;

  const coachEmail = teamConfig.coachEmail?.trim().toLowerCase();
  if (!coachEmail) {
    // Fail closed: a fork with no coachEmail configured must not accept writes.
    return NextResponse.json(
      { error: 'Server misconfigured: team-config.json has no coachEmail' },
      { status: 500 },
    );
  }

  const callerEmail = result.email?.trim().toLowerCase();
  if (!callerEmail || callerEmail !== coachEmail) {
    return NextResponse.json({ error: 'Forbidden — coach access required' }, { status: 403 });
  }

  return result;
}

export function isAuthError(result: unknown): result is NextResponse {
  return result instanceof NextResponse;
}
