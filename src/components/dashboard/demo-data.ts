import type { Player, Fee, Payment, ScheduleEvent } from '@/lib/types';

export const demoPlayers: Player[] = [
  { id: 'p1', name: 'Jaylen Carter', parentName: 'Monique Carter', parentEmail: 'monique.carter@gmail.com', parentPhone: '(206) 555-0134', position: 'Point Guard', jerseyNumber: '2', active: true },
  { id: 'p2', name: 'Kai Tanaka', parentName: 'Hiroshi Tanaka', parentEmail: 'h.tanaka@outlook.com', parentPhone: '(206) 555-0278', position: 'Shooting Guard', jerseyNumber: '11', active: true },
  { id: 'p3', name: 'Mateo Reyes', parentName: 'Sofia Reyes', parentEmail: 'sofia.reyes@yahoo.com', parentPhone: '(425) 555-0192', position: 'Small Forward', jerseyNumber: '7', active: true },
  { id: 'p4', name: 'Aiden Okafor', parentName: 'Chioma Okafor', parentEmail: 'c.okafor@gmail.com', parentPhone: '(253) 555-0345', position: 'Power Forward', jerseyNumber: '23', active: true },
  { id: 'p5', name: 'Liam Nguyen', parentName: 'Tran Nguyen', parentEmail: 'tran.nguyen@mail.com', parentPhone: '(206) 555-0456', position: 'Center', jerseyNumber: '34', active: true },
  { id: 'p6', name: 'Miles Washington', parentName: 'Derek Washington', parentEmail: 'd.washington@gmail.com', parentPhone: '(425) 555-0567', position: 'Point Guard', jerseyNumber: '5', active: true },
  { id: 'p7', name: 'Ezra Kim', parentName: 'Jiyeon Kim', parentEmail: 'jiyeon.kim@outlook.com', parentPhone: '(206) 555-0678', position: 'Shooting Guard', jerseyNumber: '14', active: true },
  { id: 'p8', name: 'Darius Mitchell', parentName: 'Tamara Mitchell', parentEmail: 't.mitchell@yahoo.com', parentPhone: '(253) 555-0789', position: 'Small Forward', jerseyNumber: '21', active: true },
  { id: 'p9', name: 'Noah Bergstrom', parentName: 'Erik Bergstrom', parentEmail: 'erik.b@gmail.com', parentPhone: '(206) 555-0891', position: 'Power Forward', jerseyNumber: '44', active: true },
  { id: 'p10', name: 'Zion Torres', parentName: 'Maria Torres', parentEmail: 'maria.torres@mail.com', parentPhone: '(425) 555-0912', position: 'Center', jerseyNumber: '50', active: true },
];

export const demoFees: Fee[] = [
  { id: 'f1', title: 'Spring Registration', type: 'registration', amount: 175, dueDate: '2026-03-01', appliesTo: 'all', recurring: false, createdAt: '2026-02-10', notificationSent: true },
  { id: 'f2', title: 'April Monthly Dues', type: 'monthly', amount: 85, dueDate: '2026-04-01', appliesTo: 'all', recurring: true, createdAt: '2026-03-25', notificationSent: true },
  { id: 'f3', title: 'Seattle Spring Classic', type: 'tournament', amount: 55, dueDate: '2026-04-18', appliesTo: 'all', recurring: false, createdAt: '2026-04-01', notificationSent: false },
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
  { id: 'pay-m-p9', playerId: 'p9', feeId: 'f2', amount: 85, status: 'waived', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: true },
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
  { id: 's1', title: 'Practice', date: '2026-04-07', startTime: '18:00', endTime: '19:30', location: 'Rainier Beach Community Center', notes: 'Ball handling and shooting drills', type: 'practice', cancelled: false },
  { id: 's2', title: 'Practice', date: '2026-04-09', startTime: '18:00', endTime: '19:30', location: 'Rainier Beach Community Center', notes: '', type: 'practice', cancelled: false },
  { id: 's3', title: 'Game vs Tacoma Thunder', date: '2026-04-12', startTime: '10:00', endTime: '11:30', location: 'Seattle Pacific University Gym', notes: 'Home game. Green jerseys.', type: 'game', cancelled: false },
  { id: 's4', title: 'Practice', date: '2026-04-14', startTime: '18:00', endTime: '19:30', location: 'Rainier Beach Community Center', notes: 'Film review + defensive sets', type: 'practice', cancelled: false },
  { id: 's5', title: 'Game vs Bellevue Ballers', date: '2026-04-16', startTime: '19:00', endTime: '20:30', location: 'Bellevue College Gym', notes: 'Away game. White jerseys.', type: 'game', cancelled: false },
  { id: 's6', title: 'Seattle Spring Classic', date: '2026-04-19', startTime: '08:00', endTime: '18:00', location: 'Showare Center, Kent', notes: 'Pool play at 8AM. Bracket play at 1PM. Pack lunches.', type: 'tournament', cancelled: false },
  { id: 's7', title: 'Practice', date: '2026-04-21', startTime: '18:00', endTime: '19:30', location: 'Rainier Beach Community Center', notes: 'Tournament debrief', type: 'practice', cancelled: false },
];
