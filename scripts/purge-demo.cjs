/**
 * Delete every seeded demo doc from a tenant. Targets ONLY docs with isDemo === true
 * AND an id starting with "demo-", so real family data can never be caught by it.
 *
 *   node scripts/purge-demo.cjs <team-config-name> <path-to-.env.local> [--apply]
 *
 * Without --apply it is a dry run.
 */
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const cfgName = process.argv[2];
const envPath = process.argv[3];
const apply = process.argv.includes('--apply');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'team-configs', `${cfgName}.json`), 'utf8'));
const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT_KEY='));
let raw = line.slice('FIREBASE_SERVICE_ACCOUNT_KEY='.length).trim();
if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
let sa;
try { sa = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch { sa = JSON.parse(raw); }
if (sa.project_id !== cfg.firebaseProject) {
  console.error(`REFUSING: SA is "${sa.project_id}", config expects "${cfg.firebaseProject}".`);
  process.exit(1);
}

initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const isDemoDoc = (d) => d.id.startsWith('demo-') && d.data().isDemo === true;

(async () => {
  const targets = [];

  const parents = await db.collection('parents').get();
  parents.docs.filter(isDemoDoc).forEach((d) => targets.push(d.ref));

  for (const sub of ['families', 'players']) {
    const snap = await db.collection('teams').doc(cfg.teamId).collection(sub).get();
    snap.docs.filter(isDemoDoc).forEach((d) => targets.push(d.ref));
  }

  if (targets.length === 0) {
    console.log('No demo docs found. Nothing to remove.');
    process.exit(0);
  }

  console.log(`${apply ? 'DELETING' : 'DRY RUN — would delete'} ${targets.length} demo doc(s) in ${sa.project_id}:`);
  targets.forEach((r) => console.log('  ' + r.path));

  if (apply) {
    for (const ref of targets) await ref.delete();
    console.log('\nDeleted.');
  } else {
    console.log('\nRe-run with --apply to delete.');
  }
  process.exit(0);
})().catch((e) => { console.error('PURGE FAILED:', e.message); process.exit(1); });
