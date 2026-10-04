import type { HostConnection, RoomHost } from "@treehouse/kit/net/host";
import { ClientMessage, type Member, type ServerMessage } from "@treehouse/kit/net/protocol";

// One client socket speaking the room protocol, independent of the transport. The Node
// server (ws) and the Cloudflare Durable Object both feed raw messages in here.

export interface ConnectionContext {
  family(): Member[];
  host(game: string, world: string): RoomHost | undefined;
  now(): number;
}

export interface Connection {
  receive(raw: string): void;
  close(): void;
}

export function openConnection(
  context: ConnectionContext,
  send: (message: ServerMessage) => void,
): Connection {
  let joined: HostConnection | undefined;
  send({ t: "welcome", now: context.now() });

  return {
    receive(raw) {
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        send({ t: "error", message: "not JSON" });
        return;
      }
      const parsed = ClientMessage.safeParse(data);
      if (!parsed.success) {
        send({ t: "error", message: "bad message" });
        return;
      }
      const message = parsed.data;
      switch (message.t) {
        case "ping":
          send({ t: "pong", id: message.id, now: context.now() });
          return;
        case "join": {
          const member = context.family().find((m) => m.id === message.player);
          const host = context.host(message.game, message.world);
          if (!member || !host) {
            send({ t: "error", message: !member ? "unknown player" : "unknown world" });
            return;
          }
          joined?.close();
          joined = host.connect(member, send);
          return;
        }
        case "act":
          if (joined) joined.act(message.id, message.name, message.input);
          else send({ t: "ack", id: message.id, ok: false, error: "join first" });
          return;
        case "presence":
          joined?.presence(message.p);
          return;
      }
    },
    close() {
      joined?.close();
      joined = undefined;
    },
  };
}
