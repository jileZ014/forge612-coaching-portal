#!/usr/bin/env bash
set -euo pipefail

# Load deploy config. Optional tenant arg selects .env.deploy.<tenant>
# (e.g. `bash deploy.sh yoties` -> .env.deploy.yoties). No arg = AZ Flight.
TENANT="${1:-}"
if [ -n "$TENANT" ]; then
  DEPLOY_FILE=".env.deploy.$TENANT"
else
  DEPLOY_FILE=".env.deploy"
fi

if [ ! -f "$DEPLOY_FILE" ]; then
  echo "ERROR: $DEPLOY_FILE not found. Run from project root."
  exit 1
fi

source "$DEPLOY_FILE"

# Guard: the compiled team-config MUST match the site we are about to deploy to.
# Deploying an AZ Flight build to the Yoties site (or vice versa) would put one
# club's branding, coach email and Firebase project in front of another club.
ACTIVE_TEAM=$(node -e "process.stdout.write(require('./team-config.json').teamId)")
if [ -n "${EXPECTED_TEAM_ID:-}" ] && [ "$ACTIVE_TEAM" != "$EXPECTED_TEAM_ID" ]; then
  echo "ERROR: tenant mismatch."
  echo "  team-config.json is : $ACTIVE_TEAM"
  echo "  $DEPLOY_FILE expects: $EXPECTED_TEAM_ID"
  echo "  Run: npm run use:<tenant>  before deploying."
  exit 1
fi
echo "  TENANT:    ${ACTIVE_TEAM}"

echo "========================================"
echo "  DEPLOYING: ${PROJECT_NAME}"
echo "  PLATFORM:  ${DEPLOY_PLATFORM}"
echo "  SITE ID:   ${NETLIFY_SITE_ID}"
echo "  DOMAIN:    ${EXPECTED_DOMAIN}"
echo "========================================"

# Verify global state is clean
GLOBAL_STATE="$HOME/.netlify/state.json"
if [ -f "$GLOBAL_STATE" ]; then
  CONTENT=$(cat "$GLOBAL_STATE" | tr -d '[:space:]')
  if [ "$CONTENT" != "{}" ] && [ "$CONTENT" != "" ]; then
    echo "ERROR: Global ~/.netlify/state.json is not empty!"
    exit 1
  fi
fi

# Build via `netlify build` so @netlify/plugin-nextjs repackages the SSR handler
# (.netlify/functions-internal/___netlify-server-handler) from THIS build.
# Chunk hashes change on every build — deploying a handler left over from an
# older build makes its HTML reference _next chunks that no longer exist
# (404 / ChunkLoadError on every page). This is exactly what broke /dashboard
# on 2026-07-14: handler packaged 07-13, static chunks newer.
echo ">>> Building via netlify build (npm run build + Next runtime packaging)..."
# Scope the build to THIS tenant's site without `netlify link`, which would write
# to the global state.json the guard above forbids.
export NETLIFY_SITE_ID="${NETLIFY_SITE_ID}"
#
# NOT --offline. NEXT_PUBLIC_* values are inlined into the bundle at BUILD time, and
# offline mode skips fetching the site's env vars — so the local .env.local (whichever
# tenant that happens to be) gets baked in instead. That shipped an AZ-Flight-pointed
# bundle to the Yoties site on 2026-08-12. Online build injects the correct site env,
# which Next.js prefers over .env files.
npx netlify build

# Guard: the Firebase project baked into the bundle MUST be this tenant's.
EXPECTED_FB=$(node -e "process.stdout.write(require('./team-config.json').firebaseProject)")
if [ -n "$EXPECTED_FB" ]; then
  if grep -rqs "flight-pay-az\|yoties-flag-football" .next/server 2>/dev/null; then
    WRONG=$(grep -rhos "flight-pay-az\|yoties-flag-football" .next/server 2>/dev/null | sort -u | grep -v "^${EXPECTED_FB}$" || true)
    if [ -n "$WRONG" ]; then
      echo "ERROR: build contains a FOREIGN Firebase project id: $WRONG"
      echo "       expected only: $EXPECTED_FB"
      echo "       This would point one club's portal at another club's data. Aborting."
      exit 1
    fi
  fi
  echo "  BAKED FIREBASE PROJECT: $EXPECTED_FB (verified)"
fi

# Copy static files + public assets into .next for Netlify CDN
# (kept from the pre-plugin era as a fallback; harmless if redundant)
echo ">>> Preparing static assets..."
rm -rf .next/_next
mkdir -p .next/_next
cp -r .next/static .next/_next/static
cp -r public/* .next/

# Deploy pre-built output (--no-build skips the broken Windows plugin)
echo ">>> Deploying to Netlify..."
npx netlify deploy --prod --no-build --site="${NETLIFY_SITE_ID}"

echo ""
echo "Deploy complete! Verify at: https://${EXPECTED_DOMAIN}"
