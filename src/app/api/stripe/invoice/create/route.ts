import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { createMonthlyInvoice, ensureStripeCustomer, voidOpenInvoicesForParentMonth } from '@/lib/stripe';
import type { InvoiceActivity, Parent } from '@/types';

// POST body:
//   {
//     parentId: string,
//     month: string,            // "2026-05"
//     amount?: number,          // overrides parent.monthlyRate
//     daysUntilDue?: number,    // default 7
//     autoSendEmail?: boolean   // default false (we use SMS path)
//   }
//
// Creates a Stripe Invoice for the parent, finalizes it, and stores hostedUrl + stripeInvoiceId on
// parent.invoiceActivity[month]. Idempotent on re-runs of the SAME month — voids prior open Stripe
// invoice for that month and creates fresh one (so amount changes are honored).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { parentId, month, amount, daysUntilDue, autoSendEmail } = body as {
    parentId?: string;
    month?: string;
    amount?: number;
    daysUntilDue?: number;
    autoSendEmail?: boolean;
  };

  if (!parentId || !month) {
    return NextResponse.json({ error: 'Missing parentId or month' }, { status: 400 });
  }

  const snap = await getDoc(doc(db, 'parents', parentId));
  if (!snap.exists()) return NextResponse.json({ error: 'parent not found' }, { status: 404 });
  const parent: Parent = { id: snap.id, ...(snap.data() as Omit<Parent, 'id'>) };

  if (parent.doNotInvoice) {
    return NextResponse.json({ error: 'Parent flagged doNotInvoice' }, { status: 400 });
  }

  // Source-of-truth safety check: ask Stripe (not Firestore) what's actually open for this
  // parent+month. Voids any matches before creating fresh.
  // Fix for BLOCKER 2 (board QA 2026-05-03).
  let voidedCount = 0;
  let voidedIds: string[] = [];
  try {
    const customer = await ensureStripeCustomer(parent);
    const result = await voidOpenInvoicesForParentMonth(customer.id, parentId, month);
    voidedCount = result.voided;
    voidedIds = result.voidedIds;
  } catch (err) {
    console.warn('[stripe.invoice.create] pre-create void check failed:', err);
  }

  try {
    const { invoice, hostedUrl, customerId } = await createMonthlyInvoice({
      parent,
      month,
      amountUsd: amount,
      daysUntilDue,
      autoSendEmail,
    });

    const activity: InvoiceActivity = {
      provider: 'stripe',
      stripeInvoiceId: invoice.id,
      stripeCustomerId: customerId,
      stripeStatus: invoice.status as 'draft' | 'open' | 'paid' | 'void' | 'uncollectible',
      publicUrl: hostedUrl,
      amount: (invoice.amount_due ?? 0) / 100,
      sentAt: null,
      viewedAt: null,
      viewCount: 0,
      lastReminderAt: null,
      paidAt: null,
      paidVia: null,
    };

    const next: Record<string, InvoiceActivity> = { ...(parent.invoiceActivity ?? {}) };
    next[month] = activity;

    await updateDoc(doc(db, 'parents', parentId), {
      invoiceActivity: next,
      stripeCustomerId: customerId,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      parentId,
      month,
      invoiceId: invoice.id,
      hostedUrl,
      amount: activity.amount,
      voidedExistingCount: voidedCount,
      voidedExistingIds: voidedIds,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        parentId,
        month,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
