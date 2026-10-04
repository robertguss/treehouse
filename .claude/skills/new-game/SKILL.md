---
name: new-game
description: Start a new game in a Treehouse repo - spec first, then scaffold with pnpm new-game, then grow the starter into the game test by test. Use when asked to make, start, or prototype a game.
---

# New game

1. **Spec first.** Write `docs/games/<id>.md` (format in `docs/games/README.md`): the idea, who
   plays on which devices, touch and keyboard controls, roles, what "done" looks like, what's
   out of scope. Ask the user one question at a time when unclear.
2. **Scaffold:** `pnpm new-game <id> "<Title>" <emoji>`, then `pnpm install && pnpm fix`.
   This creates `games/<id>` (a working shared-world starter: tap the sheep, the count is
   shared), and registers it in `apps/launcher/src/games.ts`, `apps/server/src/games.ts`
   (Node and Cloudflare), and `e2e/<id>.spec.ts`.
3. **Check the starter passes** before changing anything: `pnpm verify`.
4. **Grow it, test by test:**
   - Rules in `games/<id>/src/rules` with unit tests in `games/<id>/test` (pure; `ctx.now`,
     `ctx.rng`, `roles`, `reject`). Bump `version` and add a migration when the state shape
     changes after anyone has played.
   - Content in `games/<id>/data/*.json`, validated with zod.
   - Scene and HUD from the kit: `GameShell`, `GameCanvas`, `SkyAndLights`, `FollowCamera`,
     `ControlsLayer` + `readControls`, `Model`/`AnimatedModel`/`ModelInstances`, `sfx`,
     `IconButton`/`Panel`, `useRoomState`. For a bigger example (zones, inventories, shops,
     movement, other players), read `robertguss/cozy-farm`.
   - Extend `e2e/<id>.spec.ts`: drive the game through `window.__game`, save screenshots.
   - Single-player only? Use `createLocalRoom` and remove the game from the server registry
     and the launcher's `world` field.
5. **Verify and look:** `pnpm verify` and `pnpm e2e:worker`, then read the screenshots in
   `test-results/screens/` for iPad and desktop.
6. **Deploy** when the user asks: `pnpm deploy:cf` (see `docs/FIRST-DEPLOY.md` the first time).
