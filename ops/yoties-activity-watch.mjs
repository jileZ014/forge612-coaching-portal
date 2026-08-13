// yoties-activity-watch.mjs — Telegram alert the moment Coach Josh actually touches the portal.
//
// Context: the two onboarding texts went to Josh (480-710-1154) on 2026-08-12 at 14:47/14:48 AZ.
// Jonas asked to be pinged when Josh tries it. This polls the Yoties Firebase project and DMs him.
//
// Deliberately uses firebase-admin, NOT the Auth REST API. A REST signInWithPassword would
// itself bump lastSignInTime and destroy the exact signal we are watching. (That is how my own
// 14:37 credential check ended up looking like a login in the first place.)
//
// Fires ONCE per event type. State in .keys/yoties-watch-state.json.
//
// Usage:
//   node ops/yoties-activity-watch.mjs            # normal poll
//   node ops/yoties-activity-watch.mjs --test     # send a ping to prove the Telegram path works
//   node ops/yoties-activity-watch.mjs --status   # print what it sees, send nothing
//
// Scheduled via Windows Task "Yoties-ActivityWatch" -> .shared/cron-launcher.js (heartbeat safety net).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
const admin = require(join(ROOT, 'node_modules', 'firebase-admin'));

const TEST = process.argv.includes('--test');
const STATUS_ONLY = process.argv.includes('--status');
const SIMULATE = process.argv.includes('--simulate');

const SA_PATH = join(ROOT, '.keys', 'yoties-sa.json');
const STATE_PATH = join(ROOT, '.keys', 'yoties-watch-state.json');
const CHAT_ID = '8745237088';
const PORTAL_URL = 'https://forge612-yoties-portal.netlify.app';
const TEAM_ID = 'yoties-flag-football';

// Baseline = the world as it stood right after the onboarding texts were sent.
// Anything past these numbers is Josh, not us.
const BASELINE = {
  // 2026-08-12T21:37:09Z — my own password verification, 10 min BEFORE the texts went out.
  signInMs: Date.parse('2026-08-12T21:37:09Z'),
  parents: 4, // the seeded demo families
  registrations: 0,
  players: 0,
  knownUsers: ['info@shemakesplays.org', 'jangeles253@yahoo.com'],
};

function log(...a) {
  console.log(new Date().toISOString(), ...a);
}

function getToken() {
  let token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    const envPath = join(process.env.USERPROFILE || '', '.claude', 'channels', 'telegram', '.env');
    if (existsSync(envPath)) {
      const m = readFileSync(envPath, 'utf8').match(/TELEGRAM_BOT_TOKEN=(.+)/);
      if (m) token = m[1].trim();
    }
  }
  return token;
}

// ~/.claude/notifications-paused.flag has been set since 2026-05-11. Its own text scopes it to
// recurring digests, briefs and monitor sweeps, and explicitly carves out transactional sends
// ("Stripe payment notifications keep firing (transactional)"). This watcher is transactional and
// one-shot per event, and Jonas asked for it directly on 2026-08-12, so it is exempt. It is logged
// on every send so the exemption is never invisible. Recurring noise stays silenced.
const EXEMPT_FROM_NOTIFICATION_PAUSE = true;

function notificationsPaused() {
  return existsSync(join(process.env.USERPROFILE || '', '.claude', 'notifications-paused.flag'));
}

async function sendTelegram(text) {
  if (notificationsPaused()) {
    if (!EXEMPT_FROM_NOTIFICATION_PAUSE) {
      log('SKIP: ~/.claude/notifications-paused.flag is set, not sending.');
      return true;
    }
    log('NOTE: notifications-paused.flag is set; sending anyway (transactional carve-out).');
  }
  const token = getToken();
  if (!token) {
    console.error('FAIL: no TELEGRAM_BOT_TOKEN in env or ~/.claude/channels/telegram/.env');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, disable_web_page_preview: true }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    console.error('FAIL: Telegram rejected:', res.status, JSON.stringify(j));
    return false;
  }
  log('sent message_id=' + (j.result && j.result.message_id));
  return true;
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { fired: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { fired: {} };
  }
}

function saveState(s) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

