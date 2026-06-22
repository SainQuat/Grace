#!/usr/bin/env bash
set -euo pipefail

found_manifest=false

has_node_script() {
  node -e "const scripts = require('./package.json').scripts || {}; process.exit(scripts[process.argv[1]] ? 0 : 1)" "$1"
}

run_node_script_if_present() {
  local package_manager="$1"
  local script_name="$2"

  if has_node_script "$script_name"; then
    "$package_manager" run "$script_name"
  else
    echo "No npm script named '$script_name'; skipping."
  fi
}

run_node_checks() {
  found_manifest=true

  if [ -f pnpm-lock.yaml ]; then
    corepack enable
    pnpm install --frozen-lockfile
    run_node_script_if_present pnpm lint
    run_node_script_if_present pnpm test
    run_node_script_if_present pnpm build
    run_node_script_if_present pnpm build:web
    return
  fi

  if [ -f yarn.lock ]; then
    corepack enable
    yarn install --immutable
    run_node_script_if_present yarn lint
    run_node_script_if_present yarn test
    run_node_script_if_present yarn build
    run_node_script_if_present yarn build:web
    return
  fi

  if [ -f package-lock.json ]; then
    npm ci
  else
    npm install
  fi

  run_node_script_if_present npm lint
  run_node_script_if_present npm test
  run_node_script_if_present npm build
  run_node_script_if_present npm build:web
}

run_python_checks() {
  found_manifest=true
  python -m pip install --upgrade pip

  if [ -f requirements.txt ]; then
    python -m pip install -r requirements.txt
  fi

  if [ -f pyproject.toml ]; then
    python -m pip install -e ".[dev]" || python -m pip install -e .
  fi

  if command -v pytest >/dev/null 2>&1; then
    pytest
  else
    echo "pytest not available; skipping Python tests."
  fi
}

if [ -f package.json ]; then
  run_node_checks
fi

if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  run_python_checks
fi

if [ "$found_manifest" = false ]; then
  echo "No project manifest yet; scaffold checks passed."
fi
