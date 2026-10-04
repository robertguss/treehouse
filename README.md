# 🌳 Treehouse — family game starter kit

A template for browser 3D games the whole family plays together: kids on iPads, grown-ups on
laptops, everyone in one shared world. Built with React Three Fiber, deployed to Cloudflare,
and designed to be built by AI agents.

**What you get**

- A **shared kit** (`packages/kit`): pure game rules with saves, real-time multiplayer rooms,
  touch + keyboard controls, kid-friendly and standard UI, title/pause screens, synthesized
  sounds, a typed 3D model library, sky and camera, and test hooks.
- A **family setup**: one passcode, a "who are you?" picker per device, roles per family member.
- **Hosting** on Cloudflare (Worker + one Durable Object per world), plus a Node server for
  local development and tests.
- **107 CC0 low-poly models** (Quaternius) ready to use, and a pipeline to add more.
- **Agent setup**: `AGENTS.md`, skills (`new-game`, `add-asset`, `playtest`), Playwright
  screenshots on desktop and iPad, `pnpm verify`.

## Start a new game

```sh
gh repo create my-game --template robertguss/treehouse --private --clone
cd my-game
mise install && pnpm install
pnpm exec playwright install --with-deps chromium webkit
pnpm new-game my-game "My Game" 🎮      # a working shared-world starter, registered everywhere
pnpm install && pnpm verify
```

Then follow [`docs/FIRST-DEPLOY.md`](docs/FIRST-DEPLOY.md) to put it online for the family,
and ask an agent to turn the starter into your game (it starts by writing
`docs/games/<id>.md` with you).

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how it fits together
- [`docs/FIRST-DEPLOY.md`](docs/FIRST-DEPLOY.md) — passcode, family, Cloudflare, iPads
- [`docs/decisions.md`](docs/decisions.md) — why things are the way they are
- [`AGENTS.md`](AGENTS.md) — rules and commands for agents
- [`CREDITS.md`](CREDITS.md) — art credits

The first game built on this kit is Cozy Farm (`robertguss/cozy-farm`), a good reference for
bigger games: zones, inventories, shops, roles, and many entities.