async function main() {
  if (TEST) {
    const ok = await sendTelegram(
      'Test ping (ignore). The Yoties activity watcher is live. You will get a DM the moment Coach Josh logs in, registers a player, adds a family, or starts Stripe Connect. Giles',
    );
    process.exit(ok ? 0 : 1);
  }

  if (!existsSync(SA_PATH)) {
    console.error('FAIL: missing service account at ' + SA_PATH);
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(SA_PATH, 'utf8'));
  if (sa.project_id !== TEAM_ID) {
    console.error(`FAIL: service account is for ${sa.project_id}, expected ${TEAM_ID}`);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });

  const db = admin.firestore();
  const [userList, teamDoc, regSnap, parentSnap, playerSnap] = await Promise.all([
    admin.auth().listUsers(200),
    db.collection('teams').doc(TEAM_ID).get(),
    db.collection('registrations').get(),
    db.collection('parents').get(),
    db.collection('players').get(),
  ]);

  const coach = userList.users.find((u) => u.email === 'info@shemakesplays.org');
  const lastSignInMs = coach?.metadata?.lastSignInTime ? Date.parse(coach.metadata.lastSignInTime) : 0;
  const newUsers = userList.users.filter((u) => u.email && !BASELINE.knownUsers.includes(u.email));
  const stripeAccountId = (teamDoc.exists ? teamDoc.data().stripeAccountId : '') || '';

  const seen = {
    lastSignIn: coach?.metadata?.lastSignInTime || 'never',
    registrations: regSnap.size,
    parents: parentSnap.size,
    players: playerSnap.size,
    stripeAccountId,
    newUsers: newUsers.map((u) => u.email),
  };
  log('observed', JSON.stringify(seen));

  // Each entry: [key, fired?, headline]
  const events = [
    ['login', lastSignInMs > BASELINE.signInMs, 'He logged in to the coach dashboard.'],
    ['registration', regSnap.size > BASELINE.registrations, `A registration came through (${regSnap.size} total).`],
    ['family', parentSnap.size > BASELINE.parents, `He added a family (${parentSnap.size} now, was ${BASELINE.parents}).`],
    ['player', playerSnap.size > BASELINE.players, `A player record appeared (${playerSnap.size} total).`],
    ['stripe', stripeAccountId !== '', `He started Stripe Connect (account ${stripeAccountId}).`],
    ['newuser', newUsers.length > 0, `A new account signed up: ${newUsers.map((u) => u.email).join(', ')}.`],
  ];

  const state = loadState();
  state.fired = state.fired || {};
  let toFire = events.filter(([key, hit]) => hit && !state.fired[key]);

  // --simulate proves the real alert renders and delivers, using the live numbers, without
  // recording state. Otherwise the message format itself would ship untested and the first
  // time it ran for real would also be the first time anyone saw it.
  if (SIMULATE) {
    toFire = [
      ['login', true, 'He logged in to the coach dashboard.'],
      ['stripe', true, 'He started Stripe Connect (account acct_SIMULATED).'],
    ];
    log('SIMULATE: sending a sample alert, state will NOT be written.');
  }

  if (STATUS_ONLY) {
    log('status only. would fire:', toFire.map(([k]) => k).join(', ') || '(nothing new)');
    process.exit(0);
  }

  if (toFire.length === 0) {
    log('no new activity from Josh.');
    process.exit(0);
  }

  // A simulated alert MUST be unmistakable. The first --simulate run on 2026-08-12 used the
  // real format verbatim; Jonas read it as Josh actually logging in. Only "acct_SIMULATED" and a
  // stale timestamp gave it away, which is not good enough for something that lands on a phone.
  const lines = [
    ...(SIMULATE
      ? ['⚠️⚠️ TEST MESSAGE — NOT REAL. Josh has NOT done anything. ⚠️⚠️', '']
      : []),
    '🏈 Coach Josh is in the Yoties portal',
    '',
    ...toFire.map(([, , headline]) => '· ' + headline),
    '',
    'Last sign-in: ' + seen.lastSignIn,
    PORTAL_URL,
    '',
    ...(SIMULATE ? ['⚠️ Again: this is a FORMAT TEST, ignore it.', ''] : []),
    'Giles',
  ];
  const ok = await sendTelegram(lines.join('\n'));
  if (!ok) process.exit(1);

  if (SIMULATE) {
    log('SIMULATE: alert delivered, state deliberately not written.');
    process.exit(0);
  }

  const stamp = new Date().toISOString();
  toFire.forEach(([key]) => {
    state.fired[key] = stamp;
  });
  state.lastSeen = seen;
  state.lastCheck = stamp;
  saveState(state);
  log('fired: ' + toFire.map(([k]) => k).join(', '));
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e && e.message);
  process.exit(1);
});
