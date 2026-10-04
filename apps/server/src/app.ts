import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import {
  isValidSession,
  LoginRateLimiter,
  PUBLIC_PATHS,
  parseCookies,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  safeNext,
  sessionToken,
  verifyPasscode,
} from "./auth.ts";
import { openConnection } from "./connection.ts";
import { loadFamily } from "./family.ts";
import { loginPage } from "./login-page.ts";
import type { Rooms } from "./rooms.ts";
import { serveStatic } from "./static.ts";

export interface AppConfig {
  siteDir: string;
  passcodeHash: string;
  secret: string;
  familyPath: string;
  rooms: Rooms;
}

const MAX_BODY_BYTES = 4096;

export function createApp(config: AppConfig): Server {
  const limiter = new LoginRateLimiter();
  const sockets = new WebSocketServer({ noServer: true });

  sockets.on("connection", (socket) => {
    const connection = openConnection(
      {
        family: () => loadFamily(config.familyPath),
        host: (game, world) => config.rooms.host(game, world),
        now: Date.now,
      },
      (message) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      },
    );
    socket.on("message", (data) => connection.receive(data.toString()));
    socket.on("close", () => connection.close());
  });

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      console.error("request failed", error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", "http://localhost");
    if (pathname !== "/ws" || !isAuthed(request)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws, request));
  });

  server.on("close", () => sockets.close());
  return server;

  function isAuthed(request: IncomingMessage): boolean {
    return isValidSession(parseCookies(request.headers.cookie).get(SESSION_COOKIE), config.secret);
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const method = request.method ?? "GET";

    if (url.pathname === "/healthz") {
      response.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }

    if (url.pathname === "/login") {
      if (method === "POST") return handleLogin(request, response);
      sendHtml(response, 200, loginPage(safeNext(url.searchParams.get("next"))));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (!isAuthed(request)) {
        response.writeHead(401).end();
        return;
      }
      if (url.pathname === "/api/family") return sendJson(response, loadFamily(config.familyPath));
      if (url.pathname === "/api/worlds") return sendJson(response, config.rooms.summary());
      response.writeHead(404).end();
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }

    if (!PUBLIC_PATHS.has(url.pathname) && !isAuthed(request)) {
      const wantsPage = request.headers.accept?.includes("text/html") ?? false;
      if (wantsPage) {
        const next = encodeURIComponent(url.pathname + url.search);
        response.writeHead(303, { location: `/login?next=${next}` }).end();
      } else {
        response.writeHead(401).end();
      }
      return;
    }

    if (!(await serveStatic(config.siteDir, url.pathname, response))) {
      response.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    }
  }

  async function handleLogin(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const body = await readBody(request);
    if (body === null) {
      response.writeHead(413).end();
      return;
    }
    const form = new URLSearchParams(body);
    const next = safeNext(form.get("next"));

    const client = clientAddress(request);
    if (limiter.blocked(client, Date.now())) {
      sendHtml(response, 429, loginPage(next, "Too many tries. Wait a few minutes."));
      return;
    }
    if (!verifyPasscode(form.get("passcode") ?? "", config.passcodeHash)) {
      limiter.fail(client, Date.now());
      sendHtml(response, 401, loginPage(next, "That's not it. Try again!"));
      return;
    }

    const secure = request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    response
      .writeHead(303, {
        location: next,
        "set-cookie": `${SESSION_COOKIE}=${sessionToken(config.secret)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
      })
      .end();
  }
}

function sendJson(response: ServerResponse, value: unknown): void {
  response
    .writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    })
    .end(JSON.stringify(value));
}

function sendHtml(response: ServerResponse, status: number, html: string): void {
  response
    .writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" })
    .end(html);
}

function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || request.socket.remoteAddress || "unknown";
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}
