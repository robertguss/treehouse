# Architecture

## Players and devices

Kids play on iPads (Safari/WebKit, touch); grown-ups on laptops (keyboard + mouse). The family
roster (`data/family.json`) gives each person an avatar, color, role, and device presets. Each
device remembers who it belongs to. **Presets belong to the player, not the game**: in one
shared world a grown-up gets keyboard + labeled UI while a 3-year-old gets touch + icon-only UI.

iPad Safari is the primary target: audio unlocks after the first tap; "Add to Home Screen"
gives full screen; GPU memory is the tightest budget.

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 + TypeScript 7 (strict), pnpm 12 workspaces, versions pinned in `mise.toml` |
| Rendering | React Three Fiber 9 + drei 10, three r186, Neutral tone mapping |
| State | Pure `state + actions` (`defineGame`) with immer patches; zustand for per-device UI |
| Validation | zod 4: content, network messages, saves, roster |
| Audio | Synthesized sound effects (WebAudio), no audio files |
| Hosting | Cloudflare: a Worker (site, passcode gate, roster) + one Durable Object per world |
| Local server | Node 24 running TypeScript directly with `ws` (development and tests) |
| Models | Quaternius CC0 packs → headless Blender 4.5 → gltf-transform → `library/models` |
| Tests | Vitest (logic), Playwright (desktop Chromium + iPad WebKit), Biome lint |

Every dependency is pinned exactly.

## Layout

```
data/family.json       the family roster
packages/kit/          the shared kit (below)
games/<id>/            one Vite app per game: src/rules (pure), test/, data/ (content)
apps/launcher/         home screen at /: who-are-you picker, a tile per game
apps/worker/           Cloudflare Worker + WorldRoom Durable Object (production)
apps/server/           Node server (dev/tests); its auth, connection, games, family-schema
                       modules are shared with the Worker
templates/game/        what `pnpm new-game` copies (a working shared-world starter)
templates/e2e.spec.ts  the e2e test each new game starts with
library/models/        optimized .glb models, served at /lib/models
assets/catalog.json    which source file becomes which model id
e2e/                   Playwright tests and their test servers
scripts/               new-game, site-name, deploy-cloudflare, passcode, assets, template-check
```

## The kit (`packages/kit`)

Imported by subpath, e.g. `@treehouse/kit/game`. Pure modules run on the server too.

| Module | What it does | Pure |
|---|---|---|
| `game` | `defineGame`, `action`, `reject`, `runAction`, seeded `Rng` | ✓ |
| `save` | `World` envelope, `newWorld`, `migrateWorld` (versioned saves) | ✓ |
| `net` | `RoomHost` (`net/host`), protocol (`net/protocol`), `connectNetworkRoom`, `createLocalRoom` | ✓ |
| `systems` | clock (time-derived progress, boosts, day/night), grid, inventory, movement + collisions | ✓ |
| `profile` | roster fetch, device profile, `?as` / `?input` / `?ui` overrides | |
| `input` | `ControlsLayer`, `readControls()`: floating joystick, WASD, `isTap` | |
| `ui` | `UiProvider` (`kid` / `standard`), `IconButton`, `Panel` | |
| `shell` | `GameShell`: title → playing → paused, home, sound | |
| `audio` | `sfx(name)` synthesized effects, mute, iOS unlock | |
| `assets` | typed `MODELS`, `Model`, `AnimatedModel`, `ModelInstances` (instancing) | |
| `render` | `GameCanvas` (DPR cap, adaptive), `SkyAndLights` (real clock), `FollowCamera` | |
| `room` | `useRoomState`, `useRoomStatus`, `usePeerIds` | |
| `testing` | `window.__game` hook, frame counter | |

The kit grows from real needs: when a game needs something reusable (physics, an ECS, a new
camera), it goes into the kit, so the next game starts further ahead.

## State + actions

```ts
export const game = defineGame({
  id: "my-game", version: 1, schema: State, initial,
  onJoin(draft, player, ctx) { /* set up a new player */ },
  actions: {
    tap: action<State, Input>({
      input: z.object({ ... }),
      roles: ["grownup", "big-kid"],        // optional
      apply(draft, input, ctx) { /* mutate, or reject("why") */ },
    }),
  },
});
```

- `apply` mutates an immer draft; the kit returns the new state and patches.
- `ctx.now` / `ctx.rng` are injected. Rules never read the clock or `Math.random`.
- Things that change over time store timestamps; current values are pure functions of the
  clock, so worlds keep living in real time without ticking.
- Games talk to a `Room` (`getState`, `dispatch`, `now`, `sendPresence`, `getPeers`,
  `subscribe`). `createLocalRoom` runs in the browser (`?local`); `connectNetworkRoom` joins a
  shared world. Game code is the same either way.

## Multiplayer

- Clients connect to `/ws?game=<id>&world=<world>`. On Cloudflare the Worker routes that to the
  world's Durable Object; locally the Node server's `Rooms` does the same.
- Both run the same `RoomHost` and the same per-socket protocol (`apps/server/src/connection.ts`).
- **World actions are server-authoritative**: validated, checked against the member's role from
  the roster (never from the client), applied with server time, patches broadcast.
- **Movement is client-authoritative**: presence (zone, position, facing, animation) is sent on
  change plus a 1-second heartbeat, relayed to others, smoothed on screen.
- Saves: Durable Object storage on Cloudflare, JSON files locally. Versioned, migrated on load;
  a save that can't load is kept aside, never overwritten.
- Access: one family passcode per device (long-lived httpOnly cookie).

## Agents

- `AGENTS.md` is the law; `CLAUDE.md` points to it. Skills: `new-game`, `add-asset`, `playtest`.
- `pnpm verify` (typecheck, lint, unit, build, Playwright) must pass; `pnpm e2e:worker` runs
  the browser tests against the Worker; `pnpm template:check` proves a freshly generated game
  passes everything.
- Agents see the game through screenshots in `test-results/screens/` (iPad and desktop) and
  drive it through `window.__game`, not pixel guessing.

## Ideas the kit doesn't have yet

Physics (Rapier), an ECS (koota), offline play (service worker), kid-made assets (photographed
drawings, recorded sounds), a remix editor for kids to tune game data, level editors.
