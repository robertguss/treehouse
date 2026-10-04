#!/usr/bin/env bash
# Builds the site and deploys Treehouse to Cloudflare (Worker + Durable Objects + assets).
# The passcode hash and session secret come from the same env file the Node server uses
# (~/.config/treehouse/server.env), so the family passcode is the same everywhere.
#
#   pnpm deploy:cf
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$HOME/.config/treehouse/server.env"
if [[ ! -f "$env_file" ]]; then
  echo "No passcode yet. Run: pnpm passcode:set --generate" >&2
  exit 1
fi

if grep -q '"name": "change-me"' "$repo/apps/worker/wrangler.jsonc"; then
  echo 'Pick a site name first: pnpm site:name <name>  (it becomes https://<name>.<account>.workers.dev)' >&2
  exit 1
fi

cd "$repo"
pnpm build

cd apps/worker
pnpm exec wrangler deploy

# Secrets: re-sent every deploy so a passcode change is picked up.
node -e '
  const fs = require("fs");
  const env = Object.fromEntries(
    fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean).map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
  );
  process.stdout.write(JSON.stringify({ PASSCODE_HASH: env.TREEHOUSE_PASSCODE_HASH, SECRET: env.TREEHOUSE_SECRET }));
' "$env_file" | pnpm exec wrangler secret bulk
