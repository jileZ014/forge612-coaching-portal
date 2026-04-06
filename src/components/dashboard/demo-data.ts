import type { Player, Fee, Payment, ScheduleEvent } from '@/lib/types';

export const demoPlayers: Player[] = [
  { id: 'p1', name: 'Marcus Rivera', parentName: 'Ana Rivera', parentEmail: 'ana.rivera@mail.com', parentPhone: '(480) 555-0112', position: 'Guard', jerseyNumber: '3', active: true },
  { id: 'p2', name: 'Jaylen Thomas', parentName: 'DeShawn Thomas', parentEmail: 'd.thomas@mail.com', parentPhone: '(602) 555-0198', position: 'Forward', jerseyNumber: '12', active: true },
  { id: 'p3', name: 'Aiden Park', parentName: 'Soo Park', parentEmail: 'soo.park@mail.com', parentPhone: '(480) 555-0234', position: 'Center', jerseyNumber: '24', active: true },
  { id: 'p4', name: 'Elijah Brooks', parentName: 'Tamika Brooks', parentEmail: 't.brooks@mail.com', parentPhone: '(623) 555-0167', position: 'Guard', jerseyNumber: '7', active: true },
  { id: 'p5', name: 'Noah Gutierrez', parentName: 'Carlos Gutierrez', parentEmail: 'c.gutierrez@mail.com', parentPhone: '(480) 555-0345', position: 'Forward', jerseyNumber: '15', active: true },
  { id: 'p6', name: 'Kai Nakamura', parentName: 'Yuki Nakamura', parentEmail: 'y.nakamura@mail.com', parentPhone: '(602) 555-0289', position: 'Guard', jerseyNumber: '11', active: true },
  { id: 'p7', name: 'Liam O\'Brien', parentName: 'Sean O\'Brien', parentEmail: 's.obrien@mail.com', parentPhone: '(480) 555-0456', position: 'Center', jerseyNumber: '32', active: true },
  { id: 'p8', name: 'Dante Williams', parentName: 'Keisha Williams', parentEmail: 'k.williams@mail.com', parentPhone: '(623) 555-0378', position: 'Forward', jerseyNumber: '22', active: true },
];

export const demoFees: Fee[] = [
  { id: 'f1', title: 'Registration Fee', type: 'registration', amount: 150, dueDate: '2026-03-01', appliesTo: 'all', recurring: false, createdAt: '2026-02-15', notificationSent: true },
  { id: 'f2', title: 'April Monthly', type: 'monthly', amount: 75, dueDate: '2026-04-01', appliesTo: 'all', recurring: true, createdAt: '2026-03-25', notificationSent: true },
  { id: 'f3', title: 'Spring Tournament', type: 'tournament', amount: 45, dueDate: '2026-04-15', appliesTo: 'all', recurring: false, createdAt: '2026-04-01', notificationSent: false },
  { id: 'f4', title: 'Equipment Fee', type: 'equipment', amount: 60, dueDate: '2026-03-15', appliesTo: ['p1', 'p2', 'p3', 'p4'], recurring: false, createdAt: '2026-03-01', notificationSent: true },
];

export const demoPayments: Payment[] = [
  // Registration - all paid
  ...demoPlayers.map((p, i) => ({ id: `pay-r-${p.id}`, playerId: p.id, feeId: 'f1', amount: 150, status: 'paid' as const, paidAmount: 150, paidDate: `2026-03-0${i + 1}`, stripeSessionId: `cs_${p.id}_f1`, manuallyMarked: i > 5 })),
  // April Monthly - mixed
  { id: 'pay-m-p1', playerId: 'p1', feeId: 'f2', amount: 75, status: 'paid', paidAmount: 75, paidDate: '2026-04-02', stripeSessionId: 'cs_p1_f2', manuallyMarked: false },
  { id: 'pay-m-p2', playerId: 'p2', feeId: 'f2', amount: 75, status: 'paid', paidAmount: 75, paidDate: '2026-04-03', stripeSessionId: 'cs_p2_f2', manuallyMarked: false },
  { id: 'pay-m-p3', playerId: 'p3', feeId: 'f2', amount: 75, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p4', playerId: 'p4', feeId: 'f2', amount: 75, status: 'partial', paidAmount: 40, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p5', playerId: 'p5', feeId: 'f2', amount: 75, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p6', playerId: 'p6', feeId: 'f2', amount: 75, status: 'paid', paidAmount: 75, paidDate: '2026-04-01', stripeSessionId: 'cs_p6_f2', manuallyMarked: false },
  { id: 'pay-m-p7', playerId: 'p7', feeId: 'f2', amount: 75, status: 'unpaid', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: false },
  { id: 'pay-m-p8', playerId: 'p8', feeId: 'f2', amount: 75, status: 'waived', paidAmount: 0, paidDate: null, stripeSessionId: null, manuallyMarked: true },
  // Tournament - mostly unpaid
  ...demoPlayers.map((p, i) => ({ id: `pay-t-${p.id}`, playerId: p.id, feeId: 'f3', amount: 45, status: (i < 2 ? 'paid' : 'unpaid') as Payment['status'], paidAmount: i < 2 ? 45 : 0, paidDate: i < 2 ? '2026-04-05' : null, stripeSessionId: i < 2 ? `cs_${p.id}_f3` : null, manuallyMarked: false })),
];

export const demoSchedule: ScheduleEvent[] = [
  { id: 's1', title: 'Practice', date: '2026-04-08', startTime: '17:30', endTime: '19:00', location: 'Scottsdale Sports Complex', notes: 'Focus on defensive drills', type: 'practice', cancelled: false },
  { id: 's2', title: 'Practice', date: '2026-04-10', startTime: '17:30', endTime: '19:00', location: 'Scottsdale Sports Complex', notes: '', type: 'practice', cancelled: false },
  { id: 's3', title: 'Game vs Wildcats', date: '2026-04-12', startTime: '09:00', endTime: '10:30', location: 'Desert Ridge Park', notes: 'Home game. Arrive 30 min early.', type: 'game', cancelled: false },
  { id: 's4', title: 'Practice', date: '2026-04-15', startTime: '17:30', endTime: '19:00', location: 'Scottsdale Sports Complex', notes: '', type: 'practice', cancelled: false },
  { id: 's5', title: 'Practice', date: '2026-04-17', startTime: '17:30', endTime: '19:00', location: 'Scottsdale Sports Complex', notes: 'Scrimmage day', type: 'practice', cancelled: false },
  { id: 's6', title: 'Spring Tournament', date: '2026-04-19', startTime: '08:00', endTime: '17:00', location: 'Tempe Diablo Stadium', notes: 'Pool play starts at 8AM. Bracket play at 1PM.', type: 'tournament', cancelled: false },
  { id: 's7', title: 'Game vs Thunder', date: '2026-04-22', startTime: '18:00', endTime: '19:30', location: 'Chaparral Park', notes: 'Away game', type: 'game', cancelled: false },
];
