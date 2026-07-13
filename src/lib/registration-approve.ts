// Client-side approval fan-out for a self-registration. Runs in the browser as the
// authenticated coach (Firestore rules gate the writes: parents is open, families/players
// require the coach). Mirrors the shapes written by the admin "Add Family" modal
// (parents) and the onboarding form (families/players) so the new family shows up
// identically on the billing dashboard AND the families/CRM dashboard.
import { collection, addDoc, doc, updateDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';
import { teamConfig } from './team-config';
import { addFamily, getFamilyByEmail, updateFamily } from './firestore-helpers';
import { RATE_CONFIG, type RateType, type Team } from './flight-types';
import type { Registration } from './registration-types';

const TEAM_ID = teamConfig.teamId;

// Roster team code (e.g. "13u-josiah") -> coarse billing bucket. 15u/16u have no bucket.
function mapBillingTeam(teamCode: string): Team | null {
  if (teamCode.startsWith('14u')) return '14u';
  if (teamCode.startsWith('13u') || teamCode.startsWith('12u')) return '12u/13u';
  if (teamCode.startsWith('11u') || teamCode.startsWith('10u') || teamCode.startsWith('9u'))
    return '9u/10u/11u';
  return null;
}

// The two months BEFORE the current month, seeded paid/null so the dashboard's 3-month
// getBalance shows no phantom back-months for a mid-season join. Current month is left
// owed (their first month's club fee, which the first invoice will cover).
function priorWindowMonthKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let i = 2; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

const num = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};

export interface ApproveResult {
  parentId: string;
  familyId: string;
  playerIds: string[];
  billingCreated: boolean;
  monthlyRate: number;
}

export async function approveRegistration(
  reg: Registration,
  opts: { rateType: RateType; monthlyRate?: number; reviewerEmail: string },
): Promise<ApproveResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const parentFullName = [reg.parentFirstName, reg.parentLastName].filter(Boolean).join(' ').trim();
  const email = (reg.parentEmail || '').toLowerCase();
  const playerNames = reg.players.map((p) => p.name).filter(Boolean);

  // 1) CRM family (dedup by primaryParentEmail)
  let familyId: string;
  let existingPlayerIds: string[] = [];
  const existingFam = email ? await getFamilyByEmail(email) : null;
  if (existingFam) {
    familyId = existingFam.id;
    existingPlayerIds = existingFam.playerIds ?? [];
    await updateFamily(familyId, {
      primaryParentName: parentFullName,
      primaryParentPhone: reg.parentPhone,
      source: 'self-registration',
      notes: reg.notes || existingFam.notes,
    });
  } else {
    const ref = await addFamily({
      primaryParentName: parentFullName,
      primaryParentEmail: email,
      primaryParentPhone: reg.parentPhone,
      secondaryParentName: reg.secondaryParentName || undefined,
      secondaryParentPhone: reg.secondaryParentPhone || undefined,
      secondaryParentEmail: reg.secondaryParentEmail || undefined,
      playerIds: [],
      lifecycleStage: 'registered',
      lifecycleStageChangedAt: nowIso,
      source: 'self-registration',
      notes: reg.notes || undefined,
      tags: ['self-registered'],
    });
    familyId = ref.id;
  }

  // 2) CRM players
  const playersCol = collection(db, 'teams', TEAM_ID, 'players');
  const newPlayerIds: string[] = [];
  for (const p of reg.players) {
    const by = num(p.birthYear);
    const gy = num(p.gradYear);
    const pref = await addDoc(playersCol, {
      name: p.name,
      parentName: parentFullName,
      parentEmail: email,
      parentPhone: reg.parentPhone,
      active: true,
      familyId,
      lifecycleStage: 'registered',
      lifecycleStageChangedAt: nowIso,
      ...(by != null ? { birthYear: by } : {}),
      ...(gy != null ? { graduationYear: gy } : {}),
      ...(p.school ? { school: p.school } : {}),
    });
    newPlayerIds.push(pref.id);
  }
  const finalPlayerIds = Array.from(new Set([...existingPlayerIds, ...newPlayerIds]));
  await updateFamily(familyId, { playerIds: finalPlayerIds });

  // 3) Billing parent (dedup by email)
  const rateType: RateType = opts.rateType || 'regular';
  const monthlyRate = opts.monthlyRate ?? RATE_CONFIG[rateType]?.amount ?? 95;
  const billingTeam = mapBillingTeam(reg.teamCode);

  let parentId: string;
  let billingCreated = false;
  const dupSnap = email
    ? await getDocs(query(collection(db, 'parents'), where('email', '==', email), limit(1)))
    : null;

  if (dupSnap && !dupSnap.empty) {
    parentId = dupSnap.docs[0].id;
    const cur = dupSnap.docs[0].data();
    const mergedNames = Array.from(new Set([...((cur.playerNames as string[]) ?? []), ...playerNames]));
    await updateDoc(doc(db, 'parents', parentId), {
      playerNames: mergedNames,
      familyId,
      registrationId: reg.id,
      updatedAt: new Date(),
    });
  } else {
    const payments: Record<string, { status: 'paid'; method: null; paidAt: null }> = {};
    for (const k of priorWindowMonthKeys(now)) payments[k] = { status: 'paid', method: null, paidAt: null };
    const ref = await addDoc(collection(db, 'parents'), {
      firstName: reg.parentFirstName,
      lastName: reg.parentLastName,
      email: email || null,
      phone: reg.parentPhone,
      players: [],
      playerNames,
      squareCustomerId: null,
      stripeCustomerId: null,
      notes: reg.notes || '',
      doNotInvoice: false,
      status: 'active',
      team: billingTeam,
      rateType,
      customRate: rateType === 'custom' ? monthlyRate : null,
      monthlyRate,
      currentBalance: 0,
      payments,
      lineItems: [],
      lastTexted: null,
      invoiceActivity: {},
      familyId,
      registrationId: reg.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    parentId = ref.id;
    billingCreated = true;
  }

  // 4) Close out the registration
  await updateDoc(doc(db, 'registrations', reg.id), {
    status: 'approved',
    approvedAt: nowIso,
    reviewedBy: opts.reviewerEmail,
    parentId,
    familyId,
  });

  return { parentId, familyId, playerIds: finalPlayerIds, billingCreated, monthlyRate };
}

export async function rejectRegistration(id: string, reviewerEmail: string): Promise<void> {
  await updateDoc(doc(db, 'registrations', id), {
    status: 'rejected',
    rejectedAt: new Date().toISOString(),
    reviewedBy: reviewerEmail,
  });
}
