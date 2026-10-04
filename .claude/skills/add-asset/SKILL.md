---
name: add-asset
description: Add 3D models to the shared Treehouse library from the Quaternius packs (or another CC0 pack) - catalog entry, fetch, Blender conversion, typed manifest. Use when a game needs a model that isn't in packages/kit/src/assets/manifest.gen.ts.
---

# Add a model to the library

Models are never referenced by path. They live in `library/models/` and are used by typed
id from `packages/kit/src/assets/manifest.gen.ts` (e.g. `<Model model="nature/tree_1" />`).

1. **Check the manifest first** - the model may already exist.
2. **Stay in style.** Prefer the Quaternius packs already listed in `assets/catalog.json`
   (`packs`). A new pack must be CC0 and flat-shaded low-poly; add it to `packs` and to
   `CREDITS.md`.
3. **Find the file.** The pack folders are public Google Drive folders. `uvx gdown --folder
   <url> -O /tmp/x` lists every file with its Drive id (it may stop downloading after ~20
   files; the listing is what you need).
4. **Add a catalog entry** to `assets/catalog.json` → `models`:
   `{ "id": "<category>/<name>", "pack": "<pack key>", "source": "<pack>/<folder>/<file>", "drive": "<file id>" }`.
   Add `"scale"` if the model isn't in meters (check `size` in the build output; a character
   is ~2 tall, a cow ~2.6 long, a crop ~1). Rigged animals in the Farm Animal Pack are 5–10 units long in the source.
5. **Build:** `pnpm assets:fetch` (downloads missing sources into gitignored `assets-src/`)
   then `pnpm assets:build` (Blender headless at `~/.local/opt/blender-4.5.14-linux-x64`,
   gltf-transform, regenerates the manifest). Commit `library/models/...`, the catalog, and
   `manifest.gen.ts`.
6. **Look at it** in a game and in a screenshot before calling it done: size, color, and
   facing direction (models face +z).
