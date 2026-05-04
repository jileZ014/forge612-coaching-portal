import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { createMonthlyInvoice, ensureStripeCustomer, voidOpenInvoicesForParentMonth } from '@/lib/stripe';
import type { InvoiceActivity, Parent } from '@/types';

// POST body:
//   {
//     month: string,           // "2026-05"  (required)
//     daysUntilDue?: number,   // default 7
//     autoSendEmail?: boolean, // default false
//     parentIds?: string[]     // optional — only invoice these. Otherwise: all active parents
//                              //                                   without doNotInvoice and with
//                              //                                   monthlyRate > 0 OR currentBalance > 0
//   }
//
// Creates Stripe invoices in bulk. Skips families already paid for the month (status 'paid' on the
// monthlyPayment for that month). Voids any existing OPEN Stripe invoice for that month before
// creating fresh (so re-runs are safe and reflect rate changes).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { month, parentIds, daysUntilDue, autoSendEmail } = body as {
    month?: string;
    parentIds?: string[];
    daysUntilDue?: number;
    autoSendEmail?: boolean;
  };

  if (!month) return NextResponse.json({ error: 'Missing month (e.g. "2026-05")' }, { status: 400 });

  const snap = await getDocs(collection(db, 'parents'));
  const all: Parent[] = [];
  snap.forEach((d) => all.push({ id: d.id, ...(d.data() as Omit<Parent, 'id'>) }));

  const targets = all.filter((p) => {
    if (parentIds && parentIds.length > 0) return parentIds.includes(p.id);
    if (p.doNotInvoice) return false;
    if (p.status !== 'active') return false;
    const monthPayment = p.payments?.[month];
    if (monthPayment?.status === 'paid') return false;
    return p.monthlyRate > 0 || p.currentBalance > 0;
  });

  const results: Array<{
    parentId: string;
    name: string;
    ok: boolean;
    invoiceId?: string;
    hostedUrl?: string;
    amount?: number;
    voidedExisting?: number;
    skipped?: string;
    error?: string;
  }> = [];

  for (const parent of targets) {
    try {
      // Source-of-truth pre-check: void any open Stripe invoice for this parent+month
      // by asking Stripe directly (NOT Firestore cache).
      // Fix for BLOCKER 2 (board QA 2026-05-03).
      let voidedExisting = 0;
      try {
        const customer = await ensureStripeCustomer(parent);
        const result = await voidOpenInvoicesForParentMonth(customer.id, parent.id, month);
        voidedExisting = result.voided;
      } catch (err) {
        console.warn(`[batch-create] pre-create void check failed for ${parent.id}:`, err);
      }

      const { invoice, hostedUrl, customerId } = await createMonthlyInvoice({
        parent,
        month,
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

      await updateDoc(doc(db, 'parents', parent.id), {
        invoiceActivity: next,
        stripeCustomerId: customerId,
        updatedAt: new Date().toISOString(),
      });

      results.push({
        parentId: parent.id,
        name: `${parent.firstName} ${parent.lastName}`.trim(),
        ok: true,
        invoiceId: invoice.id,
        hostedUrl,
        amount: activity.amount,
        voidedExisting,
      });
    } catch (err) {
      results.push({
        parentId: parent.id,
        name: `${parent.firstName} ${parent.lastName}`.trim(),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  // SHOULD-FIX from board QA: don't return 200 when every invoice failed.
  // 207 Multi-Status when some failed; 502 when all failed and we attempted at least one.
  const status = results.length === 0 ? 200 : (okCount === 0 ? 502 : (okCount < results.length ? 207 : 200));
  return NextResponse.json({
    month,
    total: results.length,
    ok: okCount,
    failed: results.length - okCount,
    results,
  }, { status });
}
