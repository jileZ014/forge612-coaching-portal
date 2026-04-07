import { NextRequest, NextResponse } from 'next/server';
import { squareClient } from '@/lib/square';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { newDueDate }: { newDueDate: string } = body;

    if (!newDueDate) {
      return NextResponse.json({ success: false, error: 'newDueDate is required (YYYY-MM-DD)' }, { status: 400 });
    }

    // Get location ID
    const locationsResult = await squareClient.locations.list();
    const locationId = locationsResult.locations?.[0]?.id;
    if (!locationId) {
      return NextResponse.json({ success: false, error: 'No Square location found' }, { status: 400 });
    }

    // List all invoices with pagination (same pattern as sync route)
    let allInvoices: Array<{
      id?: string;
      version?: number;
      status?: string;
      paymentRequests?: Array<{ uid?: string; dueDate?: string; requestType?: string; automaticPaymentSource?: string }>;
      title?: string;
      primaryRecipient?: { customerId?: string };
    }> = [];
    let cursor: string | undefined;

    do {
      const result = await squareClient.invoices.list({ locationId, cursor });
      if (result.data) {
        allInvoices = allInvoices.concat(result.data);
      }
      cursor = result.cursor || undefined;
    } while (cursor);

    // Filter to UNPAID invoices only
    const unpaidInvoices = allInvoices.filter(inv =>
      inv.status === 'UNPAID' || inv.status === 'SCHEDULED'
    );

    if (unpaidInvoices.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No unpaid invoices found' });
    }

    const results: Array<{ invoiceId: string; title?: string; status: string; oldDueDate: string | null; error?: string }> = [];

    for (const invoice of unpaidInvoices) {
      try {
        const invoiceId = invoice.id!;
        const version = invoice.version!;
        const oldDueDate = invoice.paymentRequests?.[0]?.dueDate || null;

        // Skip if already has the correct due date
        if (oldDueDate === newDueDate) {
          results.push({ invoiceId, title: invoice.title, status: 'skipped', oldDueDate });
          continue;
        }

        await squareClient.invoices.update({
          invoiceId,
          invoice: {
            version,
            paymentRequests: [
              {
                uid: invoice.paymentRequests?.[0]?.uid,
                requestType: 'BALANCE',
                dueDate: newDueDate,
                automaticPaymentSource: 'NONE',
              },
            ],
          },
          idempotencyKey: `update-duedate-${invoiceId}-${Date.now()}`,
        });

        results.push({ invoiceId, title: invoice.title, status: 'updated', oldDueDate });
      } catch (err) {
        results.push({
          invoiceId: invoice.id || 'unknown',
          title: invoice.title,
          status: 'failed',
          oldDueDate: invoice.paymentRequests?.[0]?.dueDate || null,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const updated = results.filter(r => r.status === 'updated').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return NextResponse.json({
      success: true,
      updated,
      failed,
      skipped,
      total: unpaidInvoices.length,
      newDueDate,
      results,
    });
  } catch (error) {
    console.error('Batch update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to batch update invoices';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
