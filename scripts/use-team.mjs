#!/usr/bin/env node
/**
 * Swap the active tenant config.
 *
 *   npm run use:azflight   -> team-configs/az-flight-hoops.json   -> team-config.json
 *   npm run use:yoties     -> team-configs/yoties-flag-football.json -> team-config.json
 *
 * One codebase, N deployments. Each tenant gets its own Netlify site (its own
 * env vars + Firebase project + Stripe account); this only decides which config
 * gets compiled into the build. See the 2026-08-11 audit: TEAM_ID is a build-time
 * constant, so the config must be swapped before `npm run build`.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'team-configs');
const target = join(root, 'team-config.json');

const wanted = process.argv[2];
const available = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

if (!wanted) {
  const current = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')).teamId : '(none)';
  console.log(`Active tenant: ${current}`);
  console.log(`Available    : ${available.join(', ')}`);
  process.exit(0);
}

const src = join(dir, `${wanted}.json`);
if (!existsSync(src)) {
  console.error(`No config named "${wanted}". Available: ${available.join(', ')}`);
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(src, 'utf8'));

// Fail closed on the fields that silently produce a broken or WRONG-TENANT build.
const required = ['teamId', 'teamName', 'coachEmail', 'firebaseProject'];
const missing = required.filter((k) => !cfg[k] || String(cfg[k]).trim() === '');
if (missing.length) {
  console.error(`Config "${wanted}" is missing required field(s): ${missing.join(', ')}`);
  console.error('Refusing to switch — an empty coachEmail disables all coach authorization.');
  process.exit(1);
}

writeFileSync(target, JSON.stringify(cfg, null, 2) + '\n');
console.log(`Active tenant -> ${cfg.teamId} (${cfg.teamName})`);
console.log(`  firebase : ${cfg.firebaseProject}`);
console.log(`  coach    : ${cfg.coachEmail}`);
console.log('\nRemember: deploy this build to THAT tenant\'s Netlify site only.');
