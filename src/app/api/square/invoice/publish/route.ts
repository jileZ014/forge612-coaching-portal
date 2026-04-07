import { NextRequest, NextResponse } from 'next/server';
import { squareClient } from '@/lib/square';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invoiceId }: { invoiceId: string } = body;

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'invoiceId is required' }, { status: 400 });
    }

    // Get the current invoice to get its version
    const getResult = await squareClient.invoices.get({ invoiceId });
    const invoice = getResult.invoice;

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status !== 'DRAFT') {
      // Already published — just return the existing publicUrl
      return NextResponse.json({
        success: true,
        invoiceId: invoice.id,
        status: invoice.status,
        publicUrl: invoice.publicUrl || null,
      });
    }

    // Publish the draft invoice
    const publishResult = await squareClient.invoices.publish({
      invoiceId,
      version: invoice.version!,
      idempotencyKey: `publish-${invoiceId}-${Date.now()}`,
    });

    return NextResponse.json({
      success: true,
      invoiceId: publishResult.invoice?.id,
      status: publishResult.invoice?.status,
      publicUrl: publishResult.invoice?.publicUrl || null,
    });
  } catch (error) {
    console.error('Publish invoice error:', error);
    const message = error instanceof Error ? error.message : 'Failed to publish invoice';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
