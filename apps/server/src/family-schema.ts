import { Member } from "@treehouse/kit/net/protocol";
import { z } from "zod";

// The family roster format (data/family.json), validated wherever it's loaded.

const FamilyFile = z.object({ members: z.array(Member).min(1) });

export function parseFamily(data: unknown, source = "family.json"): Member[] {
  const parsed = FamilyFile.safeParse(data);
  if (!parsed.success) throw new Error(`${source} is invalid: ${parsed.error.message}`);
  const ids = new Set<string>();
  for (const member of parsed.data.members) {
    if (ids.has(member.id)) throw new Error(`${source}: duplicate member id ${member.id}`);
    ids.add(member.id);
  }
  return parsed.data.members;
}
