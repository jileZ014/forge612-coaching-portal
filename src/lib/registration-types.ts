// Public self-registration — quarantine model.
// A parent-submitted registration lands in the top-level `registrations` collection
// with status 'pending'. It is written ONLY server-side via the Firebase Admin SDK
// (Firestore rules deny all client access), so spam/junk never touches billing.
// On coach approval it fans out to billing (`parents`) + CRM (`teams/*/families`,`players`).

export type RegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface RegistrationPlayer {
  name: string;
  birthYear: string; // kept as entered; parsed to int on approval
  gradYear: string;
  school: string;
}

export interface Registration {
  id: string;
  status: RegistrationStatus;

  // Parent / guardian
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string;
  secondaryParentName?: string;
  secondaryParentPhone?: string;

  // Players
  players: RegistrationPlayer[];

  // Context
  teamCode: string; // one of the 6 coached teams (see roster page TEAMS)
  teamLabel: string;
  notes?: string;
  source: string; // 'self-registration'

  // Lifecycle / audit
  createdAt: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  reviewedBy?: string | null;
  parentId?: string | null; // billing record id, set on approval
  familyId?: string | null; // CRM family id, set on approval
  userAgent?: string | null;
}
