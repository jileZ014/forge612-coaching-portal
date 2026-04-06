export interface Player {
  id: string;
  name: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  position?: string;
  jerseyNumber?: string;
  active: boolean;
}

export interface Fee {
  id: string;
  title: string;
  type: 'monthly' | 'tournament' | 'league' | 'equipment' | 'registration' | 'custom';
  amount: number;
  dueDate: string;
  appliesTo: 'all' | string[];
  recurring: boolean;
  createdAt: string;
  notificationSent: boolean;
}

export interface Payment {
  id: string;
  playerId: string;
  feeId: string;
  amount: number;
  status: 'paid' | 'unpaid' | 'partial' | 'waived';
  paidAmount: number;
  paidDate: string | null;
  stripeSessionId: string | null;
  manuallyMarked: boolean;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
  type: string;
  cancelled: boolean;
}
