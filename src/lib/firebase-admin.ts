import { initializeApp, getApps, cert, applicationDefault, type ServiceAccount, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;

function ensureApp(): App {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0];
    return _app;
  }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  let credential;

  if (key) {
    try {
      const parsed = JSON.parse(Buffer.from(key, 'base64').toString('utf-8'));
      credential = cert(parsed as ServiceAccount);
    } catch {
      credential = cert(JSON.parse(key) as ServiceAccount);
    }
  } else {
    try {
      credential = applicationDefault();
    } catch {
      // No credentials available — will fail at runtime if admin SDK is actually used
    }
  }

  _app = initializeApp({
    ...(credential ? { credential } : {}),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
  return _app;
}

export function getAdminDb(): Firestore {
  if (!_db) _db = getFirestore(ensureApp());
  return _db;
}

export function getAdminAuth(): Auth {
  if (!_auth) _auth = getAuth(ensureApp());
  return _auth;
}
