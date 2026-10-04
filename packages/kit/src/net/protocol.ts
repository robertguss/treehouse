import type { Patch } from "immer";
import { z } from "zod";

// Messages between game clients and the room server, over the /ws WebSocket.
// Client messages are validated with zod on the server; server messages are trusted.

export const Anim = z.enum(["idle", "walk", "run", "act"]);
export type Anim = z.infer<typeof Anim>;

/** Where a player is and what they look like doing. Sent ~15×/s, never persisted. */
export const Presence = z.object({
  zone: z.string().max(64),
  x: z.number().finite(),
  z: z.number().finite(),
  ry: z.number().finite(),
  anim: Anim,
});
export type Presence = z.infer<typeof Presence>;

/** A family member, from the server's roster. Roles come from here, never from the client. */
export const Member = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(32),
  avatar: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: z.string().min(1).max(32),
  input: z.enum(["touch", "desktop"]),
  ui: z.enum(["kid", "standard"]),
});
export type Member = z.infer<typeof Member>;

export const ClientMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("join"),
    game: z.string().max(32),
    world: z.string().max(64),
    player: z.string().max(32),
  }),
  z.object({
    t: z.literal("act"),
    id: z.number().int(),
    name: z.string().max(64),
    input: z.unknown(),
  }),
  z.object({ t: z.literal("presence"), p: Presence }),
  z.object({ t: z.literal("ping"), id: z.number().int() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface Peer {
  member: Member;
  presence?: Presence;
}

export type ServerMessage =
  | { t: "welcome"; now: number }
  | { t: "pong"; id: number; now: number }
  | { t: "joined"; you: Member; state: unknown; seq: number; now: number; peers: Peer[] }
  | { t: "patch"; seq: number; patches: Patch[] }
  | { t: "ack"; id: number; ok: true }
  | { t: "ack"; id: number; ok: false; error: string }
  | { t: "peer"; member: Member }
  | { t: "presence"; id: string; p: Presence }
  | { t: "left"; id: string }
  | { t: "error"; message: string };
