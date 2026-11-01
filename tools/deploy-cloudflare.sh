#!/usr/bin/env bash
# Publish a committed revision (default HEAD) of dist/ to https://omnivehicle.toming.app.
# Refuses a dirty dist/ or wrangler.jsonc so the deployed files always match a commit.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
rev=$(git rev-parse --short "${1:-HEAD}")
if [ -n "$(git status --porcelain -- dist wrangler.jsonc)" ]; then echo "commit dist/ and wrangler.jsonc first" >&2; exit 1; fi
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
git archive "$rev" dist wrangler.jsonc | tar -x -C "$out"
(cd "$out" && npx -y wrangler@4.156.0 deploy --message "orbital-foundry $rev")
echo "deployed $rev"
