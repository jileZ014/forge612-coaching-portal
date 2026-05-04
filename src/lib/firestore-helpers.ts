import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { teamConfig } from './team-config';
import type {
  Player,
  Fee,
  Payment,
  ScheduleEvent,
  Team,
  Family,
  Communication,
  FamilyDocument,
  LifecycleStage,
} from './types';

const TEAM_ID = teamConfig.teamId;

export async function getTeam(): Promise<Team | null> {
  const snap = await getDoc(doc(db, 'teams', TEAM_ID));
  return snap.exists() ? (snap.data() as Team) : null;
}

export async function updateTeam(data: Partial<Team>) {
  await updateDoc(doc(db, 'teams', TEAM_ID), data as DocumentData);
}

const playersCol = () => collection(db, 'teams', TEAM_ID, 'players');

export async function getPlayers(): Promise<Player[]> {
  const snap = await getDocs(query(playersCol(), orderBy('name')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
}

export async function addPlayer(data: Omit<Player, 'id'>) {
  return addDoc(playersCol(), data);
}

export async function updatePlayer(id: string, data: Partial<Player>) {
  await updateDoc(doc(db, 'teams', TEAM_ID, 'players', id), data as DocumentData);
}

export async function deletePlayer(id: string) {
  await deleteDoc(doc(db, 'teams', TEAM_ID, 'players', id));
  const paymentsSnap = await getDocs(
    query(paymentsCol(), where('playerId', '==', id))
  );
  for (const payDoc of paymentsSnap.docs) {
    await deleteDoc(payDoc.ref);
  }
}

const feesCol = () => collection(db, 'teams', TEAM_ID, 'fees');

export async function getFees(): Promise<Fee[]> {
  const snap = await getDocs(query(feesCol(), orderBy('dueDate', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Fee));
}

export async function addFee(data: Omit<Fee, 'id'>) {
  return addDoc(feesCol(), data);
}

export async function updateFee(id: string, data: Partial<Fee>) {
  await updateDoc(doc(db, 'teams', TEAM_ID, 'fees', id), data as DocumentData);
}

export async function deleteFee(id: string) {
  await deleteDoc(doc(db, 'teams', TEAM_ID, 'fees', id));
  const paymentsSnap = await getDocs(
    query(paymentsCol(), where('feeId', '==', id))
  );
  for (const payDoc of paymentsSnap.docs) {
    await deleteDoc(payDoc.ref);
  }
}

const paymentsCol = () => collection(db, 'teams', TEAM_ID, 'payments');

export async function getPayments(): Promise<Payment[]> {
  const snap = await getDocs(paymentsCol());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
}

export async function getPaymentsForPlayer(playerEmail: string): Promise<Payment[]> {
  const playersSnap = await getDocs(
    query(playersCol(), where('parentEmail', '==', playerEmail))
  );
  if (playersSnap.empty) return [];

  const playerIds = playersSnap.docs.map((d) => d.id);
  const allPayments = await getPayments();
  return allPayments.filter((p) => playerIds.includes(p.playerId));
}

export async function addPayment(data: Omit<Payment, 'id'>) {
  return addDoc(paymentsCol(), data);
}

export async function updatePayment(id: string, data: Partial<Payment>) {
  await updateDoc(doc(db, 'teams', TEAM_ID, 'payments', id), data as DocumentData);
}

const familiesCol = () => collection(db, 'teams', TEAM_ID, 'families');

export async function getFamilies(): Promise<Family[]> {
  const snap = await getDocs(query(familiesCol(), orderBy('primaryParentName')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Family));
}

export async function getFamily(id: string): Promise<Family | null> {
  const snap = await getDoc(doc(db, 'teams', TEAM_ID, 'families', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Family) : null;
}

export async function getFamilyByEmail(email: string): Promise<Family | null> {
  const snap = await getDocs(query(familiesCol(), where('primaryParentEmail', '==', email), fbLimit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Family;
}

export async function getFamiliesByStage(stage: LifecycleStage): Promise<Family[]> {
  const snap = await getDocs(query(familiesCol(), where('lifecycleStage', '==', stage)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Family));
}

export async function addFamily(data: Omit<Family, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  return addDoc(familiesCol(), { ...data, createdAt: now, updatedAt: now } as DocumentData);
}

export async function updateFamily(id: string, data: Partial<Family>) {
  await updateDoc(doc(db, 'teams', TEAM_ID, 'families', id), {
    ...data,
    updatedAt: new Date().toISOString(),
  } as DocumentData);
}

export async function setFamilyLifecycleStage(id: string, stage: LifecycleStage) {
  const now = new Date().toISOString();
  await updateDoc(doc(db, 'teams', TEAM_ID, 'families', id), {
    lifecycleStage: stage,
    lifecycleStageChangedAt: now,
    updatedAt: now,
  } as DocumentData);
}

export async function deleteFamily(id: string) {
  await deleteDoc(doc(db, 'teams', TEAM_ID, 'families', id));
}

export async function getPlayersForFamily(familyId: string): Promise<Player[]> {
  const snap = await getDocs(query(playersCol(), where('familyId', '==', familyId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player));
}

const communicationsCol = () => collection(db, 'teams', TEAM_ID, 'communications');

export async function getCommunicationsForFamily(familyId: string, max = 100): Promise<Communication[]> {
  const snap = await getDocs(
    query(
      communicationsCol(),
      where('familyId', '==', familyId),
      orderBy('timestamp', 'desc'),
      fbLimit(max),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Communication));
}

export async function addCommunication(data: Omit<Communication, 'id' | 'createdAt'>) {
  const now = new Date().toISOString();
  return addDoc(communicationsCol(), { ...data, createdAt: now } as DocumentData);
}

export async function updateCommunication(id: string, data: Partial<Communication>) {
  await updateDoc(doc(db, 'teams', TEAM_ID, 'communications', id), data as DocumentData);
}

const documentsCol = () => collection(db, 'teams', TEAM_ID, 'documents');

export async function getDocumentsForFamily(familyId: string): Promise<FamilyDocument[]> {
  const snap = await getDocs(
    query(documentsCol(), where('familyId', '==', familyId), orderBy('uploadedAt', 'desc')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FamilyDocument));
}

export async function addDocument(data: Omit<FamilyDocument, 'id'>) {
  return addDoc(documentsCol(), data as DocumentData);
}

export async function deleteDocument(id: string) {
  await deleteDoc(doc(db, 'teams', TEAM_ID, 'documents', id));
}

const scheduleCol = () => collection(db, 'teams', TEAM_ID, 'schedule');

export async function getSchedule(): Promise<ScheduleEvent[]> {
  const snap = await getDocs(query(scheduleCol(), orderBy('date', 'asc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScheduleEvent));
}

export async function addScheduleEvent(data: Omit<ScheduleEvent, 'id'>) {
  return addDoc(scheduleCol(), data);
}

export async function updateScheduleEvent(id: string, data: Partial<ScheduleEvent>) {
  await updateDoc(doc(db, 'teams', TEAM_ID, 'schedule', id), data as DocumentData);
}

export async function deleteScheduleEvent(id: string) {
  await deleteDoc(doc(db, 'teams', TEAM_ID, 'schedule', id));
}
