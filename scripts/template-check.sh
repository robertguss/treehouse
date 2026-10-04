#!/usr/bin/env bash
# Proves the template still works: copies the repo to a scratch folder, creates a game with
# `pnpm new-game`, and runs the full verification against both the Node server and the
# Cloudflare Worker (locally). Run after changing the kit, templates, server, or worker.
#
#   pnpm template:check
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

rsync -a --exclude node_modules --exclude dist --exclude test-results --exclude .git \
  --exclude .agent_sources --exclude assets-src --exclude .wrangler "$repo/" "$scratch/"
cd "$scratch"
git init -q

pnpm install --frozen-lockfile=false >/dev/null
pnpm new-game check-game "Check Game" 🧪
pnpm install >/dev/null
pnpm fix >/dev/null
pnpm verify
mkdir -p "$repo/test-results" && rm -rf "$repo/test-results/template-check"
cp -r test-results/screens "$repo/test-results/template-check"
pnpm e2e:worker
echo "template:check passed (screenshots in test-results/template-check/)"
