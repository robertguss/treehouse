import { runAction, runJoin } from "@treehouse/kit/game";
import { describe, expect, it } from "vitest";
import { game, type State } from "../src/rules/index.ts";

const options = (id: string, seq: number) => ({
  now: 0,
  player: { id, role: "little-kid" },
  seed: 1,
  seq,
});

describe("__TITLE__ rules", () => {
  it("counts everyone's taps", () => {
    let state: State = game.initial(1, 0);
    state = runJoin(game, state, options("kid1", 1)).state;
    const result = runAction(game, state, "tap", {}, options("kid1", 2));
    if (!result.ok) throw new Error(result.error);
    expect(result.state.total).toBe(1);
    expect(result.state.players.kid1?.taps).toBe(1);
  });

  it("produces states that match the schema", () => {
    expect(game.schema.safeParse(game.initial(1, 0)).success).toBe(true);
  });
});
