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

# Next.js with API routes needs --build flag (Netlify builds + deploys with Next.js runtime)
npx netlify deploy --build --prod --site="${NETLIFY_SITE_ID}"

echo ""
echo "Deploy complete! Verify at: https://${EXPECTED_DOMAIN}"
