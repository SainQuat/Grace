#!/usr/bin/env bash
set -euo pipefail

if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then
    corepack enable
    pnpm install --frozen-lockfile
    exit 0
  fi

  if [ -f yarn.lock ]; then
    corepack enable
    yarn install --immutable
    exit 0
  fi

  if [ -f package-lock.json ]; then
    npm ci
    exit 0
  fi

  npm install
  exit 0
fi

echo "No app manifest yet; setup complete."
