import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireCoach, isAuthError } from '@/lib/auth-helpers';
import { createMonthlyInvoice, ensureStripeCustomer, voidOpenInvoicesForParentMonth, MAX_INVOICE_USD } from '@/lib/stripe';
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
  const auth = await requireCoach(req);
  if (isAuthError(auth)) return auth;

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

  const parentRef = getAdminDb().collection('parents').doc(parentId);
  const snap = await parentRef.get();
  if (!snap.exists) return NextResponse.json({ error: 'parent not found' }, { status: 404 });
  const parent: Parent = { id: snap.id, ...(snap.data() as Omit<Parent, 'id'>) };

  // Never bill an unbounded client-supplied amount. An override is still allowed
  // (coach-only, and coaches do adjust a month), but it must be a sane positive
  // number within a hard ceiling — see the 2026-08-11 audit.
  if (amount !== undefined) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_INVOICE_USD) {
      return NextResponse.json(
        { error: `amount must be a positive number no greater than ${MAX_INVOICE_USD}` },
        { status: 400 },
      );
    }
  }

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
      voidedPriorCount: voidedCount,
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

    await parentRef.update({
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
