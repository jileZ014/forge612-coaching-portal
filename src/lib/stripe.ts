import Stripe from 'stripe';
import type { Parent } from '@/types';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) throw new Error('STRIPE_SECRET_KEY not set');
    _stripe = new Stripe(secret, {
      typescript: true,
    });
  }
  return _stripe;
}

export function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_live_');
}

// Normalize a phone number to E.164 (+1XXXXXXXXXX) for Stripe + Twilio
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+1${digits}`;
}

// Build a Stripe Customer payload from a Parent record.
// Many AZ Flight parents have no email on file (phone-only families). Stripe's
// `collection_method: 'send_invoice'` requires an email on the Customer at
// invoice-create time. We use a non-deliverable placeholder so the invoice can
// be created and the hosted_invoice_url generated; we deliver via Twilio SMS,
// not Stripe email, so the placeholder never receives mail.
function placeholderEmail(parentId: string): string {
  return `invoice+${parentId}@azflighthoops.com`;
}

// Includes Firestore parentId + month metadata so webhooks can route back.
export function customerPayloadFromParent(parent: Parent): Stripe.CustomerCreateParams {
  return {
    name: `${parent.firstName} ${parent.lastName}`.trim(),
    email: parent.email ?? placeholderEmail(parent.id),
    phone: toE164(parent.phone),
    metadata: {
      firestoreParentId: parent.id,
      legacySquareCustomerId: parent.squareCustomerId ?? '',
      team: parent.team ?? '',
      players: (parent.playerNames ?? []).join(', ').slice(0, 500),
      placeholderEmail: parent.email ? 'false' : 'true',
    },
  };
}

// Find or create a Stripe Customer for the parent. Idempotent.
export async function ensureStripeCustomer(parent: Parent): Promise<Stripe.Customer> {
  const stripe = getStripe();

  // Email needs patching if missing OR points at an obsolete placeholder TLD
  // (`.local` is reserved special-use; Stripe accepts the format on customer
  // create but rejects it at invoice-create with `send_invoice` collection).
  const needsEmailPatch = (c: Stripe.Customer): boolean => {
    if (!c.email) return true;
    if (c.email.endsWith('.local')) return true;
    // If parent now has a real email but customer still has placeholder, refresh.
    if (parent.email && c.email !== parent.email) return true;
    return false;
  };

  const patchCustomer = async (c: Stripe.Customer): Promise<Stripe.Customer> => {
    return await stripe.customers.update(c.id, {
      email: parent.email ?? placeholderEmail(parent.id),
      phone: toE164(parent.phone),
      name: `${parent.firstName} ${parent.lastName}`.trim() || c.name || undefined,
      metadata: {
        ...c.metadata,
        firestoreParentId: parent.id,
        placeholderEmail: parent.email ? 'false' : 'true',
      },
    });
  };

  // 1) If we already have a Stripe Customer ID, fetch and verify it still exists.
  if (parent.stripeCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(parent.stripeCustomerId);
      if (!('deleted' in existing) || !existing.deleted) {
        const c = existing as Stripe.Customer;
        return needsEmailPatch(c) ? await patchCustomer(c) : c;
      }
    } catch {
      // fall through to search/create
    }
  }

  // 2) Search by metadata.firestoreParentId — handles re-runs after a partial sync.
  const search = await stripe.customers.search({
    query: `metadata['firestoreParentId']:'${parent.id}'`,
    limit: 1,
  });
  if (search.data.length > 0) {
    const c = search.data[0];
    return needsEmailPatch(c) ? await patchCustomer(c) : c;
  }

  // 3) Create new
  return await stripe.customers.create(customerPayloadFromParent(parent));
}

// Compute amount for a parent for a given month.
// Custom rate takes precedence — see RATE_CONFIG in types/index.ts where 'custom' has amount: null.
// Fix for NIT (board QA 2026-05-03): a parent with rateType='custom' could have monthlyRate=0 and
// customRate=200. Old code returned 0; new code respects rateType.
export function computeMonthAmountUsd(parent: Parent): number {
  if (parent.rateType === 'custom') {
    if (parent.customRate && parent.customRate > 0) return parent.customRate;
    if (parent.monthlyRate > 0) return parent.monthlyRate;
    return 0;
  }
  if (parent.monthlyRate > 0) return parent.monthlyRate;
  if (parent.customRate && parent.customRate > 0) return parent.customRate;
  return 0;
}

// Build line item description. Includes month + tier so the parent sees clarity in the email.
export function buildInvoiceDescription(month: string, parent: Parent): string {
  const [year, m] = month.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[parseInt(m, 10) - 1] ?? m;
  const tier =
    parent.rateType === 'siblings' ? 'Siblings rate'
    : parent.rateType === 'special' ? 'Special rate'
    : parent.rateType === 'custom' ? 'Custom rate'
    : 'Regular rate';
  return `AZ Flight Hoops — ${monthName} ${year} Tuition (${tier})`;
}

// Create + finalize a Stripe Invoice for a single month.
// Returns { invoice, hostedUrl }. Does NOT send the email — caller decides.
export async function createMonthlyInvoice(opts: {
  parent: Parent;
  month: string; // "2026-05"
  amountUsd?: number; // overrides parent.monthlyRate if provided
  daysUntilDue?: number;
  autoSendEmail?: boolean;
  // Caller increments this each time it voids a prior open invoice for this
  // parent+month, so the idempotency key here changes after a void. Without
  // this, the cached "draft created" response from Stripe gets replayed and
  // we try to re-finalize an already-voided invoice — Stripe rejects.
  voidedPriorCount?: number;
}): Promise<{
  invoice: Stripe.Invoice;
  hostedUrl: string;
  customerId: string;
}> {
  const stripe = getStripe();
  const customer = await ensureStripeCustomer(opts.parent);
  const amount = opts.amountUsd ?? computeMonthAmountUsd(opts.parent);
  if (amount <= 0) throw new Error(`No amount due for ${opts.parent.id} (${opts.month})`);

  // Idempotency: scope to THIS function invocation only. The 3 sub-calls
  // (create + items + finalize) share one key so internal retries within
  // a single request are safe. Cross-request de-dup is handled by the
  // caller via voidOpenInvoicesForParentMonth before this function runs.
  // (Earlier we baked parent+month+amount into the key for cross-request
  // idempotency, but that fights with the void-and-recreate flow: Stripe
  // replays a cached create response describing an invoice that has since
  // been voided, breaking the next finalize. Per-invocation key avoids it.)
  const requestId = (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 16);
  const idempotencyKey = `inv_${opts.parent.id}_${opts.month}_${Math.round(amount * 100)}_${requestId}`;

  // 1) Create draft invoice (idempotent)
  const draftCached = await stripe.invoices.create(
    {
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: opts.daysUntilDue ?? 7,
      auto_advance: false,
      description: `Monthly tuition for ${opts.month}`,
      metadata: {
        firestoreParentId: opts.parent.id,
        month: opts.month,
        tier: opts.parent.rateType,
      },
    },
    { idempotencyKey: `${idempotencyKey}_draft` },
  );

  // Idempotency may return the ORIGINAL response — which says status='draft'
  // even if the actual invoice has since been finalized. Refresh the live
  // state so we don't try to re-finalize an already-open invoice.
  const draft = await stripe.invoices.retrieve(draftCached.id);
  if (draft.status === 'open' || draft.status === 'paid') {
    if (!draft.hosted_invoice_url) {
      throw new Error(`Stripe invoice ${draft.id} is ${draft.status} but has no hosted_invoice_url`);
    }
    return {
      invoice: draft,
      hostedUrl: draft.hosted_invoice_url,
      customerId: customer.id,
    };
  }

  // 2) Add line item — if this fails, void the draft so we don't leave a $0 invoice that
  //    could later be finalized (BLOCKER 1 fix from board QA 2026-05-03).
  try {
    await stripe.invoiceItems.create(
      {
        customer: customer.id,
        invoice: draft.id,
        amount: Math.round(amount * 100),
        currency: 'usd',
        description: buildInvoiceDescription(opts.month, opts.parent),
      },
      { idempotencyKey: `${idempotencyKey}_item` },
    );
  } catch (itemErr) {
    try {
      await stripe.invoices.voidInvoice(draft.id);
    } catch {
      // Best-effort void — log but don't mask the real error
      console.warn(`[stripe] could not void orphaned draft ${draft.id} after item-create failure`);
    }
    throw itemErr;
  }

  // 3) Finalize (gives us hosted_invoice_url). If this fails, void the draft.
  let finalized: Stripe.Invoice;
  try {
    finalized = await stripe.invoices.finalizeInvoice(draft.id, { auto_advance: false });
  } catch (finalizeErr) {
    try {
      await stripe.invoices.voidInvoice(draft.id);
    } catch {
      console.warn(`[stripe] could not void draft ${draft.id} after finalize failure`);
    }
    throw finalizeErr;
  }

  // 4) Optionally trigger Stripe's auto-email (only if customer has an email)
  if (opts.autoSendEmail && opts.parent.email) {
    try {
      await stripe.invoices.sendInvoice(finalized.id);
    } catch (err) {
      // Non-fatal — we still got hosted URL for SMS path
      console.warn(`[stripe] sendInvoice failed for ${finalized.id}:`, err);
    }
  }

  if (!finalized.hosted_invoice_url) {
    throw new Error(`Stripe finalized invoice ${finalized.id} but returned no hosted_invoice_url`);
  }

  return {
    invoice: finalized,
    hostedUrl: finalized.hosted_invoice_url,
    customerId: customer.id,
  };
}

// Find ALL open Stripe invoices for a parent + month, regardless of what Firestore thinks.
// This is the canonical safety check: never trust the cache for "is there an open invoice?" —
// always ask Stripe. Voiding the result of this is idempotent and safe.
//
// Fix for BLOCKER 2 (board QA 2026-05-03): stale Firestore cache was allowing duplicate
// open invoices for the same parent/month if a prior webhook delivery failed.
export async function listOpenInvoicesForParentMonth(
  customerId: string,
  parentId: string,
  month: string,
): Promise<Stripe.Invoice[]> {
  const stripe = getStripe();
  // Stripe doesn't allow filtering by metadata on /v1/invoices list, so list by customer + status
  // and filter in-process. Customer scope keeps the list small (per-family).
  const list = await stripe.invoices.list({
    customer: customerId,
    status: 'open',
    limit: 100,
  });
  return list.data.filter(
    (inv) =>
      inv.metadata?.firestoreParentId === parentId &&
      inv.metadata?.month === month,
  );
}

// Void any open Stripe invoices for the given parent/month before creating a fresh one.
// Returns the count voided. Safe to run on a parent with no open invoices (returns 0).
export async function voidOpenInvoicesForParentMonth(
  customerId: string,
  parentId: string,
  month: string,
): Promise<{ voided: number; voidedIds: string[] }> {
  const stripe = getStripe();
  const open = await listOpenInvoicesForParentMonth(customerId, parentId, month);
  const voidedIds: string[] = [];
  for (const inv of open) {
    try {
      await stripe.invoices.voidInvoice(inv.id);
      voidedIds.push(inv.id);
    } catch (err) {
      console.warn(`[stripe] could not void invoice ${inv.id}:`, err);
    }
  }
  return { voided: voidedIds.length, voidedIds };
}

// Determine the actual payment method used for a paid invoice.
// Fix for BLOCKER 3 (board QA 2026-05-03): hardcoding 'card' corrupted the audit trail
// for ACH and other methods.
export async function paymentMethodFromPaidInvoice(
  invoice: Stripe.Invoice,
): Promise<'card' | 'ach' | 'cash' | 'check' | 'zelle'> {
  if (invoice.status !== 'paid') return 'card';

  // Stripe SDK v22+ removed invoice.charge; charges are now under invoice.payments expanded.
  // Try the legacy charge field via untyped access first (works on older API versions
  // returned by Stripe even when SDK types don't expose it), then fall through to
  // PaymentIntent — which is the canonical path on the new API.
  const invoiceAny = invoice as unknown as { charge?: string | { id?: string } | null; payment_intent?: string | { id?: string } | null };
  const chargeId = typeof invoiceAny.charge === 'string' ? invoiceAny.charge : invoiceAny.charge?.id;
  if (chargeId) {
    try {
      const stripe = getStripe();
      const charge = await stripe.charges.retrieve(chargeId);
      const type = charge.payment_method_details?.type;
      if (type === 'us_bank_account' || type === 'ach_credit_transfer' || type === 'ach_debit') return 'ach';
      if (type === 'card') return 'card';
    } catch {
      // Fall through to PaymentIntent path
    }
  }

  // Fall back to the PaymentIntent if the charge isn't accessible
  const piId =
    typeof invoiceAny.payment_intent === 'string'
      ? invoiceAny.payment_intent
      : invoiceAny.payment_intent?.id;
  if (piId) {
    try {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(piId);
      const type = pi.payment_method_types?.[0];
      if (type === 'us_bank_account') return 'ach';
      if (type === 'card') return 'card';
    } catch {
      // Fall through
    }
  }

  // Default — most common case for credit card invoices
  return 'card';
}
