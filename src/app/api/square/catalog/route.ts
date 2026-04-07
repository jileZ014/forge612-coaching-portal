import { NextResponse } from 'next/server';
import { squareClient } from '@/lib/square';

export async function GET() {
  try {
    const result = await squareClient.catalog.list({
      types: 'ITEM',
    });

    const items = (result.data || []).map(item => ({
      id: item.id,
      name: item.itemData?.name || '',
      variations: (item.itemData?.variations || []).map(v => ({
        id: v.id,
        name: v.itemVariationData?.name || '',
        priceMoney: {
          amount: Number(v.itemVariationData?.priceMoney?.amount || 0) / 100,
          currency: v.itemVariationData?.priceMoney?.currency || 'USD',
        },
      })),
    }));

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error('Square catalog error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch catalog' },
      { status: 500 }
    );
  }
}
