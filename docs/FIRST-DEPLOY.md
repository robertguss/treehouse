# First deploy

From a fresh repo (made from the template) to a game the family can open on their iPads.

## 1. Family

Edit `data/family.json`: one entry per person, with a name, an avatar (any emoji), a color,
a `role`, and device presets (`input`: `touch` or `desktop`; `ui`: `kid` or `standard`). The
template ships with a grown-up and three kids (`big-kid`, `middle-kid`, `little-kid`). Roles are
plain strings; each game decides what they can do (`roles: [...]` on an action). Keep `id`s
stable once people have played: saves are stored under them.

## 2. Passcode

```sh
pnpm passcode:set --generate     # prints a two-word passcode, or: pnpm passcode:set "your words"
```

The passcode hash and a session secret go to `~/.config/treehouse/server.env` (outside git).
The same file feeds the local server and Cloudflare.

## 3. Cloudflare

```sh
pnpm site:name my-game                                # becomes https://my-game.<account>.workers.dev
pnpm --dir apps/worker exec wrangler login --device   # once per machine; works over SSH
pnpm deploy:cf
```

`deploy:cf` builds everything, deploys the Worker and its Durable Objects, and uploads the
passcode secrets. Run it again after any change (including `data/family.json`).

Check it: open the URL, enter the passcode, pick yourself, open the game. A quick automated
check against the live site:

```sh
E2E_BASE_URL=https://my-game.<account>.workers.dev E2E_PASSCODE="your words" \
  pnpm exec playwright test --project ipad-webkit
```

(It creates a few throwaway worlds named `t…`; they're never shown anywhere.)

## 4. iPads

On each iPad: open the URL in Safari → passcode → Share → **Add to Home Screen** → open the
new icon (it runs full screen; it may ask for the passcode once more) → pick the kid who owns
that iPad. It remembers them from then on.

## 5. Things only a human can check

- How it feels on a real iPad (smoothness, warmth after 15 minutes, both orientations).
- Sound on the iPad (the first tap unlocks audio; check the silent switch).
- Two thumbs at once (joystick + action button), if the game uses both.
- Whether the kids get it without help. Watch more than you explain.

## Backups

While signed in, `/api/export?game=<id>&world=family` downloads a world's save as JSON.
