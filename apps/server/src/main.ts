import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { Rooms } from "./rooms.ts";

const port = Number(process.env.PORT ?? 8000);
const host = process.env.HOST ?? "0.0.0.0";
const siteDir =
  process.env.TREEHOUSE_SITE_DIR ?? fileURLToPath(new URL("../../../dist/site", import.meta.url));
const passcodeHash = process.env.TREEHOUSE_PASSCODE_HASH;
const secret = process.env.TREEHOUSE_SECRET;

if (!passcodeHash || !secret) {
  console.error(
    "TREEHOUSE_PASSCODE_HASH and TREEHOUSE_SECRET must be set. Run `pnpm passcode:set` first.",
  );
  process.exit(1);
}

const familyPath =
  process.env.TREEHOUSE_FAMILY ??
  fileURLToPath(new URL("../../../data/family.json", import.meta.url));
const rooms = new Rooms(
  process.env.TREEHOUSE_WORLDS_DIR ?? join(homedir(), ".local/share/treehouse/worlds"),
);

const server = createApp({ siteDir, passcodeHash, secret, familyPath, rooms });
server.listen(port, host, () => {
  console.log(`treehouse server on http://${host}:${port} serving ${siteDir}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    rooms.flush();
    server.close(() => process.exit(0));
    // Open WebSockets keep the server alive; don't wait on them.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
