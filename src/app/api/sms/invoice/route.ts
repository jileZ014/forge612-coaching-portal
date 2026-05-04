import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { composeInvoiceSms, sendSms, sendSmsBatch } from '@/lib/twilio-invoice';
import type { InvoiceActivity, Parent } from '@/types';

// POST body — three modes:
//
//   Mode 1: bulk send for a month (uses each parent's existing invoiceActivity[month].publicUrl)
//     {
//       month: "2026-05",
//       parentIds?: string[]  // optional — only these. Otherwise all with invoice for that month.
//     }
//
//   Mode 2: single send (use a custom URL — e.g. just texted yourself a Stripe link)
//     { parentId, body, month? }
//
//   Mode 3: re-send (re-text the existing invoice URL for a parent/month)
//     { parentId, month, resend: true }
//
// In Mode 1, the SMS body is composed automatically from the invoice. In Mode 2, you supply body.
//
// Always:
// - Returns per-recipient delivery status from Twilio (queued/sent/delivered/failed).
// - Updates parent.invoiceActivity[month].sms with delivery metadata.
// - Updates parent.invoiceActivity[month].sentAt + parent.lastTexted on success.
// - Errors per-recipient do NOT abort the batch.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { month, parentIds, parentId, body: customBody, resend } = body as {
    month?: string;
    parentIds?: string[];
    parentId?: string;
    body?: string;
    resend?: boolean;
  };

  // ---------- Mode 2: single custom send ----------
  if (parentId && customBody && !resend) {
    const snap = await getDoc(doc(db, 'parents', parentId));
    if (!snap.exists()) return NextResponse.json({ error: 'parent not found' }, { status: 404 });
    const parent: Parent = { id: snap.id, ...(snap.data() as Omit<Parent, 'id'>) };
    try {
      const delivery = await sendSms({ to: parent.phone, body: customBody });
      const ts = new Date().toISOString();
      const updates: Record<string, unknown> = { lastTexted: ts, updatedAt: ts };
      if (month) {
        const prev = parent.invoiceActivity?.[month];
        if (prev) {
          const next: Record<string, InvoiceActivity> = { ...(parent.invoiceActivity ?? {}) };
          next[month] = { ...prev, sms: delivery, sentAt: ts };
          updates.invoiceActivity = next;
        }
      }
      await updateDoc(doc(db, 'parents', parentId), updates);
      return NextResponse.json({ ok: true, delivery });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  // ---------- Mode 3: single resend ----------
  if (parentId && month && resend) {
    const snap = await getDoc(doc(db, 'parents', parentId));
    if (!snap.exists()) return NextResponse.json({ error: 'parent not found' }, { status: 404 });
    const parent: Parent = { id: snap.id, ...(snap.data() as Omit<Parent, 'id'>) };
    const activity = parent.invoiceActivity?.[month];
    if (!activity?.publicUrl) {
      return NextResponse.json({ error: 'no invoice for that month' }, { status: 400 });
    }
    const composed = composeInvoiceSms({
      parentFirstName: parent.firstName,
      monthLabel: monthLabel(month),
      amount: activity.amount,
      hostedUrl: activity.publicUrl,
    });
    try {
      const delivery = await sendSms({ to: parent.phone, body: composed });
      const ts = new Date().toISOString();
      const next: Record<string, InvoiceActivity> = { ...(parent.invoiceActivity ?? {}) };
      next[month] = {
        ...activity,
        sms: delivery,
        sentAt: ts,
        lastReminderAt: activity.sentAt ? ts : activity.lastReminderAt,
      };
      await updateDoc(doc(db, 'parents', parentId), {
        invoiceActivity: next,
        lastTexted: ts,
        updatedAt: ts,
      });
      return NextResponse.json({ ok: true, delivery });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  // ---------- Mode 1: bulk send for a month ----------
  if (!month) {
    return NextResponse.json(
      { error: 'Provide month (e.g. "2026-05") or parentId+body, or parentId+month+resend' },
      { status: 400 },
    );
  }

  const allSnap = await getDocs(collection(db, 'parents'));
  const all: Parent[] = [];
  allSnap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<Parent, 'id'>) }));

  const targets = all.filter((p) => {
    if (p.doNotInvoice) return false;
    if (parentIds && parentIds.length > 0) return parentIds.includes(p.id);
    const activity = p.invoiceActivity?.[month];
    return Boolean(activity?.publicUrl);
  });

  const items = targets.map((p) => {
    const activity = p.invoiceActivity![month]!;
    return {
      to: p.phone,
      body: composeInvoiceSms({
        parentFirstName: p.firstName,
        monthLabel: monthLabel(month),
        amount: activity.amount,
        hostedUrl: activity.publicUrl,
      }),
      parentId: p.id,
      month,
    };
  });

  // Persist delivery status as each send completes (NOT after the whole batch).
  // Fix for SHOULD-FIX (board QA 2026-05-03): if the function times out mid-batch, we want
  // every successful send to already be persisted to Firestore.
  const targetsById = new Map(targets.map((p) => [p.id, p] as const));

  const sendResults = await sendSmsBatch(items, async (result) => {
    const parent = targetsById.get(result.parentId);
    if (!parent) return;
    const prevActivity = parent.invoiceActivity?.[month];
    if (!prevActivity) return;
    const ts = new Date().toISOString();
    const updated: InvoiceActivity = {
      ...prevActivity,
      sms: result.delivery,
      sentAt: result.ok ? ts : prevActivity.sentAt,
    };
    const nextActivity: Record<string, InvoiceActivity> = { ...(parent.invoiceActivity ?? {}) };
    nextActivity[month] = updated;
    await updateDoc(doc(db, 'parents', parent.id), {
      invoiceActivity: nextActivity,
      lastTexted: result.ok ? ts : parent.lastTexted,
      updatedAt: ts,
    });
  });

  const okCount = sendResults.filter((r) => r.ok).length;
  // Don't return 200 when every send failed — fix for SHOULD-FIX (board QA 2026-05-03).
  const status = sendResults.length === 0
    ? 200
    : okCount === 0
      ? 502
      : okCount < sendResults.length
        ? 207
        : 200;

  return NextResponse.json({
    month,
    total: sendResults.length,
    ok: okCount,
    failed: sendResults.length - okCount,
    results: sendResults.map((r) => ({
      parentId: r.parentId,
      ok: r.ok,
      twilioSid: r.delivery?.twilioSid,
      status: r.delivery?.status,
      error: r.error,
    })),
  }, { status });
}

function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[parseInt(m, 10) - 1] ?? m} ${year}`;
}
