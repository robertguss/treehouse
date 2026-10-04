import { useCallback, useEffect, useState } from "react";
import type { Member } from "../net/protocol.ts";

// Who is playing on this device. The family roster lives on the server (data/family.json);
// each device remembers which member it belongs to, so kids pick once and never again.

export type InputPreset = Member["input"];
export type UiPreset = Member["ui"];

const PROFILE_KEY = "treehouse.profile";

export function storedProfileId(): string | null {
  try {
    return localStorage.getItem(PROFILE_KEY);
  } catch {
    return null;
  }
}

export function storeProfileId(id: string | null): void {
  try {
    if (id) localStorage.setItem(PROFILE_KEY, id);
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Private mode: the picker will just ask again next time.
  }
}

export async function fetchFamily(): Promise<Member[]> {
  const response = await fetch("/api/family", { credentials: "same-origin" });
  if (!response.ok) throw new Error(`family roster: HTTP ${response.status}`);
  return (await response.json()) as Member[];
}

/** Presets a device would pick on its own: touch screens get the kid shell. */
export function devicePresets(): { input: InputPreset; ui: UiPreset } {
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return coarse ? { input: "touch", ui: "kid" } : { input: "desktop", ui: "standard" };
}

/**
 * The member's presets, with `?input=` and `?ui=` URL overrides for testing
 * (e.g. trying the kid shell on a laptop).
 */
export function presetsFor(member: Pick<Member, "input" | "ui">): {
  input: InputPreset;
  ui: UiPreset;
} {
  const params = new URLSearchParams(location.search);
  const input = params.get("input");
  const ui = params.get("ui");
  return {
    input: input === "touch" || input === "desktop" ? input : member.input,
    ui: ui === "kid" || ui === "standard" ? ui : member.ui,
  };
}

export interface DeviceProfile {
  family: Member[] | undefined;
  profile: Member | undefined;
  error: string | undefined;
  choose(id: string | null): void;
}

/** Loads the roster and this device's chosen member. `?as=<id>` picks one for tests. */
export function useDeviceProfile(): DeviceProfile {
  const [family, setFamily] = useState<Member[]>();
  const [error, setError] = useState<string>();
  const [chosen, setChosen] = useState<string | null>(() => {
    const forced = new URLSearchParams(location.search).get("as");
    if (forced) storeProfileId(forced);
    return forced ?? storedProfileId();
  });

  useEffect(() => {
    fetchFamily().then(setFamily, (reason: unknown) => setError(String(reason)));
  }, []);

  const choose = useCallback((id: string | null) => {
    storeProfileId(id);
    setChosen(id);
  }, []);

  const profile = family?.find((member) => member.id === chosen);
  return { family, profile, error, choose };
}
