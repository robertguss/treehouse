import { action, defineGame } from "@treehouse/kit/game";
import { z } from "zod";

// __TITLE__ rules: pure TypeScript, shared by the browser, the server, and the tests.
// Replace this example with your game. Keep it pure: no React, three.js, Date.now(),
// new Date(), or Math.random(); use ctx.now and ctx.rng.

export const State = z.object({
  total: z.number().int().min(0),
  players: z.record(z.string(), z.object({ taps: z.number().int().min(0) })),
});
export type State = z.infer<typeof State>;

export const game = defineGame({
  id: "__NAME__",
  version: 1,
  schema: State,
  initial: (): State => ({ total: 0, players: {} }),
  onJoin: (draft, player) => {
    draft.players[player.id] ??= { taps: 0 };
  },
  actions: {
    tap: action<State, Record<string, never>>({
      input: z.object({}),
      apply: (draft, _input, ctx) => {
        draft.total += 1;
        const player = draft.players[ctx.playerId];
        if (player) player.taps += 1;
      },
    }),
  },
});
