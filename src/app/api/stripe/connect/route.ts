export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireCoach, isAuthError } from '@/lib/auth-helpers';
import { getStripe } from '@/lib/stripe';
import { teamConfig } from '@/lib/team-config';

const TEAM_ID = teamConfig.teamId;

// Stripe Connect (Express) onboarding for THIS tenant's club.
//
// Ported from the Genesis Elite lineage (genesis-elite + the old yoties-flag-football
// build) into the canonical CRM, and made tenant-aware. Why Connect rather than a
// per-club API key: dues land in the CLUB's own Stripe account, the club self-onboards
// through Stripe-hosted KYC, and Forge612 never handles their credentials. This is the
// fix for the "no Stripe isolation" finding in the 2026-08-11 audit.
//
// The connected account id is written to teams/{teamId}.stripeAccountId at RUNTIME
// (team-config.json is build-time, so it cannot hold this).
//
// POST { action: 'create' | 'onboarding-link' | 'status' }

type TeamDoc = { stripeAccountId?: string };

async function readAccountId(): Promise<string> {
  const snap = await getAdminDb().collection('teams').doc(TEAM_ID).get();
  return ((snap.data() as TeamDoc | undefined)?.stripeAccountId ?? '').trim();
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (teamConfig.domain ? `https://${teamConfig.domain}` : 'http://localhost:3000')
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if (isAuthError(auth)) return auth;

  let action: string;
  try {
    ({ action } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // getStripe() throws when STRIPE_SECRET_KEY is unset. Keep it inside the try so
  // the caller gets JSON instead of Next's HTML 500 page (which made the dashboard
  // fail with "Unexpected end of JSON input").
  let stripe: ReturnType<typeof getStripe>;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json(
      {
        error: 'Payments are not configured for this club yet.',
        detail: 'STRIPE_SECRET_KEY is not set on this deployment.',
        notConfigured: true,
      },
      { status: 503 },
    );
  }

  const teamRef = getAdminDb().collection('teams').doc(TEAM_ID);

  try {
    if (action === 'status') {
      const accountId = await readAccountId();
      if (!accountId) return NextResponse.json({ connected: false });
      const acct = await stripe.accounts.retrieve(accountId);
      return NextResponse.json({
        connected: true,
        accountId,
        chargesEnabled: acct.charges_enabled,
        payoutsEnabled: acct.payouts_enabled,
        // Stripe keeps the account in "restricted" until KYC is finished.
        detailsSubmitted: acct.details_submitted,
      });
    }

    if (action === 'create') {
      // Reuse an existing account rather than orphaning one on a second click.
      let accountId = await readAccountId();

      if (!accountId) {
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          email: teamConfig.coachEmail || undefined,
          business_type: 'non_profit',
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_profile: {
            name: teamConfig.teamName,
            url: teamConfig.domain ? `https://${teamConfig.domain}` : undefined,
            mcc: '7941', // Commercial sports, athletic fields, sports clubs
          },
          settings: {
            payments: {
              // Max 22 chars, alphanumeric — what parents see on their statement.
              statement_descriptor: teamConfig.teamName.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 22),
            },
          },
          metadata: { teamId: TEAM_ID },
        });
        accountId = account.id;
        await teamRef.set({ stripeAccountId: accountId }, { merge: true });
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl()}/dashboard?stripe=refresh`,
        return_url: `${baseUrl()}/dashboard?stripe=complete`,
        type: 'account_onboarding',
      });
      return NextResponse.json({ url: link.url, accountId });
    }

    if (action === 'onboarding-link') {
      const accountId = await readAccountId();
      if (!accountId) {
        return NextResponse.json({ error: 'No Stripe account yet — use create first' }, { status: 400 });
      }
      try {
        const link = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: `${baseUrl()}/dashboard?stripe=refresh`,
          return_url: `${baseUrl()}/dashboard?stripe=complete`,
          type: 'account_onboarding',
        });
        return NextResponse.json({ url: link.url });
      } catch {
        // The stored account was deleted or rejected on Stripe's side. Clear it so
        // the coach can start over instead of hitting the same error forever.
        await teamRef.set({ stripeAccountId: '' }, { merge: true });
        return NextResponse.json(
          { error: 'That Stripe account is no longer valid. Please connect again.', retry: true },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe.connect]', message);
    return NextResponse.json({ error: 'Stripe Connect request failed', detail: message }, { status: 500 });
  }
}
