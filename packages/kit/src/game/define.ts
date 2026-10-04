import { type Draft, enablePatches, type Patch, produceWithPatches } from "immer";
import type { z } from "zod";
import { createRng, mixSeed, type Rng } from "./rng.ts";

enablePatches();

// A game's rules: pure state + actions, no React, no three.js, no clocks, no Math.random.
// The same definition runs in the browser (LocalRoom), on the server (room host), and in
// unit tests.

export interface ActionContext {
  /** Milliseconds since epoch, from the authority running the action. */
  now: number;
  rng: Rng;
  playerId: string;
  role: string;
}

export interface ActionDef<S, I> {
  input: z.ZodType<I>;
  /** Roles allowed to perform this action. Omit to allow everyone. */
  roles?: readonly string[];
  /** Mutates the draft. Call reject() when the action doesn't apply. */
  apply(draft: Draft<S>, input: I, ctx: ActionContext): void;
}

export interface PlayerInfo {
  id: string;
  role: string;
}

export interface GameDefinition<S, A extends Record<string, ActionDef<S, never>>> {
  id: string;
  /** Bump when the state shape changes, and add a migration. */
  version: number;
  schema: z.ZodType<S>;
  initial(seed: number, now: number): S;
  actions: A;
  /** Migrations keyed by the version they produce: migrations[3] turns a v2 state into v3. */
  migrations?: Record<number, (state: unknown) => unknown>;
  /** Called whenever a player joins, e.g. to give a new player a starting inventory. */
  onJoin?(draft: Draft<S>, player: PlayerInfo, ctx: ActionContext): void;
}

// biome-ignore lint/suspicious/noExplicitAny: action inputs are validated at runtime by zod.
export type AnyGame = GameDefinition<any, Record<string, ActionDef<any, never>>>;

export type StateOf<G> = G extends GameDefinition<infer S, infer _A> ? S : never;
export type ActionName<G> = G extends GameDefinition<infer _S, infer A> ? keyof A & string : never;
export type ActionInput<G, K extends string> =
  G extends GameDefinition<infer _S, infer A>
    ? K extends keyof A
      ? A[K] extends ActionDef<infer _S2, infer I>
        ? I
        : never
      : never
    : never;

export function defineGame<S, A extends Record<string, ActionDef<S, never>>>(
  game: GameDefinition<S, A>,
): GameDefinition<S, A> {
  return game;
}

/** Helper that keeps the input type of one action. */
export function action<S, I>(def: ActionDef<S, I>): ActionDef<S, never> {
  return def as unknown as ActionDef<S, never>;
}

export class ActionRejected extends Error {
  override name = "ActionRejected";
}

/** Stops an action with a reason the player can be shown. */
export function reject(reason: string): never {
  throw new ActionRejected(reason);
}

export type ActionResult<S> =
  | { ok: true; state: S; patches: Patch[] }
  | { ok: false; error: string };

export interface RunOptions {
  now: number;
  player: PlayerInfo;
  /** World seed and sequence number; together they seed the action's Rng. */
  seed: number;
  seq: number;
}

export function runAction<S>(
  game: AnyGame,
  state: S,
  name: string,
  rawInput: unknown,
  options: RunOptions,
): ActionResult<S> {
  const def = Object.hasOwn(game.actions, name) ? game.actions[name] : undefined;
  if (!def) return { ok: false, error: `unknown action: ${name}` };
  if (def.roles && !def.roles.includes(options.player.role)) {
    return { ok: false, error: "not allowed for your role" };
  }
  const parsed = def.input.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: `bad input: ${parsed.error.message}` };

  const ctx = contextFor(options);
  try {
    const [next, patches] = produceWithPatches(state, (draft: Draft<S>) => {
      def.apply(draft, parsed.data, ctx);
    });
    return { ok: true, state: next as S, patches };
  } catch (error) {
    if (error instanceof ActionRejected) return { ok: false, error: error.message };
    throw error;
  }
}

export function runJoin<S>(
  game: AnyGame,
  state: S,
  options: RunOptions,
): { state: S; patches: Patch[] } {
  if (!game.onJoin) return { state, patches: [] };
  const onJoin = game.onJoin;
  const ctx = contextFor(options);
  const [next, patches] = produceWithPatches(state, (draft: Draft<S>) => {
    onJoin(draft, options.player, ctx);
  });
  return { state: next as S, patches };
}

function contextFor(options: RunOptions): ActionContext {
  return {
    now: options.now,
    rng: createRng(mixSeed(options.seed, options.seq)),
    playerId: options.player.id,
    role: options.player.role,
  };
}
