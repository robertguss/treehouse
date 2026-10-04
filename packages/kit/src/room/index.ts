import { useSyncExternalStore } from "react";
import type { Room } from "../net/client.ts";

// React bindings for a Room. Components read state through selectors and re-render only
// when the selected value changes (immer keeps unchanged parts referentially equal).

export function useRoomState<S, T>(room: Room<S>, selector: (state: S) => T): T {
  return useSyncExternalStore(
    (listener) => room.subscribe(listener),
    () => selector(room.getState()),
  );
}

export function useRoomStatus<S>(room: Room<S>): Room<S>["status"] {
  return useSyncExternalStore(
    (listener) => room.subscribe(listener),
    () => room.status,
  );
}

/** Ids of other players in the room, for rendering them. Presence is read per frame. */
export function usePeerIds<S>(room: Room<S>): string {
  return useSyncExternalStore(
    (listener) => room.subscribe(listener),
    () => [...room.getPeers().keys()].sort().join(","),
  );
}
