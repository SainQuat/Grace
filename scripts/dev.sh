#!/usr/bin/env bash
set -euo pipefail

port="${CONDUCTOR_PORT:-${PORT:-3000}}"

if [ -f package.json ]; then
  export CONDUCTOR_PORT="$port"
  export PORT="$port"

  if [ -f pnpm-lock.yaml ]; then
    exec pnpm run dev
  fi

  if [ -f yarn.lock ]; then
    exec yarn dev
  fi

  exec npm run dev
fi

echo "No app entrypoint yet. Add package.json or another dev command, then update scripts/dev.sh."
