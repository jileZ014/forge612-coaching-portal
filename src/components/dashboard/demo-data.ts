import type { Player, Fee, Payment, ScheduleEvent } from '@/lib/types';

export const demoPlayers: Player[] = [
  { id: 'p1', name: 'Marcus Thompson', parentName: 'Keisha Thompson', parentEmail: 'keisha.t@gmail.com', parentPhone: '(480) 555-0134', position: 'Point Guard', jerseyNumber: '2', active: true },
  { id: 'p2', name: 'Jayden Rivera', parentName: 'Carlos Rivera', parentEmail: 'c.rivera@outlook.com', parentPhone: '(602) 555-0278', position: 'Shooting Guard', jerseyNumber: '11', active: true },
  { id: 'p3', name: 'Aiden Patel', parentName: 'Priya Patel', parentEmail: 'priya.patel@yahoo.com', parentPhone: '(480) 555-0192', position: 'Small Forward', jerseyNumber: '7', active: true },
  { id: 'p4', name: 'DeShawn Williams', parentName: 'Tanya Williams', parentEmail: 't.williams@gmail.com', parentPhone: '(623) 555-0345', position: 'Power Forward', jerseyNumber: '23', active: true },
  { id: 'p5', name: 'Elijah Brooks', parentName: 'Marcus Brooks', parentEmail: 'marcus.b@mail.com', parentPhone: '(480) 555-0456', position: 'Center', jerseyNumber: '34', active: true },
  { id: 'p6', name: 'Isaiah Morales', parentName: 'Sandra Morales', parentEmail: 's.morales@gmail.com', parentPhone: '(602) 555-0567', position: 'Point Guard', jerseyNumber: '5', active: true },
  { id: 'p7', name: 'Cameron Lee', parentName: 'David Lee', parentEmail: 'david.lee@outlook.com', parentPhone: '(480) 555-0678', position: 'Shooting Guard', jerseyNumber: '14', active: true },
  { id: 'p8', name: 'Trevon Harris', parentName: 'Monica Harris', parentEmail: 'm.harris@yahoo.com', parentPhone: '(623) 555-0789', position: 'Small Forward', jerseyNumber: '21', active: true },
  { id: 'p9', name: 'Noah Gutierrez', parentName: 'Miguel Gutierrez', parentEmail: 'miguel.g@gmail.com', parentPhone: '(602) 555-0891', position: 'Power Forward', jerseyNumber: '44', active: true },
  { id: 'p10', name: 'Khalil Jackson', parentName: 'Lisa Jackson', parentEmail: 'lisa.jackson@mail.com', parentPhone: '(480) 555-0912', position: 'Center', jerseyNumber: '50', active: true },
];

export const demoFees: Fee[] = [
  { id: 'f1', title: 'Spring Registration', type: 'registration', amount: 175, dueDate: '2026-03-01', appliesTo: 'all', recurring: false, createdAt: '2026-02-10', notificationSent: true },
  { id: 'f2', title: 'April Monthly Dues', type: 'monthly', amount: 85, dueDate: '2026-04-01', appliesTo: 'all', recurring: true, createdAt: '2026-03-25', notificationSent: true },
  { id: 'f3', title: 'PHX Desert Classic', type: 'tournament', amount: 55, dueDate: '2026-04-18', appliesTo: 'all', recurring: false, createdAt: '2026-04-01', notificationSent: false },
  { id: 'f4', title: 'Warm-Up Jerseys', type: 'equipment', amount: 45, dueDate: '2026-03-20', appliesTo: ['p1', 'p2', 'p3', 'p4', 'p5'], recurring: false, createdAt: '2026-03-05', notificationSent: true },
];

