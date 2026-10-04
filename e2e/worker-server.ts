// Runs the Cloudflare Worker locally (wrangler dev) with the test passcode, for
// `pnpm e2e:worker`. Durable Object storage goes to a throwaway directory.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPasscode } from "../apps/server/src/hash.ts";
import { TEST_PASSCODE, WORKER_PORT } from "./constants.ts";

const workerDir = fileURLToPath(new URL("../apps/worker", import.meta.url));
const child = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--port",
    String(WORKER_PORT),
    "--ip",
    "127.0.0.1",
    "--persist-to",
    mkdtempSync(join(tmpdir(), "treehouse-worker-")),
    "--var",
    `PASSCODE_HASH:${hashPasscode(TEST_PASSCODE)}`,
    "--var",
    "SECRET:e2e",
    "--show-interactive-dev-session=false",
  ],
  { cwd: workerDir, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
