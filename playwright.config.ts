import { defineConfig, devices } from "@playwright/test";

const worker = process.env.E2E_TARGET === "worker";
// E2E_BASE_URL (+ E2E_PASSCODE) points the tests at a deployed site instead.
const deployed = process.env.E2E_BASE_URL;

// Smoke tests run against the built site (pnpm build) served by e2e/test-server.ts.
// Screenshots land in test-results/ so agents can look at what they built.
export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  reporter: "list",
  // Headless WebGL is software-rendered here, so 3D scenes are slow to warm up.
  timeout: 60_000,
  use: {
    baseURL: deployed ?? (worker ? "http://127.0.0.1:8787" : "http://127.0.0.1:8100"),
  },
  // E2E_TARGET=worker runs the same tests against the Cloudflare Worker (wrangler dev).
  webServer: deployed
    ? []
    : worker
      ? {
          command: "node e2e/worker-server.ts",
          url: "http://127.0.0.1:8787/healthz",
          reuseExistingServer: false,
          timeout: 120_000,
        }
      : {
          command: "node e2e/test-server.ts",
          url: "http://127.0.0.1:8100/healthz",
          reuseExistingServer: false,
        },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "ipad-webkit", use: { ...devices["iPad (gen 7)"] } },
  ],
});
