export interface Player {
  id: string;
  name: string;
  team: string;
  isCoach: boolean;
  parentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ParentStatus = 'active' | 'on_break' | 'exempt' | 'inactive';
export type RateType = 'regular' | 'siblings' | 'special' | 'custom';
export type PaymentMethod = 'square' | 'zelle' | 'cash' | 'check';
export type Team = '9u/10u/11u' | '12u/13u' | '14u';
export const TEAMS: Team[] = ['9u/10u/11u', '12u/13u', '14u'];

export interface Parent {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  players: string[];
  playerNames: string[];
  squareCustomerId: string | null;
  notes: string;
  doNotInvoice: boolean;
  status: ParentStatus;
  team: Team | null;
  rateType: RateType;
  customRate: number | null;
  monthlyRate: number;
  currentBalance: number;
  payments: Record<string, MonthlyPayment>;
  lineItems: LineItem[];
  lastTexted: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonthlyPayment {
  status: 'paid' | 'unpaid';
  method: PaymentMethod | null;
  paidAt: string | null;
}

export interface LineItem {
  id: string;
  description: string;
  amount: number;
  squareCatalogItemId: string | null;
  squareCatalogVariationId: string | null;
  status: 'unpaid' | 'paid' | 'invoiced';
  method: PaymentMethod | null;
  paidAt: string | null;
  addedAt: string;
}

export interface Invoice {
  id: string;
  parentId: string;
  month: string;
  amount: number;
  status: 'pending' | 'sent' | 'paid' | 'partial';
  paymentMethod: PaymentMethod | null;
  squareInvoiceId: string | null;
  description: string;
  paidAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRecord {
  id: string;
  parentId: string;
  invoiceId: string | null;
  amount: number;
  method: PaymentMethod;
  receivedAt: Date;
  notes: string;
  createdAt: Date;
}

export interface MonthlyStatus {
  month: string;
  amountDue: number;
  amountPaid: number;
  status: 'paid' | 'partial' | 'unpaid';
}

export interface CatalogItem {
  id: string;
  name: string;
  variations: CatalogVariation[];
}

export interface CatalogVariation {
  id: string;
  name: string;
  priceMoney: { amount: number; currency: string };
}

// Pricing constants
export const PRICING = {
  SINGLE_PLAYER: 95,
  SIBLINGS: 170,
  SPECIAL: 70,
};

// Square catalog variation IDs
export const SQUARE_CATALOG = {
  REGULAR: 'VC6N5LJH7PBZRPQNA7WPIKBM',
  SIBLINGS: 'HKTRJ3VNL4S3USK7QVT5IZ7S',
  SPECIAL: 'KSAAGY53TB4T3I44QCWIIEAP',
};

export const RATE_CONFIG: Record<RateType, { label: string; amount: number | null; catalogVariationId: string | null }> = {
  regular: { label: 'Regular ($95)', amount: 95, catalogVariationId: SQUARE_CATALOG.REGULAR },
  siblings: { label: 'Siblings ($170)', amount: 170, catalogVariationId: SQUARE_CATALOG.SIBLINGS },
  special: { label: 'Special ($70)', amount: 70, catalogVariationId: SQUARE_CATALOG.SPECIAL },
  custom: { label: 'Custom', amount: null, catalogVariationId: null },
};
