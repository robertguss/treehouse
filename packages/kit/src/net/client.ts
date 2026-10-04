import { applyPatches, enablePatches } from "immer";
import type { AnyGame } from "../game/define.ts";
import { migrateWorld, newWorld, type World } from "../save/index.ts";
import { type HostConnection, RoomHost } from "./host.ts";
import type { ClientMessage, Member, Peer, Presence, ServerMessage } from "./protocol.ts";

enablePatches();

// What a game sees: the current state, a way to dispatch actions, the shared clock, and the
// other players. NetworkRoom and LocalRoom both implement it, so game code doesn't care
// whether the world is on the server or in the browser.

export type RoomStatus = "connecting" | "online" | "offline";
export type DispatchResult = { ok: true } | { ok: false; error: string };

export interface Room<S> {
  readonly me: Member;
  readonly status: RoomStatus;
  getState(): S;
  /** Server-synced clock in ms. Use this, not Date.now(), for anything game-related. */
  now(): number;
  dispatch(name: string, input: unknown): Promise<DispatchResult>;
  sendPresence(presence: Presence): void;
  getPeers(): ReadonlyMap<string, Peer>;
  /** Fires on any state, peer, or status change. */
  subscribe(listener: () => void): () => void;
  close(): void;
}

class ClientRoom<S> implements Room<S> {
  me: Member;
  status: RoomStatus = "connecting";
  #state: S | undefined;
  #seq = 0;
  #clockOffset = 0;
  #nextId = 1;
  readonly #pending = new Map<number, (result: DispatchResult) => void>();
  readonly #peers = new Map<string, Peer>();
  readonly #listeners = new Set<() => void>();
  readonly #send: (message: ClientMessage) => void;
  readonly #rejoin: () => void;
  #ready: () => void = () => {};
  readonly ready: Promise<void>;

  constructor(me: Member, send: (message: ClientMessage) => void, rejoin: () => void) {
    this.me = me;
    this.#send = send;
    this.#rejoin = rejoin;
    this.ready = new Promise((resolve) => {
      this.#ready = resolve;
    });
  }

