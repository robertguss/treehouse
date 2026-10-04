import { type ReactNode, useEffect, useRef, useState } from "react";
import type { InputPreset } from "../profile/index.ts";
import "./input.css";

// One input layer for every game. Games read a snapshot with useControls() inside useFrame
// and never listen to keyboard or touch events themselves.
//
// touch:   drag anywhere = floating joystick; a quick tap is left to the scene (tap-to-go,
//          tap-to-interact via R3F onClick + isTap()).
// desktop: WASD/arrows to move, Shift to run, E/Space to interact; clicks go to the scene.

export interface ControlsSnapshot {
  /** Movement in screen space: x right, z down (toward the camera), length 0..1. */
  move: { x: number; z: number };
  run: boolean;
  /** Joystick or keys are in use right now (cancels tap-to-go). */
  steering: boolean;
}

const state = {
  move: { x: 0, z: 0 },
  run: false,
  steering: false,
  keys: new Set<string>(),
  interactQueued: false,
  joystick: { x: 0, z: 0, active: false },
};

export function useControls(): () => ControlsSnapshot {
  return readControls;
}

export function readControls(): ControlsSnapshot {
  let x = state.joystick.x;
  let z = state.joystick.z;
  let run = state.joystick.active && Math.hypot(x, z) > 0.85;
  if (state.keys.size > 0) {
    const k = state.keys;
    x = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0);
    z = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0);
    const length = Math.hypot(x, z);
    if (length > 0) {
      x /= length;
      z /= length;
    }
    run = k.has("shift");
  }
  state.move.x = x;
  state.move.z = z;
  state.run = run;
  state.steering = Math.hypot(x, z) > 0.05;
  return state;
}

/** True once per E/Space press (desktop). */
export function consumeInteract(): boolean {
  const queued = state.interactQueued;
  state.interactQueued = false;
  return queued;
}

/** R3F click events carry how far the pointer moved; drags are joystick, not taps. */
export function isTap(event: { delta: number }): boolean {
  return event.delta < 14;
}

/** Test hook: drive the controls without real input. */
export function setTestMove(x: number, z: number): void {
  state.joystick = { x, z, active: x !== 0 || z !== 0 };
}

const JOYSTICK_RADIUS = 60;
const DRAG_THRESHOLD = 14;

/**
 * Wrap the canvas in this. It listens to pointers on its own element without blocking the
 * scene's taps, draws the joystick, and handles the keyboard.
 */
export function ControlsLayer({ preset, children }: { preset: InputPreset; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let pointer: { id: number; ox: number; oy: number; dragging: boolean } | null = null;

    const onDown = (event: PointerEvent) => {
      if (pointer || (event.target as HTMLElement).closest("[data-ui]")) return;
      pointer = { id: event.pointerId, ox: event.clientX, oy: event.clientY, dragging: false };
    };
    const onMove = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      // Mouse drags only steer in the touch preset (desktop has keys).
      if (preset === "desktop" && event.pointerType === "mouse") return;
      const dx = event.clientX - pointer.ox;
      const dy = event.clientY - pointer.oy;
      if (!pointer.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      pointer.dragging = true;
      const length = Math.hypot(dx, dy);
      const scale = length > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / length : 1;
      state.joystick = {
        x: (dx * scale) / JOYSTICK_RADIUS,
        z: (dy * scale) / JOYSTICK_RADIUS,
        active: true,
      };
      setStick({ ox: pointer.ox, oy: pointer.oy, x: dx * scale, y: dy * scale });
    };
    const onUp = (event: PointerEvent) => {
      if (!pointer || event.pointerId !== pointer.id) return;
      pointer = null;
      state.joystick = { x: 0, z: 0, active: false };
      setStick(null);
    };

    element.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      element.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [preset]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      const key = event.key.toLowerCase();
      if (key === "e" || key === " ") {
        if (!event.repeat) state.interactQueued = true;
        event.preventDefault();
        return;
      }
      state.keys.add(key);
    };
    const onKeyUp = (event: KeyboardEvent) => state.keys.delete(event.key.toLowerCase());
    const onBlur = () => state.keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <div ref={root} className="th-controls">
      {children}
      {stick && (
        <div className="th-stick" style={{ left: stick.ox, top: stick.oy }}>
          <div
            className="th-stick-knob"
            style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}
          />
        </div>
      )}
    </div>
  );
}
