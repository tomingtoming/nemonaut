#!/usr/bin/env bash
# Publish HEAD to https://nemonaut.toming.app: builds dist from src and uploads it.
# Refuses uncommitted changes to anything the build reads, so the deployed files always match a commit.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
rev=$(git rev-parse --short HEAD)
if [ -n "$(git status --porcelain -- src tools package.json package-lock.json wrangler.jsonc)" ]; then echo "commit src/, tools/, package files and wrangler.jsonc first" >&2; exit 1; fi
node tools/build.mjs
npx -y wrangler@4.156.0 deploy --message "nemonaut $rev"
echo "deployed $rev"
