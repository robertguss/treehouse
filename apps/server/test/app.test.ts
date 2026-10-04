import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createApp } from "../src/app.ts";
import { registerGame } from "../src/games.ts";
import { hashPasscode } from "../src/hash.ts";
import { Rooms } from "../src/rooms.ts";
import { resolveStaticPath } from "../src/static.ts";
import { counterGame } from "./counter-game.ts";

let server: Server;
let siteDir: string;
let rooms: Rooms;
let base: string;

beforeAll(async () => {
  registerGame("counter", counterGame);
  siteDir = await mkdtemp(join(tmpdir(), "treehouse-site-"));
  await mkdir(join(siteDir, "games/hello/assets"), { recursive: true });
  await writeFile(join(siteDir, "index.html"), "<h1>launcher</h1>");
  await writeFile(join(siteDir, "games/hello/index.html"), "<h1>hello</h1>");
  await writeFile(join(siteDir, "games/hello/assets/app-abc.js"), "console.log(1)");
  await writeFile(join(siteDir, "manifest.webmanifest"), "{}");

  rooms = new Rooms(join(siteDir, "worlds"));
  server = createApp({
    siteDir,
    passcodeHash: hashPasscode("open sesame"),
    secret: "test",
    familyPath: join(import.meta.dirname, "../../../data/family.json"),
    rooms,
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((done) => server.close(done));
  await rm(siteDir, { recursive: true, force: true });
});

async function login(passcode: string, next = "/"): Promise<Response> {
  return fetch(`${base}/login`, {
    method: "POST",
    body: new URLSearchParams({ passcode, next }),
    redirect: "manual",
  });
}

async function sessionCookie(): Promise<string> {
  const response = await login("open sesame");
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

describe("passcode gate", () => {
  it("redirects pages to the login form", async () => {
    const response = await fetch(`${base}/games/hello/`, {
      headers: { accept: "text/html" },
      redirect: "manual",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?next=%2Fgames%2Fhello%2F");
  });

  it("answers 401 for non-page requests and serves public files", async () => {
    expect((await fetch(`${base}/games/hello/assets/app-abc.js`)).status).toBe(401);
    expect((await fetch(`${base}/manifest.webmanifest`)).status).toBe(200);
  });

  it("rejects a wrong passcode", async () => {
    const response = await login("nope");
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets a cookie and redirects to next on the right passcode", async () => {
    const response = await login("open sesame", "/games/hello/");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/games/hello/");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
});

describe("static files", () => {
  it("serves games with the right caching", async () => {
    const cookie = await sessionCookie();
    const page = await fetch(`${base}/games/hello/`, { headers: { cookie } });
    expect(await page.text()).toBe("<h1>hello</h1>");
    expect(page.headers.get("cache-control")).toBe("no-cache");

    const asset = await fetch(`${base}/games/hello/assets/app-abc.js`, { headers: { cookie } });
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(asset.headers.get("content-type")).toContain("javascript");
  });

  it("adds the trailing slash to directories and 404s missing files", async () => {
    const cookie = await sessionCookie();
    const redirect = await fetch(`${base}/games/hello`, {
      headers: { cookie },
      redirect: "manual",
    });
    expect(redirect.headers.get("location")).toBe("/games/hello/");
    expect((await fetch(`${base}/missing.js`, { headers: { cookie } })).status).toBe(404);
  });

  it("never resolves outside the site directory", () => {
    expect(resolveStaticPath("/srv/site", "/games/hello/")).toBe("/srv/site/games/hello");
    expect(resolveStaticPath("/srv/site", "/../etc/passwd")).toBeNull();
    expect(resolveStaticPath("/srv/site", "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
    expect(resolveStaticPath("/srv/site", "/a%00b")).toBeNull();
  });
});

describe("websocket", () => {
  it("refuses connections without a session", async () => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/ws`);
    const status = await new Promise((done) => {
      socket.on("unexpected-response", (_request, response) => done(response.statusCode));
      socket.on("error", () => done("error"));
    });
    expect(status).toBe(401);
  });

  it("joins a shared world, runs actions, and relays them to other players", async () => {
    const cookie = await sessionCookie();
    const open = async (player: string) => {
      const socket = new WebSocket(`${base.replace("http", "ws")}/ws`, { headers: { cookie } });
      const inbox: Record<string, unknown>[] = [];
      socket.on("message", (data) => inbox.push(JSON.parse(data.toString())));
      await new Promise((done) => socket.on("open", done));
      socket.send(JSON.stringify({ t: "join", game: "counter", world: "test", player }));
      return { socket, inbox };
    };
    const until = async (check: () => boolean) => {
      for (let i = 0; i < 100 && !check(); i += 1) await new Promise((r) => setTimeout(r, 10));
      expect(check()).toBe(true);
    };

    const kid = await open("kid1");
    await until(() => kid.inbox.some((m) => m.t === "joined"));
    const grownup = await open("grownup");
    await until(() => grownup.inbox.some((m) => m.t === "joined"));
    await until(() => kid.inbox.some((m) => m.t === "peer"));

    kid.socket.send(JSON.stringify({ t: "act", id: 1, name: "add", input: { by: 2 } }));
    await until(() => kid.inbox.some((m) => m.t === "ack" && m.id === 1));
    expect(kid.inbox.find((m) => m.t === "ack")).toEqual({ t: "ack", id: 1, ok: true });
    await until(() => grownup.inbox.some((m) => m.t === "patch"));

    kid.socket.send(JSON.stringify({ t: "act", id: 2, name: "reset", input: {} }));
    await until(() => kid.inbox.some((m) => m.t === "ack" && m.id === 2));
    expect(kid.inbox.find((m) => m.t === "ack" && m.id === 2)).toMatchObject({ ok: false });

    kid.socket.send(JSON.stringify({ t: "ping", id: 7 }));
    await until(() => kid.inbox.some((m) => m.t === "pong" && m.id === 7));

    kid.socket.close();
    await until(() => grownup.inbox.some((m) => m.t === "left" && m.id === "kid1"));
    grownup.socket.close();

    rooms.flush();
    let worlds: unknown;
    for (let i = 0; i < 50; i += 1) {
      worlds = await (await fetch(`${base}/api/worlds`, { headers: { cookie } })).json();
      if (JSON.stringify(worlds).includes('"online":[]')) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(worlds).toEqual([{ game: "counter", world: "test", online: [] }]);
  });

  it("rejects unknown players and malformed messages", async () => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/ws`, {
      headers: { cookie: await sessionCookie() },
    });
    const inbox: Record<string, unknown>[] = [];
    socket.on("message", (data) => inbox.push(JSON.parse(data.toString())));
    await new Promise((done) => socket.on("open", done));
    socket.send(JSON.stringify({ t: "join", game: "counter", world: "test", player: "stranger" }));
    socket.send("{oops");
    socket.send(JSON.stringify({ t: "act", id: 1, name: "buy", input: {} }));
    for (let i = 0; i < 50 && inbox.length < 4; i += 1) await new Promise((r) => setTimeout(r, 10));
    socket.close();
    expect(inbox.slice(1)).toEqual([
      { t: "error", message: "unknown player" },
      { t: "error", message: "not JSON" },
      { t: "ack", id: 1, ok: false, error: "join first" },
    ]);
  });
});

describe("family roster", () => {
  it("is served to signed-in devices only", async () => {
    expect((await fetch(`${base}/api/family`)).status).toBe(401);
    const response = await fetch(`${base}/api/family`, {
      headers: { cookie: await sessionCookie() },
    });
    const family = (await response.json()) as { id: string; role: string }[];
    expect(family.map((member) => member.role)).toEqual([
      "grownup",
      "big-kid",
      "middle-kid",
      "little-kid",
    ]);
  });
});
