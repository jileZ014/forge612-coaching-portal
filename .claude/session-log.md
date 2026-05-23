# forge612-coaching-portal session log

## 2026-05-22 18:15 — SD Tournament Team Roster intake links shipped (6 coaches)
**Session type:** VS Code
**ROI tag:** REVENUE
- Jonas: "i have 6 different coaches, can i send them a link for them to enter the rosters. It should be player first name, last name, age, phone #, parent name, grade, HS, grad year, keep it basic"
- Built public per-team intake page at `/roster/[teamCode]` (no auth — coaches just open link from text). 8 fields per player, auto-saves on blur. Teams: `16u-rob`, `15u-white`, `14u-jonas`, `13u-josiah`, `10u-salo`, `9u-toni`.
- Built admin overview at `/dashboard/sd-tournament/rosters` (auth-gated). Per-team card with: player count, Copy-link button, "Text coach" `sms:` deep-link (pre-fills message body), External-link to coach's view, live list of submitted players + completeness dots (success-green if all 6 required fields filled, warning-amber if partial).
- Firestore: new collection `teams/{TEAM_ID}/sdTournamentRoster` (flat, `teamCode` field on each doc). Rules updated: public read+write for roster, coach-only for `sdTournamentVerification` (caught + fixed missing rule from yesterday). Deployed via `npm run deploy:rules`.
- Hit Firestore composite-index error on first deploy (`where teamCode + orderBy createdAt`). Dropped the orderBy and sort client-side — small rosters, zero perf impact, no index needed.
- Used `npx netlify deploy --prod --build` (lesson from earlier turn). Two deploys total: first hit index error, second clean.
- Verified live via Playwright: `/roster/14u-jonas` renders, "Add Player" creates Firestore doc + new row appears with first-name auto-focused, delete confirm-dialog fires. Admin route `/dashboard/sd-tournament/rosters` redirects unauthed → `/login` (correct). SD tournament dashboard shows both new buttons: "Team Rosters" + "Age & Grade Verification".

**Trust model for public roster writes:** anyone with the link can read/write that team's roster. Acceptable: links shared only with 6 coaches Jonas knows; PII is basic roster info already given to tournament organizers. Tighten later with team-code random tokens if needed.

**Open items:**
- deploy.sh `--no-build` flow is STILL fragile — same chunk-hash bug surfaced this morning. Fix should be: drop `--no-build` from deploy.sh entirely (Netlify Build works fine). Flagged for follow-up.
- Firebase Admin key still missing on Netlify — Zelle dashboard still in static-fallback mode.

**To continue:** Jonas opens `/dashboard/sd-tournament/rosters` on his phone, taps "Text coach" for each of the 6 coaches, sends the link via Messages. Coaches fill rosters in their browser. Jonas watches it populate live.

---

## 2026-05-22 17:57 — SD Tournament Age & Grade Verification checklist shipped
**Session type:** VS Code
**ROI tag:** REVENUE
- Built `/dashboard/sd-tournament/verification` — mobile-friendly per-player checklist for the San Diego registration desk. Two toggles per row (Birth Cert / Grade Proof), notes field, search + team filter + "hide verified" toggle. Sorted missing-first.
- Roster pulls from existing `/api/sd-tournament` GET (Stripe sessions + Zelle records). Verification status writes client-side to new Firestore collection `teams/{TEAM_ID}/sdTournamentVerification`, keyed by paymentId. No Firebase Admin key required — client SDK + auth context.
- Added type `SdVerificationRecord` + helpers `getSdVerificationRecords` / `upsertSdVerification` in [src/lib/firestore-helpers.ts](../src/lib/firestore-helpers.ts).
- Re-hit the 5/20 chunk-hash bug: `bash deploy.sh` (uses `--no-build`) shipped HTML that referenced chunk hash `216-d265cd...` while uploaded chunks were `216-2d186f...`. Production URL 404'd the new route, unique deploy URL showed ChunkLoadError. Fixed by re-deploying with `npx netlify deploy --prod --build --site=...` so Netlify builds server-side and HTML+chunks stay consistent.
- Verified live: `/dashboard/sd-tournament/verification` exists and redirects unauthed → `/login` (correct). New "Age & Grade Verification" link visible in SD tournament action bar. Coach login still needed to confirm checklist renders + Firestore writes succeed.

**Open items:**
- Coach needs to log in and confirm checklist UI renders correctly and toggles persist (Playwright can't auth via form per anti-pattern #2).
- `deploy.sh` `--no-build` flow is fragile when chunk hashes change. Either patch script to detect new-route/new-import case and switch to `--build`, or remove `--no-build` entirely now that Netlify Build works.
- Firebase Admin key still missing on Netlify — Zelle dashboard still in static-fallback mode.

**To continue:** Jonas tests the verification page live at the SD registration desk. If anything's missing (e.g. needs to filter by per-coach team, or per-player split when playerCount > 1), report back.

---
