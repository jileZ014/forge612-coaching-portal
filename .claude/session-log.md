# forge612-coaching-portal session log

## 2026-06-10 12:50 — ECE demo tenant LIVE at forge612-demo.netlify.app (built from forge612-website-build kit)
**Session type:** VS Code | **ROI tag:** REVENUE

- **Demo live + browser-verified:** https://forge612-demo.netlify.app (NEW Netlify site `forge612-demo`, id 6a4b404f-a9ab-4ac7-a585-888f0b8de3c4). Login coach@emeraldcityelite.com / flight2026 (auth user re-created in flight-pay-az). Linked from the repositioned forge612.com ("See it live").
- **Seeded 98 mock docs** via scripts/seed-ece-demo.mjs (client SDK; the temp rules seed-window was REMOVED + rules redeployed same hour): teams/emerald-city-elite/* (18 players, 16 families, 3 fees, 36 payments, 8 schedule events) + flat `ece-demo-parents` (16 fictional Seattle families, 555 phones, @example.com). NO real PII anywhere in the demo namespace.
- **Code changes (all additive, AZ Flight behavior unchanged):**
  1. dashboard/page.tsx: parents collection now `process.env.NEXT_PUBLIC_PARENTS_COLLECTION || 'parents'` (PARENTS_COL); header "Flight Pay / AZ Flight Basketball" -> `{teamConfig.teamName}` (AZ build now shows "AZ Flight Hoops"). SMS body strings deliberately NOT touched (A2P campaign under review).
  2. ScheduleSection.tsx + pay/page.tsx demo data: per-tenant via teamConfig.teamId (AZ default byte-identical).
  3. firestore.rules: +`ece-demo-parents` rw-true block (PERMANENT, mock-only collection, same trust model as /parents). Deployed.
  4. NEW: team-configs/emerald-city-elite.json + emerald-city-elite-logo.png, scripts/seed-ece-demo.mjs.
- **Demo deploy procedure (repeat for demo updates):** copy team-configs/emerald-city-elite.json -> team-config.json + ECE logo -> public/logo.png, set NEXT_PUBLIC_PARENTS_COLLECTION=ece-demo-parents, `npx netlify deploy --prod --build --site=6a4b404f-a9ab-4ac7-a585-888f0b8de3c4`, then RESTORE both files (backups in c:/tmp). team-config.json + logo.png confirmed restored to AZ Flight (git status clean of them).
- ⚠ **CARRY-OVER unchanged: repo has live-but-unpushed WIP** (consent pages, sd-tournament, src/data, dashboard WIP + now these demo changes). CD is ON — a push rebuilds flight-pay from committed state and REGRESSES live. Needs the deliberate cleanup commit (Jonas decision). This session committed ONLY this session-log file, no push.
- A2P campaign still under review (resubmitted 6/7) — unchanged.

**To continue:** cleanup commit decision; on A2P VERIFIED get fresh Twilio token -> delivery test.

---
## 2026-05-23 06:56 â€” Added birthday + split parent name into first/last
**Session type:** VS Code
**ROI tag:** REVENUE
- Jonas: "need to add a birthday field and parent first, last name field"
- Pre-check: Stefon (15u) had ALREADY filled in 5 roster entries overnight. Queried Firestore via gcloud-token REST pattern to verify before making the field changes. Notable rows: "Stefon White" (parent: "Stefon jermaine White sr") + "Troy LBotley" (parent: "Jessy burley") + 1 in 14u (Jayden â€” probably misplaced).
- Added fields to RosterPlayer type: `birthday: string` (YYYY-MM-DD), `parentFirstName: string`, `parentLastName: string`. Kept `parentName?: string` as optional legacy fallback for already-submitted rows.
- Public roster page ([roster/[teamCode]/page.tsx](../src/app/roster/[teamCode]/page.tsx)): birthday `<input type=date>` paired with age, parent-first / parent-last in 2-col grid replacing combined Parent name. Phone moved to col-span-2.
- `getValue` for parentFirstName/parentLastName falls back to splitting parentName on whitespace when new fields are empty â€” so Stefon sees his existing data preserved in the new UI shape. When he edits + saves, the new fields persist.
- Admin overview completeness check + display updated to require birthday + use parentFirst/parentLast (with parentName fallback).
- Verified via Playwright + getComputedStyle on `/roster/15u-white`: all 10 fields render, Stefon's row auto-split correctly (parentFirstName="Stefon", parentLastName="jermaine White sr" â€” slightly messy but coach can clean up).
- Committed [3bdac65](https://github.com/jileZ014/forge612-coaching-portal/commit/3bdac65) on master, pushed.

**Open items:**
- Existing 5 entries still have `parentName` populated but blank `parentFirstName`/`parentLastName` in DB. Once Stefon (or whoever edits) saves any field, the auto-split values land in the new fields. No bulk-migration needed.
- Watch admin overview for new submissions using the expanded form.

**To continue:** Coaches resume filling rosters with the new fields. Jonas watches admin overview.

---

## 2026-05-23 00:25 â€” Input text-color bug fix + Firebase password set (admin REST via gcloud token)
**Session type:** VS Code
**ROI tag:** MAINTENANCE
- Jonas: "change the font, you cannot see the font in the entry as it is dark blue on black background"
- Root cause: [globals.css:44-49](../src/app/globals.css#L44-L49) had an UNLAYERED `input, textarea, select { color: #0F172A }` "safety net" for CRM v0 light-bg forms. Unlayered CSS beats Tailwind utility classes regardless of class specificity â†’ `text-foreground` on my SD-tournament dark-bg inputs lost, rendering dark-blue-on-near-black. Fix: wrapped the rule in `@layer base { ... }` so Tailwind utilities (which live in the utilities layer, ordered AFTER base) override correctly. CRM family-hub inputs still get slate-900 since they don't add a text-color utility class â€” verified at [families/[id]/page.tsx:323-373](../src/app/dashboard/families/[id]/page.tsx#L323) where all CRM inputs already have explicit `text-slate-900` classes.
- Verified via Playwright + `getComputedStyle`: input text now `rgb(250, 250, 250)` (#FAFAFA, near-white), bg `rgb(10, 10, 10)` (#0A0A0A, near-black). High contrast, readable.
- Deployed via `npx netlify deploy --prod --build` â€” the recurring chunk-hash workaround.

Earlier this session (logged in az-flight/ops): Set Firebase Auth password for `team@azflighthoops.com` via Firebase Identity Toolkit Admin REST `accounts:update` using `gcloud auth print-access-token` + `x-goog-user-project: flight-pay-az` header. Bypassed the need for ADC setup or a service account JSON. **Save this pattern** in [scripts/create-coach-user.mjs](../scripts/create-coach-user.mjs) (ADC path, kept as fallback).

**Open items:**
- Jonas should be logged in now and seeing the rosters page. If anything else looks off (other input affordances, dark spots), report back.

**To continue:** Watch [admin overview](https://flight-pay.netlify.app/dashboard/sd-tournament/rosters) for incoming coach submissions.

---

## 2026-05-22 18:15 â€” SD Tournament Team Roster intake links shipped (6 coaches)
**Session type:** VS Code
**ROI tag:** REVENUE
- Jonas: "i have 6 different coaches, can i send them a link for them to enter the rosters. It should be player first name, last name, age, phone #, parent name, grade, HS, grad year, keep it basic"
- Built public per-team intake page at `/roster/[teamCode]` (no auth â€” coaches just open link from text). 8 fields per player, auto-saves on blur. Teams: `16u-rob`, `15u-white`, `14u-jonas`, `13u-josiah`, `10u-salo`, `9u-toni`.
- Built admin overview at `/dashboard/sd-tournament/rosters` (auth-gated). Per-team card with: player count, Copy-link button, "Text coach" `sms:` deep-link (pre-fills message body), External-link to coach's view, live list of submitted players + completeness dots (success-green if all 6 required fields filled, warning-amber if partial).
- Firestore: new collection `teams/{TEAM_ID}/sdTournamentRoster` (flat, `teamCode` field on each doc). Rules updated: public read+write for roster, coach-only for `sdTournamentVerification` (caught + fixed missing rule from yesterday). Deployed via `npm run deploy:rules`.
- Hit Firestore composite-index error on first deploy (`where teamCode + orderBy createdAt`). Dropped the orderBy and sort client-side â€” small rosters, zero perf impact, no index needed.
- Used `npx netlify deploy --prod --build` (lesson from earlier turn). Two deploys total: first hit index error, second clean.
- Verified live via Playwright: `/roster/14u-jonas` renders, "Add Player" creates Firestore doc + new row appears with first-name auto-focused, delete confirm-dialog fires. Admin route `/dashboard/sd-tournament/rosters` redirects unauthed â†’ `/login` (correct). SD tournament dashboard shows both new buttons: "Team Rosters" + "Age & Grade Verification".

**Trust model for public roster writes:** anyone with the link can read/write that team's roster. Acceptable: links shared only with 6 coaches Jonas knows; PII is basic roster info already given to tournament organizers. Tighten later with team-code random tokens if needed.

**Open items:**
- deploy.sh `--no-build` flow is STILL fragile â€” same chunk-hash bug surfaced this morning. Fix should be: drop `--no-build` from deploy.sh entirely (Netlify Build works fine). Flagged for follow-up.
- Firebase Admin key still missing on Netlify â€” Zelle dashboard still in static-fallback mode.

**To continue:** Jonas opens `/dashboard/sd-tournament/rosters` on his phone, taps "Text coach" for each of the 6 coaches, sends the link via Messages. Coaches fill rosters in their browser. Jonas watches it populate live.

---

## 2026-05-22 17:57 â€” SD Tournament Age & Grade Verification checklist shipped
**Session type:** VS Code
**ROI tag:** REVENUE
- Built `/dashboard/sd-tournament/verification` â€” mobile-friendly per-player checklist for the San Diego registration desk. Two toggles per row (Birth Cert / Grade Proof), notes field, search + team filter + "hide verified" toggle. Sorted missing-first.
- Roster pulls from existing `/api/sd-tournament` GET (Stripe sessions + Zelle records). Verification status writes client-side to new Firestore collection `teams/{TEAM_ID}/sdTournamentVerification`, keyed by paymentId. No Firebase Admin key required â€” client SDK + auth context.
- Added type `SdVerificationRecord` + helpers `getSdVerificationRecords` / `upsertSdVerification` in [src/lib/firestore-helpers.ts](../src/lib/firestore-helpers.ts).
- Re-hit the 5/20 chunk-hash bug: `bash deploy.sh` (uses `--no-build`) shipped HTML that referenced chunk hash `216-d265cd...` while uploaded chunks were `216-2d186f...`. Production URL 404'd the new route, unique deploy URL showed ChunkLoadError. Fixed by re-deploying with `npx netlify deploy --prod --build --site=...` so Netlify builds server-side and HTML+chunks stay consistent.
- Verified live: `/dashboard/sd-tournament/verification` exists and redirects unauthed â†’ `/login` (correct). New "Age & Grade Verification" link visible in SD tournament action bar. Coach login still needed to confirm checklist renders + Firestore writes succeed.

**Open items:**
- Coach needs to log in and confirm checklist UI renders correctly and toggles persist (Playwright can't auth via form per anti-pattern #2).
- `deploy.sh` `--no-build` flow is fragile when chunk hashes change. Either patch script to detect new-route/new-import case and switch to `--build`, or remove `--no-build` entirely now that Netlify Build works.
- Firebase Admin key still missing on Netlify â€” Zelle dashboard still in static-fallback mode.

**To continue:** Jonas tests the verification page live at the SD registration desk. If anything's missing (e.g. needs to filter by per-coach team, or per-player split when playerCount > 1), report back.

---
