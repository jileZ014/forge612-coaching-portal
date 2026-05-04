import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { getStripe, paymentMethodFromPaidInvoice } from '@/lib/stripe';
import type Stripe from 'stripe';
import type { InvoiceActivity, MonthlyPayment, Parent } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Webhook receives Stripe events and mirrors them into Firestore.
// Source of truth: Stripe (live status) → Firestore (cached for dashboard).
// No more "Sync Square" polling. The dashboard reads Firestore which is kept fresh by these events.
//
// Events handled:
//   invoice.finalized                  — invoice goes from draft → open
//   invoice.sent                       — Stripe sent the email (when autoSendEmail=true)
//   invoice.paid                       — payment captured, mark month paid in Firestore
//   invoice.payment_succeeded          — synonym (handle for safety)
//   invoice.payment_failed             — surface in dashboard (ACH bounce, expired card, etc.)
//   invoice.voided                     — when we cancel/replace
//   invoice.marked_uncollectible       — when we manually write off
//   customer.updated                   — keep email/phone in sync if user updates in portal
//
// Webhook URL (after deploy): https://flight-pay.netlify.app/api/stripe/webhook
// Configure in Stripe Dashboard → Developers → Webhooks → Add endpoint.
export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return NextResponse.json({ error: 'Missing stripe signature or secret' }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Signature verification failed: ${err instanceof Error ? err.message : err}` },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case 'invoice.finalized':
      case 'invoice.sent':
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.voided':
      case 'invoice.marked_uncollectible':
        await handleInvoiceEvent(event);
        break;
      case 'customer.updated':
        await handleCustomerUpdate(event.data.object as Stripe.Customer);
        break;
      default:
        // Ignore other events we didn't subscribe to
        break;
    }
  } catch (err) {
    console.error('[stripe.webhook] handler error:', err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleInvoiceEvent(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const meta = invoice.metadata ?? {};
  const parentId = meta.firestoreParentId;
  const month = meta.month;
  if (!parentId || !month) {
    console.warn('[stripe.webhook] invoice missing parentId/month metadata:', invoice.id);
    return;
  }

  const parentRef = doc(db, 'parents', parentId);
  const snap = await (await import('firebase/firestore')).getDoc(parentRef);
  if (!snap.exists()) {
    console.warn('[stripe.webhook] parent not found for invoice:', invoice.id);
    return;
  }

  const parent = { id: snap.id, ...(snap.data() as Omit<Parent, 'id'>) } as Parent;
  const prev = parent.invoiceActivity?.[month] ?? ({} as InvoiceActivity);

  // Derive payment method from the actual charge/PaymentIntent, not a hardcoded 'card'.
  // Fix for BLOCKER 3 (board QA 2026-05-03): ACH/Cash App were being recorded as card.
  let paidVia: 'card' | 'ach' | 'cash' | 'check' | 'zelle' | null = prev.paidVia ?? null;
  if (invoice.status === 'paid') {
    try {
      paidVia = await paymentMethodFromPaidInvoice(invoice);
    } catch {
      // Fall back to 'card' if charge/PI lookup fails — most common case
      paidVia = 'card';
    }
  }

  const updated: InvoiceActivity = {
    ...prev,
    provider: 'stripe',
    stripeInvoiceId: invoice.id,
    stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? prev.stripeCustomerId,
    stripeStatus: invoice.status as 'draft' | 'open' | 'paid' | 'void' | 'uncollectible',
    publicUrl: invoice.hosted_invoice_url ?? prev.publicUrl ?? '',
    amount: (invoice.amount_due ?? prev.amount ?? 0) / 100,
    sentAt: prev.sentAt,
    viewedAt: prev.viewedAt ?? null,
    viewCount: prev.viewCount ?? 0,
    lastReminderAt: prev.lastReminderAt ?? null,
    sms: prev.sms,
    paidAt: invoice.status === 'paid'
      ? new Date(((invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) as number) * 1000).toISOString()
      : prev.paidAt ?? null,
    paidVia,
  };

  const nextActivity: Record<string, InvoiceActivity> = { ...(parent.invoiceActivity ?? {}) };
  nextActivity[month] = updated;

  // If the invoice is paid, mirror to monthly payment record too (dashboard uses both fields).
  const updates: Record<string, unknown> = {
    invoiceActivity: nextActivity,
    updatedAt: new Date().toISOString(),
  };

  if (invoice.status === 'paid') {
    const payments: Record<string, MonthlyPayment> = { ...(parent.payments ?? {}) };
    payments[month] = {
      status: 'paid',
      method: 'stripe',
      paidAt: updated.paidAt ?? new Date().toISOString(),
    };
    updates.payments = payments;
    if (paidVia) {
      console.log(`[stripe.webhook] paid via ${paidVia} — invoice=${invoice.id} parent=${parentId} month=${month}`);
    }
  }

  await updateDoc(parentRef, updates);
}

async function handleCustomerUpdate(customer: Stripe.Customer) {
  const parentId = customer.metadata?.firestoreParentId;
  if (!parentId) return;

  const parentRef = doc(db, 'parents', parentId);
  const snap = await (await import('firebase/firestore')).getDoc(parentRef);
  if (!snap.exists()) return;

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (customer.email) updates.email = customer.email;
  if (customer.phone) updates.phone = customer.phone;

  await updateDoc(parentRef, updates);
}
