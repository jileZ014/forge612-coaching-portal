# forge612-coaching-portal session log

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
