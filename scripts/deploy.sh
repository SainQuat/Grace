#!/usr/bin/env bash
set -euo pipefail

app_env="${APP_ENV:-staging}"

if [ -z "${DEPLOY_WEBHOOK_URL:-}" ]; then
  echo "DEPLOY_WEBHOOK_URL is not configured for $app_env; skipping deploy."
  exit 0
fi

payload=$(
  cat <<JSON
{
  "environment": "$app_env",
  "ref": "${GITHUB_DEPLOY_REF:-}",
  "sha": "${GITHUB_DEPLOY_SHA:-}"
}
JSON
)

curl --fail --show-error --silent \
  --request POST \
  --header "Content-Type: application/json" \
  --data "$payload" \
  "$DEPLOY_WEBHOOK_URL"

echo "Deployment webhook sent for $app_env."
