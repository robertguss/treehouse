import { randomBytes, scryptSync } from "node:crypto";
import { normalize } from "./auth.ts";

// Creating a passcode hash (scripts and tests). Verifying lives in auth.ts, which also runs
// on Cloudflare.

const SCRYPT_KEYLEN = 32;

export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(normalize(passcode), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
