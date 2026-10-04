import { readFileSync } from "node:fs";
import type { Member } from "@treehouse/kit/net";
import { parseFamily } from "./family-schema.ts";

// Read on every use so edits to data/family.json apply immediately on the Node server.
export function loadFamily(path: string): Member[] {
  return parseFamily(JSON.parse(readFileSync(path, "utf8")), path);
}
