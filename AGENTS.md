# Agent rules

This repo is a family 3D game made from the **Treehouse** starter kit (or the kit template
itself, if `games/` is empty). Kids play on their own iPads in Safari; grown-ups on laptops.
Agents write all the code. Read `docs/ARCHITECTURE.md` first, then the game's design in
`docs/games/`, and `docs/decisions.md` for why things are the way they are.

## Layout

| Path | What |
|---|---|
| `games/<id>` | A game: `src/rules` (pure rules), `test/` (rule tests), `src/main.tsx` (scene + HUD), `data/` (content JSON). |
| `packages/kit` | The shared kit, imported by subpath (`@treehouse/kit/game`, `/net`, `/input`, …). |
| `apps/launcher` | Home screen at `/`: who-are-you picker, a tile per game (`src/games.ts`), PWA manifest. |
| `apps/worker` | **Production**: Cloudflare Worker + `WorldRoom` Durable Object per shared world. |
| `apps/server` | Node server for development and tests. `auth`, `connection`, `games`, `family-schema` are shared with the Worker, so keep them free of Node-only APIs except `node:crypto`. |
| `data/family.json` | The family roster: names, avatars, colors, roles, device presets. |
| `assets/catalog.json`, `library/models` | Model sources and the built model library. |
| `templates/` | What `pnpm new-game` copies. Changing them? Run `pnpm template:check`. |
| `e2e/` | Playwright tests; each game has `e2e/<id>.spec.ts`. |

## Commands

Tools are pinned in `mise.toml`. If `pnpm`/`node` aren't on PATH: `mise exec -- pnpm <command>`.

| Command | Does |
|---|---|
| `pnpm new-game <id> "<Title>" <emoji>` | New game from the template, registered in the launcher, server, and e2e |
| `pnpm verify` | Typecheck, lint, unit tests, build, Playwright. **Must pass before work is done.** |
| `pnpm verify:fast` | Typecheck, lint, unit tests (the pre-commit hook) |
| `pnpm e2e:worker` | The Playwright suite against the Cloudflare Worker in `wrangler dev` |
| `pnpm fix` | Format and apply safe lint fixes |
| `pnpm --filter @treehouse/<id> dev` | Vite dev server for a game (needs `pnpm dev:server` for shared worlds, or use `?local`) |
| `pnpm deploy:cf` | Deploy to Cloudflare: build, `wrangler deploy`, upload passcode secrets |
| `pnpm site:name <name>` | Set the Cloudflare site name (`https://<name>.<account>.workers.dev`) |
| `pnpm passcode:set "<words>"` / `--generate` | Set the family passcode (then `pnpm deploy:cf`) |
| `pnpm assets:fetch` / `pnpm assets:build` | Download raw model packs / rebuild `library/models` and the manifest |
| `pnpm template:check` | Generate a game in a scratch copy and run everything against it |
| `pnpm sources:fetch` | Clone pinned library sources into `.agent_sources/` |

Skills in `.claude/skills/`: `new-game`, `add-asset`, `playtest`.

## Rules

- **Spec before code.** A game starts as `docs/games/<id>.md` (see `docs/games/README.md`). Ask
  the user one question at a time when something is unclear.
- **Verify before done.** `pnpm verify`, then look at `test-results/screens/` on both
  `desktop-chromium` and `ipad-webkit`. Passing tests aren't proof it looks right. After changes
  to the server, worker, or protocol, also run `pnpm e2e:worker`.
- **Never bypass hooks** (`--no-verify`) or weaken a test to make it pass.
- **Exact versions only** (`--save-exact`); upgrades are their own commit, noted in
  `docs/decisions.md`.
- **iPad first.** Touch alone must be enough: big targets, a visible way home (the shell gives
  one), audio only after a gesture, the `ipad-webkit` project passing.
- **Game rules are pure.** Shared state lives in a `defineGame`: zod input, optional `roles`,
  `apply(draft, input, ctx)`. No React, three.js, `Date.now()`, `new Date()`, or
  `Math.random()` in rules; use `ctx.now` / `ctx.rng`. Store timestamps; derive current values.
- **Roles come from the server's roster**, never from the client.
- **Components read state and dispatch actions.** World state lives in the Room
  (`useRoomState`); per-device UI state in zustand. Never keep world state in components.
- **Input only through the kit** (`ControlsLayer`, `readControls`, `isTap`).
- **Models only through the manifest** (`Model`, `AnimatedModel`, `ModelInstances` with typed
  ids); `ModelInstances` for anything repeated. Add models with the `add-asset` skill.
- **Content is data**: tunable numbers and lists in JSON validated by zod at load.
- **Grow the kit, not copies.** Something reusable goes into `packages/kit`.
- **Test hooks, not pixels**: expose what tests need with `exposeTestHook` (`window.__game`).
- **Read library sources, don't guess**: `pnpm sources:fetch`, then `.agent_sources/`.
- **Outward-facing changes need the user's approval**: deploying when not asked, Cloudflare
  settings or domains, pushing, deleting or resetting any world.

## Deploy and data

- Production: Cloudflare (`apps/worker/wrangler.jsonc`, name set by `pnpm site:name`).
  Logs: `pnpm --dir apps/worker exec wrangler tail`. Log in from a remote machine with
  `wrangler login --device`.
- Secrets (`PASSCODE_HASH`, `SECRET`) come from `~/.config/treehouse/server.env` on every deploy.
  `data/family.json` is bundled, so roster edits need a deploy.
- Saves: one Durable Object per world; download with `/api/export?game=<id>&world=family`.
- Local: `pnpm dev:server` runs the Node server on port 8000 (worlds in
  `~/.local/share/treehouse/worlds`); tests start their own servers.
