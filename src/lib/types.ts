export type LifecycleStage =
  | 'lead'
  | 'tryout'
  | 'offered'
  | 'committed'
  | 'registered'
  | 'active'
  | 'lapsed'
  | 'alumni'
  | 'declined';

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  'lead',
  'tryout',
  'offered',
  'committed',
  'registered',
  'active',
  'lapsed',
  'alumni',
  'declined',
];

export interface Player {
  id: string;
  name: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  active: boolean;
  familyId?: string;
  lifecycleStage?: LifecycleStage;
  lifecycleStageChangedAt?: string;
  jerseyNumber?: number | null;
  position?: string | null;
  birthYear?: number | null;
  school?: string | null;
  graduationYear?: number | null;
  photoUrl?: string | null;
  medicalFormUrl?: string | null;
  waiverFormUrl?: string | null;
  notes?: string;
  tags?: string[];
}

export interface Family {
  id: string;
  primaryParentName: string;
  primaryParentEmail: string;
  primaryParentPhone: string;
  secondaryParentName?: string;
  secondaryParentEmail?: string;
  secondaryParentPhone?: string;
  playerIds: string[];
  lifecycleStage: LifecycleStage;
  lifecycleStageChangedAt: string;
  source?: string;
  notes?: string;
  tags?: string[];
  doNotContact?: boolean;
  stripeCustomerId?: string;
  createdAt: string;
  updatedAt: string;
}

export type FeeType = 'monthly' | 'tournament' | 'league' | 'equipment' | 'registration' | 'custom';

export interface Fee {
  id: string;
  title: string;
  type: FeeType;
  amount: number;
  dueDate: string;
  appliesTo: 'all' | string[];
  recurring: boolean;
  createdAt: string;
  notificationSent: boolean;
}

export type PaymentStatus = 'paid' | 'unpaid' | 'partial' | 'waived';

export interface Payment {
  id: string;
  playerId: string;
  feeId: string;
  amount: number;
  status: PaymentStatus;
  paidAmount: number;
  paidDate: string | null;
  stripeSessionId: string | null;
  manuallyMarked: boolean;
}

export type EventType = 'practice' | 'game' | 'tournament' | 'scrimmage';

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  type: EventType | string;
  cancelled: boolean;
}

export interface Team {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  coachEmail: string;
  coachName: string;
  stripeAccountId: string;
  smsEnabled: boolean;
  tagline: string;
}

export type CommChannel = 'sms' | 'email' | 'phone' | 'in_person' | 'system';
export type CommDirection = 'inbound' | 'outbound';

export interface Communication {
  id: string;
  familyId: string;
  playerId?: string;
  timestamp: string;
  channel: CommChannel;
  direction: CommDirection;
  summary: string;
  body?: string;
  twilioSid?: string;
  twilioStatus?: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  twilioErrorCode?: string | null;
  resendId?: string;
  stripeInvoiceId?: string;
  authorEmail?: string;
  createdAt: string;
}

export type DocumentType =
  | 'medical_form'
  | 'waiver'
  | 'birth_certificate'
  | 'school_id'
  | 'photo'
  | 'other';

export interface FamilyDocument {
  id: string;
  familyId: string;
  playerId?: string;
  type: DocumentType;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  contentType: string;
  sizeBytes: number;
  expiresAt?: string;
  uploadedBy: string;
  uploadedAt: string;
}
