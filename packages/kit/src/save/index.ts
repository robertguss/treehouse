import type { AnyGame } from "../game/define.ts";

// A saved world: the game's state plus what's needed to keep running it deterministically.
export interface World<S = unknown> {
  game: string;
  version: number;
  seed: number;
  seq: number;
  state: S;
}

export function newWorld<S>(game: AnyGame, seed: number, now: number): World<S> {
  return { game: game.id, version: game.version, seed, seq: 0, state: game.initial(seed, now) };
}

/**
 * Brings a saved world up to the game's current version and validates it.
 * Throws if a migration is missing or the result doesn't match the schema.
 */
export function migrateWorld<S>(game: AnyGame, saved: unknown): World<S> {
  if (!isWorld(saved)) throw new Error("not a saved world");
  if (saved.game !== game.id) throw new Error(`save is for ${saved.game}, not ${game.id}`);
  if (saved.version > game.version) {
    throw new Error(`save is from a newer version (${saved.version} > ${game.version})`);
  }
  let state = saved.state;
  for (let version = saved.version + 1; version <= game.version; version += 1) {
    const migrate = game.migrations?.[version];
    if (!migrate) throw new Error(`missing migration to version ${version}`);
    state = migrate(state);
  }
  const parsed = game.schema.safeParse(state);
  if (!parsed.success) throw new Error(`saved state is invalid: ${parsed.error.message}`);
  return { ...saved, version: game.version, state: parsed.data as S };
}

function isWorld(value: unknown): value is World {
  if (typeof value !== "object" || value === null) return false;
  const world = value as Record<string, unknown>;
  return (
    typeof world.game === "string" &&
    typeof world.version === "number" &&
    typeof world.seed === "number" &&
    typeof world.seq === "number" &&
    "state" in world
  );
}
