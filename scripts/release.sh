#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 0.1.0" >&2
  exit 1
fi

version="${1#v}"
tag="v$version"

case "$tag" in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *)
    echo "Version must look like 0.1.0 or v0.1.0, got: $1" >&2
    exit 1
    ;;
esac

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes; commit or stash before tagging." >&2
  exit 1
fi

git fetch origin main --tags

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Tag already exists: $tag" >&2
  exit 1
fi

git tag -a "$tag" -m "$tag"
git push origin "$tag"

echo "Pushed $tag. GitHub Actions will create the release."
