#!/usr/bin/env bash
set -euo pipefail

# Load deploy config
if [ ! -f .env.deploy ]; then
  echo "ERROR: .env.deploy not found. Run from project root."
  exit 1
fi

source .env.deploy

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
npx netlify build

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
