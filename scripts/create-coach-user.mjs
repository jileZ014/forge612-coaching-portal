// One-shot script: create the coach Firebase Auth user for team@azflighthoops.com.
// Uses gcloud Application Default Credentials. Run from project root:
//   node scripts/create-coach-user.mjs
//
// Safe to re-run: if user exists, it prints the existing UID and offers to reset password instead.

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';

const EMAIL = 'team@azflighthoops.com';
const PROJECT_ID = 'flight-pay-az';

function genPassword() {
  // 16 chars URL-safe base64 (no ambiguity with email-typed passwords)
  return randomBytes(12).toString('base64').replace(/[+/=]/g, 'A').slice(0, 16);
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}

const auth = getAuth();
const tempPassword = genPassword();

try {
  const existing = await auth.getUserByEmail(EMAIL).catch(() => null);
  if (existing) {
    console.log(`User already exists: ${existing.uid}`);
    console.log(`Email: ${existing.email}`);
    console.log(`Resetting password to a fresh temp value...`);
    await auth.updateUser(existing.uid, { password: tempPassword });
    console.log('');
    console.log('=== TEMP PASSWORD (change after first login) ===');
    console.log(tempPassword);
  } else {
    const user = await auth.createUser({
      email: EMAIL,
      password: tempPassword,
      displayName: 'Coach Jonas',
      emailVerified: true,
    });
    console.log(`Created user: ${user.uid}`);
    console.log(`Email: ${user.email}`);
    console.log('');
    console.log('=== TEMP PASSWORD (change after first login) ===');
    console.log(tempPassword);
  }
  console.log('');
  console.log(`Login at: https://flight-pay.netlify.app/login`);
  console.log(`To change password later, hit "Forgot your password?" on that page.`);
} catch (err) {
  console.error('FAILED:', err.message);
  if (err.message.includes('credential')) {
    console.error('');
    console.error('Likely missing gcloud ADC. Run:');
    console.error('  gcloud auth application-default login');
  }
  process.exit(1);
}
