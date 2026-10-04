import { action, defineGame, reject } from "@treehouse/kit/game";
import { z } from "zod";

// A tiny shared game for server tests: anyone can add, only the grown-up can reset.

interface Counter {
  count: number;
}

export const counterGame = defineGame({
  id: "counter",
  version: 1,
  schema: z.object({ count: z.number() }),
  initial: (): Counter => ({ count: 0 }),
  actions: {
    add: action<Counter, { by: number }>({
      input: z.object({ by: z.number().int().min(1).max(10) }),
      apply: (draft, { by }) => {
        draft.count += by;
      },
    }),
    reset: action<Counter, Record<string, never>>({
      input: z.object({}),
      roles: ["grownup"],
      apply: (draft) => {
        if (draft.count === 0) reject("already zero");
        draft.count = 0;
      },
    }),
  },
});
