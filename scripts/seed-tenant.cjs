/**
 * Seed a tenant's Firestore with the team doc + demo families/players.
 *
 *   node scripts/seed-tenant.cjs <team-config-name> <path-to-.env.local-with-SA>
 *
 * Idempotent: re-running overwrites the same demo doc ids rather than duplicating.
 * Demo families are prefixed `demo-` so they are trivially identifiable and deletable.
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const cfgName = process.argv[2];
const envPath = process.argv[3];
if (!cfgName || !envPath) {
  console.error('usage: node scripts/seed-tenant.cjs <team-config-name> <path-to-.env.local>');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'team-configs', `${cfgName}.json`), 'utf8'));

const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT_KEY='));
let raw = line.slice('FIREBASE_SERVICE_ACCOUNT_KEY='.length).trim();
if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
let sa;
try { sa = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { sa = JSON.parse(raw); }

if (sa.project_id !== cfg.firebaseProject) {
  console.error(`REFUSING: service account is for "${sa.project_id}" but config expects "${cfg.firebaseProject}".`);
  process.exit(1);
}

initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();
const auth = getAuth();

const FAMILIES = [
  { id: 'demo-alvarez', parent: 'Maria Alvarez', phone: '+16025550118', email: 'maria.alvarez@example.com', players: [{ name: 'Sofia Alvarez', birthYear: '2016', position: 'Quarterback' }], group: '10U', rate: 85 },
  { id: 'demo-brooks',  parent: 'Danielle Brooks', phone: '+16025550142', email: 'd.brooks@example.com', players: [{ name: 'Jayda Brooks', birthYear: '2015', position: 'Wide Receiver' }], group: '12U', rate: 85 },
  { id: 'demo-nguyen',  parent: 'Tran Nguyen', phone: '+16025550177', email: 'tran.nguyen@example.com', players: [{ name: 'Mia Nguyen', birthYear: '2016', position: 'Safety' }, { name: 'Ava Nguyen', birthYear: '2014', position: 'Rusher' }], group: '10U', rate: 150 },
  { id: 'demo-carter',  parent: 'Renee Carter', phone: '+16025550163', email: 'renee.c@example.com', players: [{ name: 'Zoe Carter', birthYear: '2015', position: 'Center' }], group: '12U', rate: 85 },
];

(async () => {
  const now = new Date().toISOString();

  await db.collection('teams').doc(cfg.teamId).set({
    teamId: cfg.teamId,
    name: cfg.teamName,
    sport: cfg.sport,
    coachEmail: cfg.coachEmail,
    coachName: cfg.coachName,
    primaryColor: cfg.primaryColor,
    accentColor: cfg.accentColor,
    tagline: cfg.tagline,
    domain: cfg.domain,
    updatedAt: now,
  }, { merge: true });
  console.log(`teams/${cfg.teamId} written (coachEmail=${cfg.coachEmail})`);

  for (const f of FAMILIES) {
    await db.collection('parents').doc(f.id).set({
      firstName: f.parent.split(' ')[0],
      lastName: f.parent.split(' ').slice(1).join(' '),
      phone: f.phone,
      email: f.email,
      team: f.group,
      playerNames: f.players.map((p) => p.name),
      monthlyRate: f.rate,
      rateType: f.players.length > 1 ? 'siblings' : 'regular',
      currentBalance: 0,
      status: 'active',
      doNotInvoice: false,
      payments: {},
      invoiceActivity: {},
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await db.collection('teams').doc(cfg.teamId).collection('families').doc(f.id).set({
      primaryParentName: f.parent,
      primaryParentPhone: f.phone,
      primaryParentEmail: f.email,
      lifecycleStage: 'active',
      source: 'demo-seed',
      ageGroup: f.group,
      doNotContact: false,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    for (const [i, p] of f.players.entries()) {
      await db.collection('teams').doc(cfg.teamId).collection('players').doc(`${f.id}-p${i + 1}`).set({
        name: p.name,
        familyId: f.id,
        birthYear: p.birthYear,
        position: p.position,
        ageGroup: f.group,
        isDemo: true,
        createdAt: now,
      }, { merge: true });
    }
  }
  console.log(`seeded ${FAMILIES.length} demo families + ${FAMILIES.reduce((n, f) => n + f.players.length, 0)} players`);

  // Coach login must exist or the dashboard is untestable.
  let user;
  try {
    user = await auth.getUserByEmail(cfg.coachEmail);
    console.log(`auth user exists: ${cfg.coachEmail}`);
  } catch {
    const tempPw = `Forge612-${Math.abs(cfg.teamId.split('').reduce((a, c) => a + c.charCodeAt(0), 0))}!`;
    user = await auth.createUser({ email: cfg.coachEmail, password: tempPw, emailVerified: false });
    console.log(`auth user CREATED: ${cfg.coachEmail}`);
    console.log(`TEMP PASSWORD    : ${tempPw}   <-- change on first login`);
  }
  console.log('\nDone.');
  process.exit(0);
})().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
