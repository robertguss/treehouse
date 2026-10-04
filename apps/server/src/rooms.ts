import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnyGame } from "@treehouse/kit/game";
import { type Member, RoomHost } from "@treehouse/kit/net";
import { migrateWorld, newWorld, type World } from "@treehouse/kit/save";
import { gameFor } from "./games.ts";

// Shared worlds: one RoomHost per (game, world), loaded from disk on first use and saved
// a moment after every change. Saves are versioned and migrated by the kit.

const SAVE_DELAY_MS = 1000;

export class Rooms {
  readonly #dir: string;
  readonly #now: () => number;
  readonly #hosts = new Map<string, RoomHost>();
  readonly #pending = new Map<string, { timer: ReturnType<typeof setTimeout>; world: World }>();

  constructor(dir: string, now: () => number = Date.now) {
    this.#dir = dir;
    this.#now = now;
    mkdirSync(dir, { recursive: true });
  }

  host(gameId: string, worldId: string): RoomHost | undefined {
    const game = gameFor(gameId, worldId);
    if (!game) return undefined;
    const key = `${gameId}-${worldId}`;
    let host = this.#hosts.get(key);
    if (!host) {
      host = new RoomHost(game, this.#load(game, key), {
        now: this.#now,
        persist: (world) => this.#schedule(key, world),
      });
      this.#hosts.set(key, host);
    }
    return host;
  }

  /** Who is online where, for the launcher. */
  summary(): { game: string; world: string; online: Member[] }[] {
    return [...this.#hosts.entries()].map(([key, host]) => {
      const [game = "", ...rest] = key.split("-");
      return { game, world: rest.join("-"), online: host.online };
    });
  }

  /** Writes every pending save now (shutdown, tests). */
  flush(): void {
    for (const [key, { timer, world }] of this.#pending) {
      clearTimeout(timer);
      this.#write(key, world);
    }
    this.#pending.clear();
  }

  #path(key: string): string {
    return join(this.#dir, `${key}.json`);
  }

  #load(game: AnyGame, key: string): World {
    const path = this.#path(key);
    if (!existsSync(path)) return newWorld(game, Math.floor(Math.random() * 2 ** 31), this.#now());
    try {
      return migrateWorld(game, JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      // Never silently replace a family's world: keep the bad file and start over beside it.
      const backup = `${path}.broken-${Date.now()}`;
      renameSync(path, backup);
      console.error(`could not load ${path}; moved it to ${backup}`, error);
      return newWorld(game, Math.floor(Math.random() * 2 ** 31), this.#now());
    }
  }

  #schedule(key: string, world: World): void {
    const existing = this.#pending.get(key);
    if (existing) {
      existing.world = world;
      return;
    }
    const timer = setTimeout(() => {
      const pending = this.#pending.get(key);
      this.#pending.delete(key);
      if (pending) this.#write(key, pending.world);
    }, SAVE_DELAY_MS);
    this.#pending.set(key, { timer, world });
  }

  #write(key: string, world: World): void {
    const path = this.#path(key);
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify(world));
    renameSync(temporary, path);
  }
}
