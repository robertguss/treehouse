import { describe, expect, it } from "vitest";
import {
  isValidSession,
  LoginRateLimiter,
  parseCookies,
  safeNext,
  sessionToken,
  verifyPasscode,
} from "../src/auth.ts";
import { hashPasscode } from "../src/hash.ts";

describe("passcode", () => {
  it("verifies the right passcode, ignoring case and spaces", () => {
    const stored = hashPasscode("Carrot Moon");
    expect(verifyPasscode("carrot moon", stored)).toBe(true);
    expect(verifyPasscode("  CARROT MOON ", stored)).toBe(true);
  });

  it("rejects a wrong passcode and malformed hashes", () => {
    const stored = hashPasscode("carrot moon");
    expect(verifyPasscode("carrot", stored)).toBe(false);
    expect(verifyPasscode("carrot moon", "nonsense")).toBe(false);
  });
});

describe("session", () => {
  it("accepts only the token derived from the current secret", () => {
    expect(isValidSession(sessionToken("a"), "a")).toBe(true);
    expect(isValidSession(sessionToken("a"), "b")).toBe(false);
    expect(isValidSession(undefined, "a")).toBe(false);
    expect(isValidSession("short", "a")).toBe(false);
  });

  it("parses cookie headers", () => {
    const cookies = parseCookies("a=1; th_session=abc%3D; empty=");
    expect(cookies.get("th_session")).toBe("abc=");
    expect(cookies.get("a")).toBe("1");
  });
});

describe("safeNext", () => {
  it("keeps same-site paths and rejects everything else", () => {
    expect(safeNext("/games/hello/")).toBe("/games/hello/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});

describe("LoginRateLimiter", () => {
  it("blocks after too many wrong tries and recovers after the window", () => {
    const limiter = new LoginRateLimiter(2, 1000);
    expect(limiter.blocked("ip", 0)).toBe(false);
    limiter.fail("ip", 0);
    limiter.fail("ip", 1);
    expect(limiter.blocked("ip", 2)).toBe(true);
    expect(limiter.blocked("other", 2)).toBe(false);
    expect(limiter.blocked("ip", 5000)).toBe(false);
  });
});
