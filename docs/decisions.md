# Decisions

Dated log of decisions for the Treehouse starter kit. Newest first. Each game made from the
template keeps its own log here too: add entries above these.

## 2026-10-04 — Template repo

The kit was extracted from the first game (Cozy Farm, now `robertguss/cozy-farm`) into this
template. **Each game is its own repo** made from the template, with its own Cloudflare site.
`pnpm new-game` generates a working shared-world starter and registers it in the launcher, the
server's game registry (Node and Cloudflare), and the e2e suite. `pnpm template:check` proves
that still works after changes to the template.

## 2026-10-03 — Production on Cloudflare

- The Worker serves the built site (static assets, `run_worker_first` so the passcode gate covers
  everything), the roster, and backups (`/api/export`). Each shared world is a `WorldRoom`
  Durable Object running the kit's `RoomHost`, saving to Durable Object storage after every
  change.
- The per-socket protocol lives in `apps/server/src/connection.ts`, used by both the Node
  server and the Durable Object, so there is one code path. Auth uses `node:crypto` via
  `nodejs_compat`.
- Sockets use plain `accept()`, not the Hibernation API. Presence is sent on change plus a
  1-second heartbeat, so idle devices barely talk.
- `data/family.json` is bundled into the Worker: edits need `pnpm deploy:cf`.
- Wrong passcodes wait one second on Cloudflare (isolates don't share memory); add a WAF
  rate-limit rule for more.
- `wrangler login --device` is the way to log in from a remote VM; the localhost callback can't
  reach it.

## 2026-10-03 — Assets

- Quaternius flat-shaded CC0 packs only (their textured building packs clash). Build simple
  structures from primitives and tint them instead.
- Google Drive throttles bulk downloads, so `assets/catalog.json` stores each file's Drive id and
  `pnpm assets:fetch` downloads one at a time.
- The packs' base colors are very dark: the build multiplies them by 3 (max channel 0.85),
  which keeps hue and saturation. A gamma lift washes everything out.
- Neutral tone mapping, not R3F's default ACES (which darkens midtones).
- Measure model sizes before quantizing (quantization hides rigged meshes' size). Farm animals
  are 5–10 units long in the source; the catalog scales them to meters.
- Quantization only (no meshopt/Draco), so the client needs no decoder. Unused animation clips
  are dropped.

## 2026-10-03 — Kit and engineering choices

- React Three Fiber over vanilla three.js (React overlays, drei, agents write it well).
- Pure rules shared by client, server, and tests, rather than Elixir or Colyseus, which would
  duplicate the rules in a second language or state model.
- Synthesized sounds instead of audio files (nothing to license; unlocks on the first gesture).
- `GameCanvas` passes stable `camera`/`gl` objects: inline objects are re-applied on every
  re-render and reset the camera.
- No service worker yet: it would risk stale code on iPads after deploys. Add one when a game
  must work offline.
- The login rate limiter (Node) counts only wrong passcodes.
- Headless WebGL in tests is software-rendered: wait on game state through `window.__game`,
  never fixed sleeps; the test timeout is 60 s.
- Biome's `noStaticElementInteractions` is off for games, the kit, and templates (it mistakes
  R3F elements like `<mesh>` for HTML).
