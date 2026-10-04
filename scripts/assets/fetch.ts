// Downloads the raw source files named in assets/catalog.json into assets-src/.
// Only needed to rebuild or add models; the built library is committed.
//
//   pnpm assets:fetch
//
// Files are fetched one at a time from the packs' public Google Drive folders, slowly,
// because Drive throttles bursts. Entries without a file id fall back to downloading the
// whole pack folder with gdown (via uvx).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceDir = join(root, "assets-src");

interface Catalog {
  packs: Record<string, { name: string; driveFolder: string }>;
  models: { id: string; pack: string; source: string; drive?: string }[];
}
const catalog = JSON.parse(readFileSync(join(root, "assets/catalog.json"), "utf8")) as Catalog;

const present = (path: string) => existsSync(path) && statSync(path).size > 1000;
const wholePacks = new Set<string>();

for (const model of catalog.models) {
  const target = join(sourceDir, model.source);
  if (present(target)) continue;
  if (!model.drive) {
    wholePacks.add(model.pack);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(
      `https://drive.usercontent.google.com/download?id=${model.drive}&export=download&confirm=t`,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.ok && !bytes.subarray(0, 15).toString().toLowerCase().includes("<!doctype")) {
      writeFileSync(target, bytes);
      console.log(`got ${model.source}`);
      break;
    }
    if (attempt === 5) throw new Error(`could not download ${model.source}`);
    await sleep(5000 * attempt);
  }
  await sleep(1500);
}

for (const pack of wholePacks) {
  const info = catalog.packs[pack];
  if (!info) throw new Error(`unknown pack ${pack}`);
  console.log(`downloading the whole ${info.name} folder with gdown…`);
  execFileSync(
    "uvx",
    [
      "gdown",
      "--folder",
      `https://drive.google.com/drive/folders/${info.driveFolder}`,
      "-O",
      join(sourceDir, pack),
    ],
    { stdio: "inherit" },
  );
}
console.log("sources ready");