export const demoPayments: Payment[] = [
  // Registration - all paid
  ...demoPlayers.map((p, i) => ({ id: `pay-r-${p.id}`, playerId: p.id, feeId: 'f1', amount: 175, status: 'paid' as const, paidAmount: 175, paidDate: `2026-03-0${Math.min(i + 1, 9)}`, stripeSessionId: `cs_${p.id}_f1`, manuallyMarked: i > 7 })),
  // April Monthly - mixed statuses
  { id: 'pay-m-p1', playerId: 'p1', feeId: 'f2', amount: 85, status: 'paid', paidAmount: 85, paidDate: '2026-04-01', stripeSessionId: 'cs_p1_f2', manuallyMarked: false },
  { id: 'pay-m-p2', playerId: 'p2', feeId: 'f2', amount: 85, status: 'paid', paidAmount: 85, paidDate: '2026-04-02', stripeSessionId: 'cs_p2_f2', manuallyMarked: false },
  { id: 'pay-m-p3', playerId: 'p3', feeId: 'f2', amount: 85, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p4', playerId: 'p4', feeId: 'f2', amount: 85, status: 'paid', paidAmount: 85, paidDate: '2026-04-03', stripeSessionId: 'cs_p4_f2', manuallyMarked: false },
  { id: 'pay-m-p5', playerId: 'p5', feeId: 'f2', amount: 85, status: 'partial', paidAmount: 50, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p6', playerId: 'p6', feeId: 'f2', amount: 85, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p7', playerId: 'p7', feeId: 'f2', amount: 85, status: 'paid', paidAmount: 85, paidDate: '2026-04-01', stripeSessionId: 'cs_p7_f2', manuallyMarked: false },
  { id: 'pay-m-p8', playerId: 'p8', feeId: 'f2', amount: 85, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p9', playerId: 'p9', feeId: 'f2', amount: 85, status: 'waived', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p10', playerId: 'p10', feeId: 'f2', amount: 85, status: 'paid', paidAmount: 85, paidDate: '2026-04-04', stripeSessionId: 'cs_p10_f2', manuallyMarked: false },
  // Tournament - mostly unpaid (upcoming)
  ...demoPlayers.map((p, i) => ({ id: `pay-t-${p.id}`, playerId: p.id, feeId: 'f3', amount: 55, status: (i < 3 ? 'paid' : 'unpaid') as Payment['status'], paidAmount: i < 3 ? 55 : 0, paidDate: i < 3 ? '2026-04-05' : null, stripeSessionId: i < 3 ? `cs_${p.id}_f3` : null, manuallyMarked: false })),
  // Equipment - mixed
  { id: 'pay-e-p1', playerId: 'p1', feeId: 'f4', amount: 45, status: 'paid', paidAmount: 45, paidDate: '2026-03-12', stripeSessionId: 'cs_p1_f4', manuallyMarked: false },
  { id: 'pay-e-p2', playerId: 'p2', feeId: 'f4', amount: 45, status: 'paid', paidAmount: 45, paidDate: '2026-03-14', stripeSessionId: 'cs_p2_f4', manuallyMarked: false },
  { id: 'pay-e-p3', playerId: 'p3', feeId: 'f4', amount: 45, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-e-p4', playerId: 'p4', feeId: 'f4', amount: 45, status: 'paid', paidAmount: 45, paidDate: '2026-03-15', stripeSessionId: 'cs_p4_f4', manuallyMarked: false },
  { id: 'pay-e-p5', playerId: 'p5', feeId: 'f4', amount: 45, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
];

export const demoSchedule: ScheduleEvent[] = [
  { id: 's1', title: 'Practice', date: '2026-04-07', startTime: '18:00', endTime: '19:30', location: 'Scottsdale Boys & Girls Club', notes: 'Ball handling and shooting drills', type: 'practice', cancelled: false },
  { id: 's2', title: 'Practice', date: '2026-04-09', startTime: '18:00', endTime: '19:30', location: 'Scottsdale Boys & Girls Club', notes: '', type: 'practice', cancelled: false },
  { id: 's3', title: 'Game vs AZ Monstarz', date: '2026-04-12', startTime: '10:00', endTime: '11:30', location: 'Arizona Sports Complex, Mesa', notes: 'Home game. Navy jerseys.', type: 'game', cancelled: false },
  { id: 's4', title: 'Practice', date: '2026-04-14', startTime: '18:00', endTime: '19:30', location: 'Scottsdale Boys & Girls Club', notes: 'Film review + defensive sets', type: 'practice', cancelled: false },
  { id: 's5', title: 'Game vs West Valley Warriors', date: '2026-04-16', startTime: '19:00', endTime: '20:30', location: 'Peoria Community Center', notes: 'Away game. White jerseys.', type: 'game', cancelled: false },
  { id: 's6', title: 'PHX Desert Classic', date: '2026-04-19', startTime: '08:00', endTime: '18:00', location: 'Arizona Sports Complex, Mesa', notes: 'Pool play at 8AM. Bracket play at 1PM. Pack lunches.', type: 'tournament', cancelled: false },
  { id: 's7', title: 'Practice', date: '2026-04-21', startTime: '18:00', endTime: '19:30', location: 'Scottsdale Boys & Girls Club', notes: 'Tournament debrief', type: 'practice', cancelled: false },
];