  getState(): S {
    if (this.#state === undefined) throw new Error("room not joined yet");
    return this.#state;
  }

  now(): number {
    return Date.now() + this.#clockOffset;
  }

  dispatch(name: string, input: unknown): Promise<DispatchResult> {
    if (this.status !== "online") return Promise.resolve({ ok: false, error: "offline" });
    const id = this.#nextId++;
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      this.#send({ t: "act", id, name, input });
    });
  }

  sendPresence(presence: Presence): void {
    if (this.status === "online") this.#send({ t: "presence", p: presence });
  }

  getPeers(): ReadonlyMap<string, Peer> {
    return this.#peers;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    this.setStatus("offline");
  }

  setStatus(status: RoomStatus): void {
    if (status === this.status) return;
    this.status = status;
    if (status !== "online") {
      for (const resolve of this.#pending.values()) resolve({ ok: false, error: "offline" });
      this.#pending.clear();
      this.#peers.clear();
    }
    this.#emit();
  }

  syncClock(serverNow: number, roundTripMs = 0): void {
    this.#clockOffset = serverNow + roundTripMs / 2 - Date.now();
  }

  handle(message: ServerMessage): void {
    switch (message.t) {
      case "welcome":
        this.syncClock(message.now);
        return;
      case "pong":
        return;
      case "joined":
        this.me = message.you;
        this.#state = message.state as S;
        this.#seq = message.seq;
        this.syncClock(message.now);
        this.#peers.clear();
        for (const peer of message.peers) this.#peers.set(peer.member.id, peer);
        this.status = "online";
        this.#ready();
        this.#emit();
        return;
      case "patch":
        if (this.#state === undefined) return;
        if (message.seq !== this.#seq + 1) {
          // Missed something: start over from a fresh snapshot.
          this.#rejoin();
          return;
        }
        this.#state = applyPatches(this.#state as object, message.patches) as S;
        this.#seq = message.seq;
        this.#emit();
        return;
      case "ack": {
        const resolve = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        resolve?.(message.ok ? { ok: true } : { ok: false, error: message.error });
        return;
      }
      case "peer":
        this.#peers.set(message.member.id, { member: message.member });
        this.#emit();
        return;
      case "presence": {
        const peer = this.#peers.get(message.id);
        if (peer) peer.presence = message.p;
        // Presence is high-frequency; renderers read it from getPeers() every frame
        // instead of being notified.
        return;
      }
      case "left":
        this.#peers.delete(message.id);
        this.#emit();
        return;
      case "error":
        console.warn("room error:", message.message);
        return;
    }
  }

  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

export interface NetworkRoomOptions {
  game: string;
  world: string;
  /** Profile id; the server looks up the member and role from its family roster. */
  player: string;
  /** Defaults to the page's own /ws endpoint. */
  url?: string;
}

const PLACEHOLDER: Member = {
  id: "unknown",
  name: "…",
  avatar: "🙂",
  color: "#888888",
  role: "helper",
  input: "touch",
  ui: "kid",
};

/** Joins a shared world on the Treehouse server; reconnects on its own. */
export function connectNetworkRoom<S>(options: NetworkRoomOptions): Room<S> & {
  ready: Promise<void>;
} {
  // game and world are in the URL too, so a router (the Cloudflare Worker) can send the
  // socket to the right room before the join message arrives.
  const query = `game=${encodeURIComponent(options.game)}&world=${encodeURIComponent(options.world)}`;
  const url =
    options.url ??
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?${query}`;
  let socket: WebSocket | undefined;
  let retryDelay = 500;
  let closed = false;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  const pingSent = new Map<number, number>();

  const send = (message: ClientMessage) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const join = () =>
    send({ t: "join", game: options.game, world: options.world, player: options.player });

  const room = new ClientRoom<S>({ ...PLACEHOLDER, id: options.player }, send, join);
  const originalClose = room.close.bind(room);
  room.close = () => {
    closed = true;
    clearInterval(pingTimer);
    socket?.close();
    originalClose();
  };

  const connect = () => {
    room.setStatus("connecting");
    socket = new WebSocket(url);
    socket.onopen = () => {
      retryDelay = 500;
      join();
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.t === "pong") {
        const sent = pingSent.get(message.id);
        pingSent.delete(message.id);
        if (sent !== undefined) room.syncClock(message.now, performance.now() - sent);
      }
      room.handle(message);
    };
    socket.onclose = () => {
      if (closed) return;
      room.setStatus("offline");
      setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 10_000);
    };
  };

  let pingId = 0;
  pingTimer = setInterval(() => {
    pingId += 1;
    pingSent.set(pingId, performance.now());
    send({ t: "ping", id: pingId });
  }, 10_000);

  connect();
  return room;
}

export interface LocalRoomOptions {
  game: AnyGame;
  member: Member;
  /** localStorage key to save under; omit for a throwaway world. */
  storageKey?: string;
  seed?: number;
  /** Clock override, for tests. */
  now?: () => number;
}

/** Runs a world entirely in the browser (single-player games and tests). */
export function createLocalRoom<S>(options: LocalRoomOptions): Room<S> & { host: RoomHost } {
  const now = options.now ?? (() => Date.now());
  const world = loadLocalWorld<S>(options) ?? newWorld<S>(options.game, options.seed ?? 1, now());
  let connection: HostConnection | undefined;

  const host = new RoomHost(options.game, world, {
    now,
    persist: (saved) => {
      if (!options.storageKey) return;
      try {
        localStorage.setItem(options.storageKey, JSON.stringify(saved));
      } catch {
        // Storage full or blocked: the game keeps working, it just won't remember.
      }
    },
  });

  const room = new ClientRoom<S>(
    options.member,
    (message) => {
      if (!connection) return;
      if (message.t === "act") connection.act(message.id, message.name, message.input);
      else if (message.t === "presence") connection.presence(message.p);
    },
    () => {},
  );
  connection = host.connect(options.member, (message) => room.handle(message));
  return Object.assign(room, { host });
}

function loadLocalWorld<S>(options: LocalRoomOptions): World<S> | undefined {
  if (!options.storageKey) return undefined;
  try {
    const raw = localStorage.getItem(options.storageKey);
    if (!raw) return undefined;
    return migrateWorld<S>(options.game, JSON.parse(raw));
  } catch (error) {
    console.warn("starting a new world; the saved one could not be loaded:", error);
    return undefined;
  }
}
