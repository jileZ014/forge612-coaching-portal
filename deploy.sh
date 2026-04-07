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

# Delegate to shared deploy script
bash /c/Users/jange/Projects/.shared/deploy-netlify.sh
