# @treehouse/kit

Shared code for every Treehouse game, imported by subpath (`@treehouse/kit/game`,
`@treehouse/kit/net`, …). The module table is in `docs/ARCHITECTURE.md`.

It grows from real needs: when a game needs something reusable, it's added here (with tests
in `test/`), so the next game starts further ahead. Pure modules (`game`, `save`, `net/host`,
`net/protocol`, `systems`) must stay free of browser and Node APIs; they run in the browser,
the Node server, and Cloudflare.
