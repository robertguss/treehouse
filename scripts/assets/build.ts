// Builds the shared model library from the asset catalog.
//
//   pnpm assets:build
//
// assets/catalog.json  → which source file becomes which library id (committed)
// assets-src/          → raw packs (gitignored; pnpm assets:fetch downloads them)
// library/models/      → optimized .glb files served at /lib/models/ (committed)
// packages/kit/src/assets/manifest.gen.ts → typed ids, clip names, and sizes (committed)
//
// .blend/.fbx sources go through Blender (headless) first; .gltf/.glb are read directly.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Logger, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, prune, quantize, resample, weld } from "@gltf-transform/functions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const catalogPath = join(root, "assets/catalog.json");
const sourceDir = join(root, "assets-src");
const convertedDir = join(sourceDir, ".converted");
const libraryDir = join(root, "library/models");
const manifestPath = join(root, "packages/kit/src/assets/manifest.gen.ts");
const blender =
  process.env.BLENDER ??
  join(process.env.HOME ?? "", ".local/opt/blender-4.5.14-linux-x64/blender");

interface CatalogEntry {
  id: string;
  source: string;
  pack: string;
  drive?: string;
  /** Uniform scale applied at build time, so every model is in meters. */
  scale?: number;
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
  models: CatalogEntry[];
  /**
   * The packs store very dark base colors (they were lit very brightly when rendered).
   * Colors are multiplied by `scale` at build time, keeping hue and saturation, but never
   * pushed past `maxChannel` so whites stay white rather than glowing.
   */
  colorBoost?: { scale: number; maxChannel: number };
  /** Id prefix → animation clips to keep; others are dropped to keep files small. */
  keepClips?: Record<string, string[]>;
};
const flat = (id: string) => id.replaceAll("/", "__");

// 1. Convert .blend/.fbx sources with one Blender run.
const needsBlender = catalog.models.filter((entry) => {
  if (!/\.(blend|fbx)$/i.test(entry.source)) return false;
  const source = join(sourceDir, entry.source);
  if (!existsSync(source)) throw new Error(`missing source ${entry.source}; run pnpm assets:fetch`);
  const converted = join(convertedDir, `${flat(entry.id)}.glb`);
  return !existsSync(converted) || statSync(converted).mtimeMs < statSync(source).mtimeMs;
});
if (needsBlender.length > 0) {
  console.log(`converting ${needsBlender.length} files with Blender…`);
  const staging = join(convertedDir, "staging");
  mkdirSync(staging, { recursive: true });
  const output = execFileSync(
    blender,
    [
      "-b",
      "--factory-startup",
      "--python",
      join(root, "scripts/assets/blend_to_glb.py"),
      "--",
      staging,
      ...needsBlender.map((entry) => join(sourceDir, entry.source)),
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  for (const line of output.split("\n")) if (/^(OK|SKIP)/.test(line)) console.log(`  ${line}`);
  for (const entry of needsBlender) {
    const base =
      entry.source
        .split("/")
        .pop()
        ?.replace(/\.(blend|fbx)$/i, "") ?? "";
    const staged = join(staging, `${base}.glb`);
    if (!existsSync(staged)) throw new Error(`Blender did not produce ${staged}`);
    writeFileSync(join(convertedDir, `${flat(entry.id)}.glb`), readFileSync(staged));
  }
}

// 2. Optimize into the library and collect metadata.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const manifest: Record<string, { url: string; clips: string[]; size: [number, number, number] }> =
  {};

for (const entry of catalog.models) {
  const input = /\.(blend|fbx)$/i.test(entry.source)
    ? join(convertedDir, `${flat(entry.id)}.glb`)
    : join(sourceDir, entry.source);
  const document = await io.read(input);
  document.setLogger(new Logger(Logger.Verbosity.WARN));
  const keep = Object.entries(catalog.keepClips ?? {}).find(([prefix]) =>
    entry.id.startsWith(prefix),
  )?.[1];
  if (keep) {
    for (const animation of document.getRoot().listAnimations()) {
      if (!keep.includes(animation.getName())) animation.dispose();
    }
  }
  const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
  if (!scene) throw new Error(`${entry.id} has no scene`);

  if (entry.scale && entry.scale !== 1) {
    for (const node of scene.listChildren()) {
      const [x, y, z] = node.getScale();
      node.setScale([x * entry.scale, y * entry.scale, z * entry.scale]);
      const [tx, ty, tz] = node.getTranslation();
      node.setTranslation([tx * entry.scale, ty * entry.scale, tz * entry.scale]);
    }
  }

  const boost = catalog.colorBoost;
  if (boost) {
    for (const material of document.getRoot().listMaterials()) {
      const [r, g, b, a] = material.getBaseColorFactor();
      const brightest = Math.max(r, g, b, 1e-6);
      const scale = Math.max(1, Math.min(boost.scale, boost.maxChannel / brightest));
      material.setBaseColorFactor([r * scale, g * scale, b * scale, a]);
    }
  }

  // Measure before quantizing: quantization moves scale into skins, which getBounds can't see.
  const bounds = getBounds(scene);
  await document.transform(dedup(), prune(), weld(), resample(), quantize());

  const size = [0, 1, 2].map(
    (axis) => Math.round(((bounds.max[axis] ?? 0) - (bounds.min[axis] ?? 0)) * 100) / 100,
  ) as [number, number, number];
  const clips = document
    .getRoot()
    .listAnimations()
    .map((animation) => animation.getName())
    .sort();

  const target = join(libraryDir, `${entry.id}.glb`);
  mkdirSync(dirname(target), { recursive: true });
  await io.write(target, document);
  manifest[entry.id] = { url: `/lib/models/${entry.id}.glb`, clips, size };
  console.log(
    `  ${entry.id.padEnd(28)} ${(statSync(target).size / 1024).toFixed(0).padStart(5)} KB  size=${size.join("×")}  clips=${clips.length}`,
  );
}

// 3. Typed manifest.
const lines = [
  "// Generated by scripts/assets/build.ts from assets/catalog.json. Do not edit.",
  "",
  "export const MODELS = {",
  ...Object.entries(manifest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([id, info]) =>
        `  ${JSON.stringify(id)}: { url: ${JSON.stringify(info.url)}, clips: ${JSON.stringify(info.clips)}, size: ${JSON.stringify(info.size)} },`,
    ),
  "} as const;",
  "",
  "export type ModelId = keyof typeof MODELS;",
  "",
];
writeFileSync(manifestPath, lines.join("\n"));
console.log(`wrote ${Object.keys(manifest).length} models to the manifest`);
