import { NextRequest, NextResponse } from 'next/server';
import { squareClient } from '@/lib/square';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^1/, '');
}

// Parse month keys from invoice line item descriptions (e.g., "Monthly Fee - Mar 2026" → "2026-03")
function parseMonthsFromOrder(lineItems: Array<{ name?: string }>): string[] {
  const months: string[] = [];
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  for (const item of lineItems) {
    if (!item.name) continue;
    // Match patterns like "Monthly Fee - Mar 2026" or "Monthly Fee - March 2026"
    const match = item.name.match(/(\w{3,})\s+(\d{4})/);
    if (match) {
      const monthStr = match[1].toLowerCase().slice(0, 3);
      const year = match[2];
      if (monthMap[monthStr]) {
        months.push(`${year}-${monthMap[monthStr]}`);
      }
    }
  }
  return months;
}

export async function POST(request: NextRequest) {
  try {
    // Get location
    const locationsResult = await squareClient.locations.list();
    const locationId = locationsResult.locations?.[0]?.id;

    if (!locationId) {
      return NextResponse.json({
        success: false,
        error: 'No Square location found',
      }, { status: 400 });
    }

    // Fetch all invoices from Square (with pagination)
    let allInvoices: Array<{
      id?: string;
      status?: string;
      orderId?: string;
      primaryRecipient?: { customerId?: string };
      paymentRequests?: Array<{ computedAmountMoney?: { amount?: bigint } }>;
      createdAt?: string;
      updatedAt?: string;
    }> = [];
    let cursor: string | undefined;

    do {
      const result = await squareClient.invoices.list({
        locationId,
        cursor,
      });
      if (result.data) {
        allInvoices = allInvoices.concat(result.data as any);
      }
      cursor = (result as any).cursor || undefined;
    } while (cursor);

    // Categorize invoices
    const paidInvoices = allInvoices.filter(inv => inv.status === 'PAID');
    const unpaidInvoices = allInvoices.filter(inv => inv.status === 'UNPAID');
    const cancelledInvoices = allInvoices.filter(inv => inv.status === 'CANCELED');

    // Load all parents from Firestore
    const parentsRef = collection(db, 'parents');
    const snapshot = await getDocs(parentsRef);

    // Build phone-to-parent lookup
    const phoneToParent = new Map<string, { id: string; data: Record<string, unknown> }>();
    const customerIdToParent = new Map<string, { id: string; data: Record<string, unknown> }>();

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.phone) {
        phoneToParent.set(normalizePhone(data.phone), { id: docSnap.id, data });
      }
      if (data.squareCustomerId) {
        customerIdToParent.set(data.squareCustomerId, { id: docSnap.id, data });
      }
    });

    // Helper to find parent for an invoice
    const findParent = async (customerId?: string) => {
      let parent = customerId ? customerIdToParent.get(customerId) : undefined;
      if (!parent && customerId) {
        try {
          const customer = await squareClient.customers.get({ customerId });
          const phone = customer.customer?.phoneNumber;
          if (phone) {
            parent = phoneToParent.get(normalizePhone(phone));
          }
        } catch { /* skip */ }
      }
      return parent;
    };

    // Match paid invoices to parents and mark months paid
    let matched = 0;
    let monthsMarked = 0;
    let unmatched = 0;
    const matchedFamilies: string[] = [];
    const unmatchedInvoices: string[] = [];

    for (const invoice of paidInvoices) {
      const parent = await findParent(invoice.primaryRecipient?.customerId);

      if (parent) {
        // Try to get order line items to determine which months are covered
        let months: string[] = [];
        if (invoice.orderId) {
          try {
            const orderResult = await squareClient.orders.get({ orderId: invoice.orderId });
            const lineItems = orderResult.order?.lineItems || [];
            months = parseMonthsFromOrder(lineItems as any);
          } catch { /* fall back to createdAt */ }
        }

        // Fallback: use invoice creation date if we couldn't parse months
        if (months.length === 0) {
          const createdAt = invoice.createdAt || invoice.updatedAt;
          if (createdAt) {
            const date = new Date(createdAt);
            months = [`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`];
          }
        }

        // Mark all covered months as paid
        const updates: Record<string, unknown> = {};
        for (const month of months) {
          updates[`payments.${month}`] = {
            status: 'paid',
            method: 'square',
            paidAt: new Date().toISOString(),
          };
          monthsMarked++;
        }

        if (Object.keys(updates).length > 0) {
          const parentRef = doc(db, 'parents', parent.id);
          await updateDoc(parentRef, updates);
        }

        matched++;
        matchedFamilies.push(`${parent.data.firstName} ${parent.data.lastName} (${months.join(', ')})`);
      } else {
        unmatched++;
        unmatchedInvoices.push(invoice.id || 'unknown');
      }
    }

    // Calculate total amounts
    const unpaidTotal = unpaidInvoices.reduce((sum, inv) => {
      const amt = inv.paymentRequests?.[0]?.computedAmountMoney?.amount;
      return sum + (amt ? Number(amt) / 100 : 0);
    }, 0);

    const paidTotal = paidInvoices.reduce((sum, inv) => {
      const amt = inv.paymentRequests?.[0]?.computedAmountMoney?.amount;
      return sum + (amt ? Number(amt) / 100 : 0);
    }, 0);

    return NextResponse.json({
      success: true,
      summary: {
        totalInvoices: allInvoices.length,
        paidCount: paidInvoices.length,
        unpaidCount: unpaidInvoices.length,
        cancelledCount: cancelledInvoices.length,
        paidTotal,
        unpaidTotal,
        matched,
        monthsMarked,
        unmatched,
      },
      matchedFamilies,
      unmatchedInvoices,
    });
  } catch (error) {
    console.error('Square sync error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to sync with Square',
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await squareClient.customers.list();
    const customers = result.data || [];

    return NextResponse.json({
      success: true,
      customers: customers.map(c => ({
        id: c.id,
        name: `${c.givenName || ''} ${c.familyName || ''}`.trim(),
        email: c.emailAddress,
        phone: c.phoneNumber,
      })),
    });
  } catch (error) {
    console.error('Square customers error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch customers',
    }, { status: 500 });
  }
}
