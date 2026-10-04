import type { Patch } from "immer";
import { type AnyGame, runAction, runJoin } from "../game/define.ts";
import type { World } from "../save/index.ts";
import type { Member, Presence, ServerMessage } from "./protocol.ts";

// Runs one world: applies actions in order, broadcasts patches, relays presence.
// Used by the server for shared worlds and by LocalRoom for single-player and tests.

export interface HostOptions {
  now(): number;
  /** Called after every change; the caller decides how often to really write. */
  persist(world: World): void;
}

export interface HostConnection {
  readonly member: Member;
  act(id: number, name: string, input: unknown): void;
  presence(p: Presence): void;
  close(): void;
}

interface Client {
  member: Member;
  send(message: ServerMessage): void;
}

export class RoomHost {
  readonly game: AnyGame;
  #world: World;
  readonly #options: HostOptions;
  readonly #clients = new Set<Client>();
  readonly #presence = new Map<string, Presence>();

  constructor(game: AnyGame, world: World, options: HostOptions) {
    this.game = game;
    this.#world = world;
    this.#options = options;
  }

  get world(): World {
    return this.#world;
  }

  get online(): Member[] {
    const byId = new Map<string, Member>();
    for (const client of this.#clients) byId.set(client.member.id, client.member);
    return [...byId.values()];
  }

  connect(member: Member, send: (message: ServerMessage) => void): HostConnection {
    const client: Client = { member, send };
    const alreadyOnline = this.online.some((other) => other.id === member.id);

    const joined = runJoin(this.game, this.#world.state, this.#runOptions(member));
    if (joined.patches.length > 0) this.#commit(joined.state, joined.patches);

    this.#clients.add(client);
    send({
      t: "joined",
      you: member,
      state: this.#world.state,
      seq: this.#world.seq,
      now: this.#options.now(),
      peers: this.online
        .filter((other) => other.id !== member.id)
        .map((other) => {
          const presence = this.#presence.get(other.id);
          return presence ? { member: other, presence } : { member: other };
        }),
    });
    if (!alreadyOnline) this.#broadcast({ t: "peer", member }, client);

    return {
      member,
      act: (id, name, input) => {
        const result = runAction(
          this.game,
          this.#world.state,
          name,
          input,
          this.#runOptions(member),
        );
        if (!result.ok) {
          send({ t: "ack", id, ok: false, error: result.error });
          return;
        }
        if (result.patches.length > 0) this.#commit(result.state, result.patches);
        send({ t: "ack", id, ok: true });
      },
      presence: (p) => {
        this.#presence.set(member.id, p);
        this.#broadcastToOthers(member.id, { t: "presence", id: member.id, p });
      },
      close: () => {
        this.#clients.delete(client);
        if (!this.online.some((other) => other.id === member.id)) {
          this.#presence.delete(member.id);
          this.#broadcast({ t: "left", id: member.id });
        }
      },
    };
  }

  #runOptions(member: Member) {
    return {
      now: this.#options.now(),
      player: { id: member.id, role: member.role },
      seed: this.#world.seed,
      seq: this.#world.seq + 1,
    };
  }

  #commit(state: unknown, patches: Patch[]): void {
    this.#world = { ...this.#world, state, seq: this.#world.seq + 1 };
    this.#broadcast({ t: "patch", seq: this.#world.seq, patches });
    this.#options.persist(this.#world);
  }

  #broadcast(message: ServerMessage, except?: Client): void {
    for (const client of this.#clients) if (client !== except) client.send(message);
  }

  #broadcastToOthers(memberId: string, message: ServerMessage): void {
    for (const client of this.#clients) if (client.member.id !== memberId) client.send(message);
  }
}
