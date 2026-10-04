import type { AnyGame } from "@treehouse/kit/game";
// new-game: imports

// Every game with shared worlds, by id. Used by the Node server and the Cloudflare Worker.
// `pnpm new-game` adds entries at the markers below.
export const GAMES: Record<string, AnyGame> = {
  // new-game: registry
};

/** Worlds the launcher shows "who's playing" for. */
export const LISTED_WORLDS: { game: string; world: string }[] = [
  // new-game: listed
];

const WORLD_ID = /^[a-z0-9-]{1,32}$/;

export function gameFor(gameId: string, worldId: string): AnyGame | undefined {
  if (!WORLD_ID.test(worldId)) return undefined;
  return Object.hasOwn(GAMES, gameId) ? GAMES[gameId] : undefined;
}

/** For tests: add a game at runtime. */
export function registerGame(id: string, game: AnyGame): void {
  GAMES[id] = game;
}
