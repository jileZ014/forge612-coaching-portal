import { NextRequest, NextResponse } from 'next/server';
import { squareClient } from '@/lib/square';

interface InvoiceLineItem {
  catalogItemVariationId?: string;
  description?: string;
  amount?: number;
  quantity?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      customerId,
      phone,
      lineItems,
      message,
      dueDate,
      playerName,
      billingMonth,
      parentFirstName,
      parentLastName,
    }: {
      customerId?: string;
      phone?: string;
      lineItems: InvoiceLineItem[];
      message: string;
      dueDate: string;
      playerName?: string;
      billingMonth?: string;
      parentFirstName?: string;
      parentLastName?: string;
    } = body;

    // Normalize phone to E.164 format (+1XXXXXXXXXX)
    const normalizePhone = (p: string): string => {
      const digits = p.replace(/\D/g, '');
      const tenDigit = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
      return `+1${tenDigit}`;
    };

    // Find or match customer by phone
    let finalCustomerId = customerId;

    if (!finalCustomerId && phone) {
      const e164Phone = normalizePhone(phone);
      const searchResult = await squareClient.customers.search({
        query: {
          filter: {
            phoneNumber: { exact: e164Phone },
          },
        },
      });

      if (searchResult.customers && searchResult.customers.length > 0) {
        finalCustomerId = searchResult.customers[0].id;
      }
    }

    // Auto-create Square customer if not found
    if (!finalCustomerId && phone) {
      const e164Phone = normalizePhone(phone);
      const createResult = await squareClient.customers.create({
        givenName: parentFirstName || playerName || 'Parent',
        familyName: parentLastName || '',
        phoneNumber: e164Phone,
        idempotencyKey: `customer-${e164Phone}-${Date.now()}`,
      });
      finalCustomerId = createResult.customer?.id;
    }

    if (!finalCustomerId) {
      return NextResponse.json({
        success: false,
        error: 'Could not find or create Square customer. Check phone number.',
      }, { status: 400 });
    }

    // Get location ID
    const locationsResult = await squareClient.locations.list();
    const locationId = locationsResult.locations?.[0]?.id;

    if (!locationId) {
      return NextResponse.json({
        success: false,
        error: 'No Square location found',
      }, { status: 400 });
    }

    // Build order line items — always use ad-hoc (catalog IDs may be stale)
    const orderLineItems = lineItems.map(item => {
      return {
        name: item.description || 'Monthly Fee',
        quantity: String(item.quantity || 1),
        basePriceMoney: {
          amount: BigInt(Math.round((item.amount || 0) * 100)),
          currency: 'USD',
        },
      };
    });

    // Create order first (required for invoice with line items)
    const orderResult = await squareClient.orders.create({
      order: {
        locationId,
        lineItems: orderLineItems,
      },
      idempotencyKey: `order-${finalCustomerId}-${Date.now()}`,
    });

    const orderId = orderResult.order?.id;

    if (!orderId) {
      return NextResponse.json({
        success: false,
        error: 'Failed to create order',
      }, { status: 500 });
    }

    // Step 1: Create invoice (SHARE_MANUALLY — SMS can't be set on create)
    const invoiceResult = await squareClient.invoices.create({
      invoice: {
        locationId,
        orderId,
        primaryRecipient: {
          customerId: finalCustomerId,
        },
        paymentRequests: [
          {
            requestType: 'BALANCE',
            dueDate: dueDate,
            automaticPaymentSource: 'NONE',
          },
        ],
        deliveryMethod: 'SHARE_MANUALLY',
        acceptedPaymentMethods: {
          card: true,
          squareGiftCard: false,
          bankAccount: false,
          buyNowPayLater: false,
          cashAppPay: false,
        },
        title: `AZ Flight Basketball - ${billingMonth || 'Monthly Fee'}`,
        description: message,
      },
      idempotencyKey: `invoice-${finalCustomerId}-${Date.now()}`,
    });

    const invoiceId = invoiceResult.invoice?.id;
    const invoiceVersion = invoiceResult.invoice?.version;

    if (!invoiceId) {
      return NextResponse.json({
        success: false,
        error: 'Failed to create invoice',
      }, { status: 500 });
    }

    // Return DRAFT invoice (do NOT publish — parents can't see drafts)
    // Publishing happens later when "Send All Texts" is clicked
    return NextResponse.json({
      success: true,
      invoiceId,
      version: invoiceVersion,
      status: 'DRAFT',
      publicUrl: null,
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    return NextResponse.json({
      success: false,
      error: message,
    }, { status: 500 });
  }
}
