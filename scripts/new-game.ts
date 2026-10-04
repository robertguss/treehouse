// Creates a new game from templates/game and registers it everywhere:
// the launcher tile, the server's game registry (Node and Cloudflare), and an e2e test.
//
//   pnpm new-game <id> "<Title>" <emoji>
//   pnpm new-game space-race "Space Race" 🚀
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [id, title, emoji = "🎮"] = process.argv.slice(2);
if (!id || !title || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  console.error(
    'Usage: pnpm new-game <id> "<Title>" <emoji>   (id: lowercase letters, digits, dashes)',
  );
  process.exit(1);
}
const target = join(root, "games", id);
if (existsSync(target)) {
  console.error(`games/${id} already exists`);
  process.exit(1);
}

const fillText = (text: string) =>
  text.replaceAll("__NAME__", id).replaceAll("__TITLE__", title).replaceAll("__EMOJI__", emoji);

// 1. The game package.
cpSync(join(root, "templates/game"), target, { recursive: true });
const fill = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) fill(path);
    else writeFileSync(path, fillText(readFileSync(path, "utf8")));
  }
};
fill(target);

// 2. Its e2e test.
writeFileSync(
  join(root, "e2e", `${id}.spec.ts`),
  fillText(readFileSync(join(root, "templates/e2e.spec.ts"), "utf8")),
);

// 3. Registrations at the `// new-game:` markers.
function insertAt(file: string, marker: string, line: string): void {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const at = text.indexOf(`// new-game: ${marker}`);
  if (at === -1) throw new Error(`${file} is missing the "// new-game: ${marker}" marker`);
  const lineStart = text.lastIndexOf("\n", at) + 1;
  const indent = text.slice(lineStart, at);
  writeFileSync(path, `${text.slice(0, lineStart)}${indent}${line}\n${text.slice(lineStart)}`);
}

const ident = `${id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())}Game`;
const colors = ["#7cc46a", "#f2a65a", "#5cb8ff", "#c38bff", "#ff8a5c", "#2bb5b5", "#e84f6a"];
const color = colors[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];

insertAt(
  "apps/launcher/src/games.ts",
  "entries",
  `{ id: ${JSON.stringify(id)}, title: ${JSON.stringify(title)}, emoji: ${JSON.stringify(emoji)}, color: ${JSON.stringify(color)}, world: { game: ${JSON.stringify(id)}, world: "family" } },`,
);
insertAt(
  "apps/server/src/games.ts",
  "imports",
  `import { game as ${ident} } from "@treehouse/${id}/rules";`,
);
insertAt("apps/server/src/games.ts", "registry", `${JSON.stringify(id)}: ${ident},`);
insertAt("apps/server/src/games.ts", "listed", `{ game: ${JSON.stringify(id)}, world: "family" },`);

const serverPackage = join(root, "apps/server/package.json");
const pkg = JSON.parse(readFileSync(serverPackage, "utf8")) as {
  dependencies: Record<string, string>;
};
pkg.dependencies[`@treehouse/${id}`] = "workspace:*";
pkg.dependencies = Object.fromEntries(
  Object.entries(pkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(serverPackage, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Created games/${id} and registered it (launcher, server, e2e/${id}.spec.ts). Next:
  1. pnpm install && pnpm fix
  2. Write docs/games/${id}.md (the idea, who plays, controls, what done looks like)
  3. pnpm verify   (then look at test-results/screens/)
  4. Replace the example sheep with your game, test by test.`);
