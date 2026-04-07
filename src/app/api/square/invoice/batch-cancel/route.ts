import { NextRequest, NextResponse } from 'next/server';
import { squareClient } from '@/lib/square';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cancelAll, invoiceIds }: { cancelAll?: boolean; invoiceIds?: string[] } = body || {};

    // Single invoice deletion by ID (for removing from queue)
    if (invoiceIds && invoiceIds.length > 0) {
      const results: Array<{ invoiceId: string; action: string; error?: string }> = [];
      for (const invoiceId of invoiceIds) {
        try {
          const getResult = await squareClient.invoices.get({ invoiceId });
          const invoice = getResult.invoice;
          if (!invoice) { results.push({ invoiceId, action: 'not_found' }); continue; }
          if (invoice.status === 'DRAFT') {
            await squareClient.invoices.delete({ invoiceId, version: invoice.version! });
            results.push({ invoiceId, action: 'deleted' });
          } else if (invoice.status === 'UNPAID' || invoice.status === 'SCHEDULED') {
            await squareClient.invoices.cancel({ invoiceId, version: invoice.version! });
            results.push({ invoiceId, action: 'cancelled' });
          } else {
            results.push({ invoiceId, action: 'skipped' });
          }
        } catch (err) {
          results.push({ invoiceId, action: 'failed', error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }
      return NextResponse.json({ success: true, results });
    }

    // Get location ID
    const locationsResult = await squareClient.locations.list();
    const locationId = locationsResult.locations?.[0]?.id;
    if (!locationId) {
      return NextResponse.json({ success: false, error: 'No Square location found' }, { status: 400 });
    }

    // List all invoices with pagination
    let allInvoices: Array<{
      id?: string;
      version?: number;
      status?: string;
      title?: string;
      createdAt?: string;
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

    // Filter to cancellable/deletable invoices
    const actionable = allInvoices.filter(inv => {
      const actionableStatuses = ['UNPAID', 'SCHEDULED', 'DRAFT'];
      return actionableStatuses.includes(inv.status || '');
    });

    if (actionable.length === 0) {
      return NextResponse.json({ success: true, cancelled: 0, message: 'No cancellable invoices found' });
    }

    const results: Array<{ invoiceId: string; title?: string; originalStatus: string; action: string; error?: string }> = [];

    for (const invoice of actionable) {
      try {
        const invoiceId = invoice.id!;
        const version = invoice.version!;

        if (invoice.status === 'DRAFT') {
          // Drafts must be deleted, not cancelled
          await squareClient.invoices.delete({ invoiceId, version });
          results.push({ invoiceId, title: invoice.title, originalStatus: 'DRAFT', action: 'deleted' });
        } else {
          // UNPAID/SCHEDULED must be cancelled
          await squareClient.invoices.cancel({ invoiceId, version });
          results.push({ invoiceId, title: invoice.title, originalStatus: invoice.status || 'unknown', action: 'cancelled' });
        }
      } catch (err) {
        results.push({
          invoiceId: invoice.id || 'unknown',
          title: invoice.title,
          originalStatus: invoice.status || 'unknown',
          action: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const cancelled = results.filter(r => r.action === 'cancelled').length;
    const deleted = results.filter(r => r.action === 'deleted').length;
    const failed = results.filter(r => r.action === 'failed').length;

    return NextResponse.json({
      success: true,
      cancelled,
      deleted,
      failed,
      total: actionable.length,
      results,
    });
  } catch (error) {
    console.error('Batch cancel error:', error);
    const message = error instanceof Error ? error.message : 'Failed to batch cancel invoices';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
