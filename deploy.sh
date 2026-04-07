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

# Build with webpack (Turbopack chunk names cause issues on Netlify CDN)
echo ">>> Building..."
npm run build

# Copy static files to _next path (Netlify plugin onPostBuild fails on Windows)
echo ">>> Fixing static asset paths..."
rm -rf .next/_next
mkdir -p .next/_next
cp -r .next/static .next/_next/static

# Regenerate Netlify server function from webpack build
echo ">>> Regenerating server function..."
rm -rf .netlify/functions-internal .netlify/edge-functions .netlify/blobs
npx netlify deploy --prod --site="${NETLIFY_SITE_ID}" 2>&1 | grep -v "^$" | tail -5 || true

# Deploy pre-built output (--no-build to skip broken Windows plugin)
echo ">>> Deploying to Netlify..."
npx netlify deploy --prod --no-build --site="${NETLIFY_SITE_ID}"

echo ""
echo "Deploy complete! Verify at: https://${EXPECTED_DOMAIN}"
