import { DurableObject } from "cloudflare:workers";
import { RoomHost } from "@treehouse/kit/net/host";
import type { Member } from "@treehouse/kit/net/protocol";
import { migrateWorld, newWorld, type World } from "@treehouse/kit/save";
import {
  isValidSession,
  PUBLIC_PATHS,
  parseCookies,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  safeNext,
  sessionToken,
  verifyPasscode,
} from "@treehouse/server/auth";
import { openConnection } from "@treehouse/server/connection";
import { parseFamily } from "@treehouse/server/family-schema";
import { gameFor, LISTED_WORLDS } from "@treehouse/server/games";
import { loginPage } from "@treehouse/server/login-page";
import familyJson from "../../../data/family.json";

// Treehouse on Cloudflare. The Worker serves the built site (static assets), the passcode
// gate, and the family roster; each shared world is a Durable Object running the same
// RoomHost as the Node server, with its save in Durable Object storage.

export interface Env {
  ASSETS: Fetcher;
  WORLDS: DurableObjectNamespace<WorldRoom>;
  PASSCODE_HASH: string;
  SECRET: string;
}

const FAMILY: Member[] = parseFamily(familyJson, "data/family.json");

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const authed = isValidSession(
      parseCookies(request.headers.get("cookie") ?? undefined).get(SESSION_COOKIE),
      env.SECRET,
    );

    if (url.pathname === "/healthz") return new Response("ok");

    if (url.pathname === "/login") {
      if (request.method === "POST") return login(request, env);
      return html(200, loginPage(safeNext(url.searchParams.get("next"))));
    }

    if (url.pathname === "/ws") {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket", { status: 426 });
      }
      const game = url.searchParams.get("game");
      const world = url.searchParams.get("world");
      if (game && world && gameFor(game, world)) return roomFor(env, game, world).fetch(request);
      return lobbySocket();
    }

    if (url.pathname.startsWith("/api/")) {
      if (!authed) return new Response("Unauthorized", { status: 401 });
      if (url.pathname === "/api/family") return json(FAMILY);
      if (url.pathname === "/api/export") {
        // Download a world's save (backups): /api/export?game=<id>&world=family
        const game = url.searchParams.get("game") ?? "";
        const world = url.searchParams.get("world") ?? "";
        if (!gameFor(game, world)) return new Response("Unknown world", { status: 404 });
        const saved = await roomFor(env, game, world).fetch(
          `https://room/export?game=${game}&world=${world}`,
        );
        return new Response(saved.body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="${game}-${world}-${new Date().toISOString().slice(0, 10)}.json"`,
          },
        });
      }
      if (url.pathname === "/api/worlds") {
        const worlds = await Promise.all(
          LISTED_WORLDS.map(async ({ game, world }) => {
            const response = await roomFor(env, game, world).fetch(
              `https://room/online?game=${game}&world=${world}`,
            );
            return { game, world, online: (await response.json()) as Member[] };
          }),
        );
        return json(worlds);
      }
      return new Response("Not found", { status: 404 });
    }

    if (!authed && !PUBLIC_PATHS.has(url.pathname)) {
      if (request.headers.get("accept")?.includes("text/html")) {
        const next = encodeURIComponent(url.pathname + url.search);
        return Response.redirect(new URL(`/login?next=${next}`, url).toString(), 303);
      }
      return new Response("Unauthorized", { status: 401 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function roomFor(env: Env, game: string, world: string): DurableObjectStub<WorldRoom> {
  return env.WORLDS.get(env.WORLDS.idFromName(`${game}-${world}`));
}

async function login(request: Request, env: Env): Promise<Response> {
  const form = new URLSearchParams(await request.text());
  const next = safeNext(form.get("next"));
  if (!verifyPasscode(form.get("passcode") ?? "", env.PASSCODE_HASH)) {
    // Slow down guessing; Cloudflare's own rate limiting covers floods.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return html(401, loginPage(next, "That's not it. Try again!"));
  }
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 303,
    headers: {
      location: next,
      "set-cookie": `${SESSION_COOKIE}=${sessionToken(env.SECRET)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
    },
  });
}

/** A socket that isn't for a world (connection checks): welcome and pong only. */
function lobbySocket(): Response {
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  server.accept();
  server.send(JSON.stringify({ t: "welcome", now: Date.now() }));
  server.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(String(event.data)) as { t?: string; id?: number };
      if (message.t === "ping")
        server.send(JSON.stringify({ t: "pong", id: message.id, now: Date.now() }));
    } catch {
      // Not JSON, or the socket already closed.
    }
  });
  server.addEventListener("error", () => {});
  return new Response(null, { status: 101, webSocket: client });
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function html(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * One shared world. Lives in memory while anyone is connected; its save lives in Durable
 * Object storage and is written after every change.
 */
export class WorldRoom extends DurableObject<Env> {
  #host: RoomHost | undefined;
  #key: string | undefined;

  async #hostFor(game: string, world: string): Promise<RoomHost | undefined> {
    const definition = gameFor(game, world);
    if (!definition) return undefined;
    const key = `${game}-${world}`;
    if (this.#host && this.#key === key) return this.#host;
    const saved = await this.ctx.storage.get<World>("world");
    let state: World;
    try {
      state = saved
        ? migrateWorld(definition, saved)
        : newWorld(definition, randomSeed(), Date.now());
    } catch (error) {
      // Never silently replace a family's world: keep the bad save and start over beside it.
      console.error(`could not load ${key}; keeping it as world-broken`, error);
      await this.ctx.storage.put(`world-broken-${Date.now()}`, saved);
      state = newWorld(definition, randomSeed(), Date.now());
    }
    this.#host = new RoomHost(definition, state, {
      now: Date.now,
      persist: (next) => {
        void this.ctx.storage.put("world", next);
      },
    });
    this.#key = key;
    return this.#host;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const game = url.searchParams.get("game") ?? "";
    const world = url.searchParams.get("world") ?? "";
    const host = await this.#hostFor(game, world);
    if (!host) return new Response("Unknown world", { status: 404 });

    if (url.pathname === "/online") return json(host.online);
    if (url.pathname === "/export") return json(host.world);

    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    server.accept();
    const connection = openConnection(
      {
        family: () => FAMILY,
        host: (g, w) => (g === game && w === world ? host : undefined),
        now: Date.now,
      },
      (message) => {
        try {
          server.send(JSON.stringify(message));
        } catch {
          // The socket closed while we were sending; close() below cleans up.
        }
      },
    );
    server.addEventListener("message", (event) => connection.receive(String(event.data)));
    server.addEventListener("close", () => connection.close());
    server.addEventListener("error", () => connection.close());
    return new Response(null, { status: 101, webSocket: client });
  }
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}
