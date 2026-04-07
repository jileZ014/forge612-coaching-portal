import { NextResponse } from 'next/server';
import { squareClient } from '@/lib/square';

export async function GET() {
  try {
    // Get location ID
    const locationsResult = await squareClient.locations.list();
    const locationId = locationsResult.locations?.[0]?.id;
    if (!locationId) {
      return NextResponse.json({ success: false, error: 'No Square location found' }, { status: 400 });
    }

    // List all invoices with pagination
    let allInvoices: Array<{
      id?: string;
      status?: string;
      title?: string;
      publicUrl?: string;
      primaryRecipient?: {
        customerId?: string;
        phoneNumber?: string;
        givenName?: string;
        familyName?: string;
      };
      paymentRequests?: Array<{
        computedAmountMoney?: { amount?: bigint; currency?: string };
        totalCompletedAmountMoney?: { amount?: bigint; currency?: string };
      }>;
    }> = [];
    let cursor: string | undefined;

    do {
      const result = await squareClient.invoices.list({ locationId, cursor });
      if (result.data) {
        allInvoices = allInvoices.concat(result.data);
      }
      cursor = result.cursor || undefined;
    } while (cursor);

    // Filter to UNPAID only
    const unpaid = allInvoices.filter(inv => inv.status === 'UNPAID');

    // Build response with customer details
    const invoices = await Promise.all(
      unpaid.map(async (inv) => {
        let phone = inv.primaryRecipient?.phoneNumber || '';
        let name = '';
        const givenName = inv.primaryRecipient?.givenName || '';
        const familyName = inv.primaryRecipient?.familyName || '';

        // If we have a customerId but no phone, look up the customer
        if (!phone && inv.primaryRecipient?.customerId) {
          try {
            const customerResult = await squareClient.customers.get({
              customerId: inv.primaryRecipient.customerId,
            });
            const customer = customerResult.customer;
            phone = customer?.phoneNumber || '';
            if (!givenName && !familyName) {
              name = `${customer?.givenName || ''} ${customer?.familyName || ''}`.trim();
            }
          } catch {
            // Customer lookup failed, continue without phone
          }
        }

        if (!name) {
          name = `${givenName} ${familyName}`.trim();
        }

        // Get amount from first payment request
        const paymentRequest = inv.paymentRequests?.[0];
        const amountBigInt = paymentRequest?.computedAmountMoney?.amount ?? BigInt(0);
        // Square amounts are in cents — convert to dollars
        const amount = Number(amountBigInt) / 100;

        return {
          invoiceId: inv.id || '',
          publicUrl: inv.publicUrl || '',
          phone: phone.replace(/\D/g, ''), // normalize to digits only
          name,
          amount,
          title: inv.title || '',
        };
      })
    );

    // Filter out any without a phone (can't text them)
    const withPhone = invoices.filter(inv => inv.phone.length >= 10);

    return NextResponse.json({
      success: true,
      invoices: withPhone,
      total: withPhone.length,
      skippedNoPhone: invoices.length - withPhone.length,
    });
  } catch (error) {
    console.error('List published invoices error:', error);
    const message = error instanceof Error ? error.message : 'Failed to list published invoices';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
