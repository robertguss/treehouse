---
name: playtest
description: Play a Treehouse game in a real browser through Playwright and look at the result - screenshots for iPad and desktop, multiplayer with two devices, the live site. Use after changing anything visual or interactive.
---

# Playtest

Unit tests prove rules; only screenshots prove a game looks and feels right.

- **Run:** `pnpm build && pnpm e2e` (Node server) or `pnpm e2e:worker` (Cloudflare Worker,
  locally). Screenshots land in `test-results/screens/` for `desktop-chromium` (keyboard +
  mouse) and `ipad-webkit` (touch, portrait iPad). Open them with the Read tool and look.
- **One test:** `pnpm exec playwright test -g "<title>" --project ipad-webkit`.
- **Drive the game, don't hunt pixels.** Games expose `window.__game` via `exposeTestHook`:
  at least `frames`, `state()`, `dispatch(name, input)`, plus whatever the game adds (the
  starter adds `sheepOnScreen()`: project a 3D point to the screen to tap it).
- **URL switches:** `?autostart` skips the title; `?as=<member>` picks the player;
  `?world=<id>` uses a throwaway world; `?hour=21` previews night; `?local` runs without a
  server; `?input=touch&ui=kid` tries kid presets on a laptop.
- **Multiplayer:** a second `browser.newContext(info.project.use as BrowserContextOptions)`,
  signed in with `page.request.post("/login", …)`, joining the same `?world=`.
- **Live site:** `E2E_BASE_URL=https://… E2E_PASSCODE="…" pnpm exec playwright test --project ipad-webkit`.
- **Slow WebGL:** headless rendering is software. Wait on state with `waitForFunction`, never
  fixed sleeps, except a short pause before a screenshot. Mark heavy tests `test.slow()`.
