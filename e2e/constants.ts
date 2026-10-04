export const TEST_PASSCODE = process.env.E2E_PASSCODE ?? "test passcode";
export const TEST_PORT = 8100;
export const WORKER_PORT = 8787;

declare global {
  // The game test hook (see @treehouse/kit/testing).
  interface Window {
    __game?: Record<string, unknown>;
  }
}
