import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { ensureStripeCustomer } from '@/lib/stripe';
import type { Parent } from '@/types';

// POST body:
//   { parentId: string }                    — sync ONE parent
//   { all: true }                           — sync ALL parents (only those without stripeCustomerId)
//   { all: true, force: true }              — sync ALL parents, refresh existing customers too
//
// Returns per-parent result. Failures are reported per item, do not abort the batch.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { parentId, all, force } = body as { parentId?: string; all?: boolean; force?: boolean };

  if (!parentId && !all) {
    return NextResponse.json({ error: 'Provide either parentId or all:true' }, { status: 400 });
  }

  const parents: Parent[] = [];
  if (parentId) {
    const snap = await getDoc(doc(db, 'parents', parentId));
    if (!snap.exists()) return NextResponse.json({ error: 'parent not found' }, { status: 404 });
    parents.push({ id: snap.id, ...(snap.data() as Omit<Parent, 'id'>) });
  } else {
    const snap = await getDocs(collection(db, 'parents'));
    snap.forEach((d) => {
      const p = { id: d.id, ...(d.data() as Omit<Parent, 'id'>) };
      if (force || !p.stripeCustomerId) parents.push(p);
    });
  }

  const results: Array<{
    parentId: string;
    name: string;
    ok: boolean;
    stripeCustomerId?: string;
    error?: string;
  }> = [];

  for (const parent of parents) {
    try {
      const customer = await ensureStripeCustomer(parent);
      if (parent.stripeCustomerId !== customer.id) {
        await updateDoc(doc(db, 'parents', parent.id), {
          stripeCustomerId: customer.id,
          updatedAt: new Date().toISOString(),
        });
      }
      results.push({
        parentId: parent.id,
        name: `${parent.firstName} ${parent.lastName}`.trim(),
        ok: true,
        stripeCustomerId: customer.id,
      });
    } catch (err) {
      results.push({
        parentId: parent.id,
        name: `${parent.firstName} ${parent.lastName}`.trim(),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;

  return NextResponse.json({
    total: results.length,
    ok: okCount,
    failed: failCount,
    results,
  });
}
