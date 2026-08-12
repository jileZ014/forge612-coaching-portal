import { NextRequest, NextResponse } from 'next/server';

import { getAdminDb } from '@/lib/firebase-admin';
import { requireCoach, isAuthError } from '@/lib/auth-helpers';

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if (isAuthError(auth)) return auth;

  try {
    const parentsRef = getAdminDb().collection('parents');
    const snapshot = await parentsRef.get();

    let updated = 0;
    let skipped = 0;
    const results: string[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const updates: Record<string, unknown> = {};

      // Add status if missing
      if (!data.status) {
        if (data.doNotInvoice) {
          updates.status = 'exempt';
        } else {
          updates.status = 'active';
        }
      }

      // Add rateType based on monthlyRate
      if (!data.rateType) {
        const rate = data.monthlyRate || 0;
        if (rate === 170) {
          updates.rateType = 'siblings';
        } else if (rate === 70) {
          updates.rateType = 'special';
        } else if (rate === 95) {
          updates.rateType = 'regular';
        } else {
          updates.rateType = 'custom';
          updates.customRate = rate;
        }
      }

      // Add lineItems if missing
      if (!data.lineItems) {
        updates.lineItems = [];
      }

      // Ensure payments map exists
      if (!data.payments) {
        updates.payments = {};
      }

      if (Object.keys(updates).length > 0) {
        const parentRef = getAdminDb().collection('parents').doc(docSnap.id);
        await parentRef.update(updates);
        updated++;
        results.push(`Updated ${data.firstName} ${data.lastName}: ${Object.keys(updates).join(', ')}`);
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      total: snapshot.docs.length,
      updated,
      skipped,
      results,
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { success: false, error: 'Migration failed' },
      { status: 500 }
    );
  }
}

// PUT: Assign teams based on roster data
// Maps by last name, plus explicit full-name overrides for ambiguous/swapped entries
const TEAM_ROSTER: Record<string, string[]> = {
  '9u/10u/11u': [
    'Gutierrez', 'Terrazas', 'Oakes', 'Bates', 'Valencia', 'Silverio',
    'Bautista', 'Angeles', 'Camou', 'Rodriguez', 'Worthen', 'Molina',
    'Marega', 'Campos', 'Smith', 'Salazar', 'Soto', 'Mesa', 'Alexis',
    'Patton', 'Patterson', 'Taylor', 'Landers', 'Johnson', 'Drexel', 'Castillo',
  ],
  '12u/13u': [
    'Lewis', 'Yvette', 'Bracey', 'Roman', 'Valdez', 'Grayson',
    'Moywaywa', 'Walterts', 'Bermudez',
  ],
  '14u': [
    'Perez', 'Wilson', 'Snow', 'Mendoza', 'Ramirez', 'Ernest',
    'Espitia', 'Bland', 'Castro', 'Thanh', 'Gibson', 'Rubalcaba',
    'Rico', 'Lopez', 'Laird',
  ],
};

// Full name overrides for entries where last name alone is ambiguous or stored differently
const FULL_NAME_OVERRIDES: Record<string, string> = {
  'bermudez marvin': '12u/13u',
  'walterts chase': '12u/13u',
  'lopez eli': '14u',
  'rubalcaba omar': '14u',
  'hector ': '12u/13u',
  'mason ': '9u/10u/11u',
  'tre ': '9u/10u/11u',
  'jose ': '14u',
  'doug ': '14u',
};

export async function PUT(req: NextRequest) {
  const auth = await requireCoach(req);
  if (isAuthError(auth)) return auth;

  try {
    const parentsRef = getAdminDb().collection('parents');
    const snapshot = await parentsRef.get();

    // Build lastName -> team lookup
    const lastNameToTeam = new Map<string, string>();
    for (const [team, lastNames] of Object.entries(TEAM_ROSTER)) {
      for (const ln of lastNames) {
        lastNameToTeam.set(ln.toLowerCase(), team);
      }
    }

    let updated = 0;
    let unmatched = 0;
    const results: string[] = [];
    const unmatchedNames: string[] = [];

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const fullName = `${(data.firstName || '').toLowerCase()} ${(data.lastName || '').toLowerCase()}`;
      const lastName = (data.lastName || '').toLowerCase();
      const team = FULL_NAME_OVERRIDES[fullName] || lastNameToTeam.get(lastName);

      if (team) {
        const parentRef = getAdminDb().collection('parents').doc(docSnap.id);
        await parentRef.update({ team });
        updated++;
        results.push(`${data.firstName} ${data.lastName} → ${team}`);
      } else {
        unmatched++;
        unmatchedNames.push(`${data.firstName} ${data.lastName}`);
      }
    }

    return NextResponse.json({
      success: true,
      total: snapshot.docs.length,
      updated,
      unmatched,
      results,
      unmatchedNames,
    });
  } catch (error) {
    console.error('Team assignment error:', error);
    return NextResponse.json(
      { success: false, error: 'Team assignment failed' },
      { status: 500 }
    );
  }
}
