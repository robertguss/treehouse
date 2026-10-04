// A single global test hook, window.__game, that Playwright uses to read state and drive
// games without pixel-hunting. Games add what they want tests to see.

declare global {
  interface Window {
    __game?: Record<string, unknown>;
  }
}

export function exposeTestHook(values: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.__game = Object.assign(window.__game ?? {}, values);
}

/** Counts rendered frames so tests can wait for the scene to be live. */
export function countFrame(): void {
  if (typeof window === "undefined") return;
  window.__game ??= {};
  const hook = window.__game;
  hook.frames = ((hook.frames as number | undefined) ?? 0) + 1;
}
