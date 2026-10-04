import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

// Family-grade access control: one shared passcode per household. A correct passcode
// earns a long-lived cookie whose value is derived from the server secret, so rotating
// the secret signs every device out.

export const SESSION_COOKIE = "th_session";

// Files a device must reach before it has a session: Safari fetches the manifest and
// icons without cookies when adding to the home screen.
export const PUBLIC_PATHS = new Set([
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon.svg",
]);
export const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export function verifyPasscode(passcode: string, stored: string): boolean {
  const [scheme, saltText, hashText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = scryptSync(
    normalize(passcode),
    Buffer.from(saltText, "base64url"),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}

export function sessionToken(secret: string): string {
  return createHmac("sha256", secret).update("treehouse-session-v1").digest("base64url");
}

export function isValidSession(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const expected = Buffer.from(sessionToken(secret));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

// Only same-site paths are allowed as a post-login destination.
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

// Passcodes are typed on iPads by grown-ups in a hurry: ignore case and surrounding spaces.
export function normalize(passcode: string): string {
  return passcode.trim().toLowerCase();
}

/** Slows down passcode guessing: only wrong attempts count. */
export class LoginRateLimiter {
  readonly #failures = new Map<string, number[]>();
  readonly #max: number;
  readonly #windowMs: number;

  constructor(max = 10, windowMs = 10 * 60 * 1000) {
    this.#max = max;
    this.#windowMs = windowMs;
  }

  blocked(key: string, now: number): boolean {
    return this.#recent(key, now).length >= this.#max;
  }

  fail(key: string, now: number): void {
    this.#failures.set(key, [...this.#recent(key, now), now]);
  }

  #recent(key: string, now: number): number[] {
    return (this.#failures.get(key) ?? []).filter((at) => now - at < this.#windowMs);
  }
}
