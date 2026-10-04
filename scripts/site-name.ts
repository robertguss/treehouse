// Sets the Cloudflare Worker name, which becomes the site's address:
// https://<name>.<your-account>.workers.dev
//
//   pnpm site:name space-race
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!name || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(name) || name === "change-me") {
  console.error("Usage: pnpm site:name <name>   (lowercase letters, digits, dashes)");
  process.exit(1);
}
const path = join(
  resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  "apps/worker/wrangler.jsonc",
);
const text = readFileSync(path, "utf8");
const updated = text.replace(/"name": "[^"]*",/, `"name": "${name}",`);
if (updated === text && !text.includes(`"name": "${name}",`)) {
  console.error("Could not find the name field in apps/worker/wrangler.jsonc");
  process.exit(1);
}
writeFileSync(path, updated);
console.log(`Site name set to "${name}". Deploy with: pnpm deploy:cf`);
