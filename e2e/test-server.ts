// Serves the built site for Playwright with a known passcode, separate from the real server.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../apps/server/src/app.ts";
import { hashPasscode } from "../apps/server/src/hash.ts";
import { Rooms } from "../apps/server/src/rooms.ts";

import { TEST_PASSCODE, TEST_PORT } from "./constants.ts";

const siteDir = fileURLToPath(new URL("../dist/site", import.meta.url));
const familyPath = fileURLToPath(new URL("../data/family.json", import.meta.url));
// A fresh, throwaway world directory per test run.
const rooms = new Rooms(mkdtempSync(join(tmpdir(), "treehouse-e2e-worlds-")));
createApp({
  siteDir,
  passcodeHash: hashPasscode(TEST_PASSCODE),
  secret: "e2e",
  familyPath,
  rooms,
}).listen(TEST_PORT, "127.0.0.1");
