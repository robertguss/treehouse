import { describe, expect, it } from "vitest";
import { z } from "zod";
import { action, createRng, defineGame, reject, runAction } from "../src/game/index.ts";
import { createLocalRoom, type Member, RoomHost, type ServerMessage } from "../src/net/index.ts";
import { migrateWorld, newWorld } from "../src/save/index.ts";
import {
  addItem,
  applyBoost,
  boostedElapsed,
  HOUR,
  removeItem,
  skyAt,
  tileAt,
  tileKey,
} from "../src/systems/index.ts";

interface CounterState {
  count: number;
  rolls: number[];
  joined: string[];
}

const counter = defineGame({
  id: "counter",
  version: 2,
  schema: z.object({ count: z.number(), rolls: z.array(z.number()), joined: z.array(z.string()) }),
  initial: (): CounterState => ({ count: 0, rolls: [], joined: [] }),
  migrations: {
    2: (old) => ({ ...(old as object), joined: [] }),
  },
  onJoin: (draft, player) => {
    if (!draft.joined.includes(player.id)) draft.joined.push(player.id);
  },
  actions: {
    add: action<CounterState, { by: number }>({
      input: z.object({ by: z.number().int().min(1).max(10) }),
      apply: (draft, input) => {
        draft.count += input.by;
      },
    }),
    roll: action<CounterState, Record<string, never>>({
      input: z.object({}),
      apply: (draft, _input, ctx) => {
        draft.rolls.push(ctx.rng.int(1, 6));
      },
    }),
    reset: action<CounterState, Record<string, never>>({
      input: z.object({}),
      roles: ["builder"],
      apply: (draft) => {
        if (draft.count === 0) reject("already zero");
        draft.count = 0;
      },
    }),
  },
});

const options = (role = "farmer") => ({
  now: 1000,
  player: { id: "p1", role },
  seed: 7,
  seq: 1,
});

const member = (id: string, role = "farmer"): Member => ({
  id,
  name: id,
  avatar: "🐰",
  color: "#ff8800",
  role,
  input: "touch",
  ui: "kid",
});

describe("runAction", () => {
  it("applies valid actions and returns patches", () => {
    const result = runAction(counter, counter.initial(1, 0), "add", { by: 3 }, options());
    expect(result.ok && result.state.count).toBe(3);
    expect(result.ok && result.patches).toEqual([{ op: "replace", path: ["count"], value: 3 }]);
  });

  it("rejects bad input, unknown actions, wrong roles, and rule failures", () => {
    const state = counter.initial(1, 0);
    expect(runAction(counter, state, "add", { by: 99 }, options()).ok).toBe(false);
    expect(runAction(counter, state, "nope", {}, options())).toEqual({
      ok: false,
      error: "unknown action: nope",
    });
    expect(runAction(counter, state, "reset", {}, options())).toEqual({
      ok: false,
      error: "not allowed for your role",
    });
    expect(runAction(counter, state, "reset", {}, options("builder"))).toEqual({
      ok: false,
      error: "already zero",
    });
    expect(runAction(counter, state, "toString", {}, options()).ok).toBe(false);
  });

  it("is deterministic for the same seed and sequence", () => {
    const state = counter.initial(1, 0);
    const a = runAction(counter, state, "roll", {}, options());
    const b = runAction(counter, state, "roll", {}, options());
    expect(a).toEqual(b);
  });
});

describe("rng", () => {
  it("stays in range", () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.int(1, 3);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(3);
    }
  });
});

describe("saves", () => {
  it("migrates old saves forward and validates them", () => {
    const old = { game: "counter", version: 1, seed: 1, seq: 4, state: { count: 2, rolls: [] } };
    const world = migrateWorld<CounterState>(counter, old);
    expect(world.version).toBe(2);
    expect(world.state).toEqual({ count: 2, rolls: [], joined: [] });
  });

  it("refuses saves for other games, newer versions, or bad data", () => {
    const world = newWorld(counter, 1, 0);
    expect(() => migrateWorld(counter, { ...world, game: "other" })).toThrow();
    expect(() => migrateWorld(counter, { ...world, version: 9 })).toThrow();
    expect(() => migrateWorld(counter, { ...world, state: { count: "x" } })).toThrow();
  });
});

describe("RoomHost", () => {
  it("runs onJoin, broadcasts patches, and relays presence to others", () => {
    const saved: unknown[] = [];
    const host = new RoomHost(counter, newWorld(counter, 1, 0), {
      now: () => 5,
      persist: (world) => saved.push(world),
    });
    const aMessages: ServerMessage[] = [];
    const bMessages: ServerMessage[] = [];
    const a = host.connect(member("a"), (m) => aMessages.push(m));
    host.connect(member("b"), (m) => bMessages.push(m));

    expect(aMessages[0]).toMatchObject({ t: "joined", seq: 1, state: { joined: ["a"] } });
    expect(aMessages).toContainEqual({ t: "peer", member: member("b") });

    a.act(1, "add", { by: 2 });
    expect(aMessages.at(-1)).toEqual({ t: "ack", id: 1, ok: true });
    expect(bMessages).toContainEqual({
      t: "patch",
      seq: 3,
      patches: [{ op: "replace", path: ["count"], value: 2 }],
    });

    a.presence({ zone: "farm", x: 1, z: 2, ry: 0, anim: "walk" });
    expect(bMessages.at(-1)).toMatchObject({ t: "presence", id: "a" });
    expect(aMessages.filter((m) => m.t === "presence")).toHaveLength(0);

    a.close();
    expect(bMessages.at(-1)).toEqual({ t: "left", id: "a" });
    expect(saved).toHaveLength(3);
  });
});

describe("LocalRoom", () => {
  it("dispatches through the same host and keeps state in sync", async () => {
    const room = createLocalRoom<CounterState>({ game: counter, member: member("solo") });
    expect(room.status).toBe("online");
    expect(await room.dispatch("add", { by: 4 })).toEqual({ ok: true });
    expect(room.getState().count).toBe(4);
    expect(await room.dispatch("reset", {})).toEqual({
      ok: false,
      error: "not allowed for your role",
    });
  });
});

describe("systems", () => {
  it("tracks boosted growth over time", () => {
    const rule = { durationMs: HOUR, extraRate: 0.5 };
    const crop = { startedAt: 0, bankedMs: 0, boostedAt: undefined as number | undefined };
    expect(boostedElapsed(crop, 2 * HOUR, rule)).toBe(2 * HOUR);
    applyBoost(crop, 0, rule);
    expect(boostedElapsed(crop, 2 * HOUR, rule)).toBe(2.5 * HOUR);
    applyBoost(crop, 2 * HOUR, rule);
    expect(boostedElapsed(crop, 2.5 * HOUR, rule)).toBe(2.5 * HOUR + 0.5 * HOUR + 0.25 * HOUR);
  });

  it("handles inventories and tiles", () => {
    const inventory: Record<string, number> = {};
    addItem(inventory, "carrot", 2);
    expect(removeItem(inventory, "carrot", 3)).toBe(false);
    expect(removeItem(inventory, "carrot", 2)).toBe(true);
    expect(inventory).toEqual({});
    expect(tileKey(-1, 2)).toBe("-1,2");
    expect(tileAt(-0.5, 2.5)).toEqual({ x: -1, z: 2 });
  });

  it("follows the local clock for day and night", () => {
    expect(skyAt(new Date(2026, 0, 1, 12)).phase).toBe("day");
    expect(skyAt(new Date(2026, 0, 1, 2)).phase).toBe("night");
    expect(skyAt(new Date(2026, 0, 1, 19)).phase).toBe("dusk");
  });
});
