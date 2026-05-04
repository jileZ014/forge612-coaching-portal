export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthToken, isAuthError } from '@/lib/auth-helpers';
import { sendSms, sendSmsBatch, brandedSms, commFromDelivery } from '@/lib/twilio';
import { teamConfig } from '@/lib/team-config';

const TEAM_ID = teamConfig.teamId;

export async function POST(req: NextRequest) {
  const authResult = await verifyAuthToken(req);
  if (isAuthError(authResult)) return authResult;

  let body: {
    familyId?: string;
    familyIds?: string[];
    lifecycleStage?: string;
    body?: string;
    playerId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const messageBody = body.body;
  if (!messageBody || typeof messageBody !== 'string' || messageBody.trim().length === 0) {
    return NextResponse.json({ error: 'body (message text) is required' }, { status: 400 });
  }

  const adminDb = getAdminDb();
  const familiesRef = adminDb.collection('teams').doc(TEAM_ID).collection('families');
  const commsRef = adminDb.collection('teams').doc(TEAM_ID).collection('communications');

  if (body.familyId && !body.familyIds && !body.lifecycleStage) {
    const familyDoc = await familiesRef.doc(body.familyId).get();
    if (!familyDoc.exists) {
      return NextResponse.json({ error: 'family not found' }, { status: 404 });
    }
    const family = familyDoc.data()!;
    const composed = brandedSms({
      parentFirstName: (family.primaryParentName ?? 'there').split(' ')[0],
      body: messageBody,
    });
    try {
      const delivery = await sendSms({ to: family.primaryParentPhone, body: composed });
      const comm = commFromDelivery({
        familyId: body.familyId,
        playerId: body.playerId,
        body: composed,
        delivery,
      });
      await commsRef.add({ ...comm, createdAt: new Date().toISOString() });
      return NextResponse.json({ ok: true, delivery });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const comm = commFromDelivery({
        familyId: body.familyId,
        playerId: body.playerId,
        body: composed,
        error: message,
      });
      await commsRef.add({ ...comm, createdAt: new Date().toISOString() });
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
  }

  let targetFamilies: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [];
  if (body.familyIds && body.familyIds.length > 0) {
    const docs = await Promise.all(body.familyIds.map((id) => familiesRef.doc(id).get()));
    targetFamilies = docs
      .filter((d) => d.exists)
      .map((d) => ({ id: d.id, data: d.data()! }));
  } else if (body.lifecycleStage) {
    const snap = await familiesRef.where('lifecycleStage', '==', body.lifecycleStage).get();
    targetFamilies = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } else {
    return NextResponse.json(
      { error: 'Provide familyId, familyIds, or lifecycleStage' },
      { status: 400 },
    );
  }

  targetFamilies = targetFamilies.filter((f) => !f.data.doNotContact);

  if (targetFamilies.length === 0) {
    return NextResponse.json({ ok: true, total: 0, sent: 0, failed: 0, results: [] });
  }

  const items = targetFamilies.map((f) => ({
    familyId: f.id,
    to: f.data.primaryParentPhone,
    body: brandedSms({
      parentFirstName: (f.data.primaryParentName ?? 'there').split(' ')[0],
      body: messageBody,
    }),
  }));

  const results = await sendSmsBatch(items, async (result, item) => {
    const comm = commFromDelivery({
      familyId: result.familyId,
      body: item.body,
      delivery: result.delivery,
      error: result.error,
    });
    try {
      await commsRef.add({ ...comm, createdAt: new Date().toISOString() });
    } catch (persistErr) {
      console.warn(`[sms.send] could not log comm for ${result.familyId}:`, persistErr);
    }
  });

  const okCount = results.filter((r) => r.ok).length;
  const status = okCount === 0 ? 502 : okCount < results.length ? 207 : 200;

  return NextResponse.json(
    {
      total: results.length,
      sent: okCount,
      failed: results.length - okCount,
      results: results.map((r) => ({
        familyId: r.familyId,
        ok: r.ok,
        twilioSid: r.delivery?.twilioSid,
        status: r.delivery?.status,
        error: r.error,
      })),
    },
    { status },
  );
}
