import { PerformanceMonitor, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Color, type DirectionalLight, NeutralToneMapping, type Object3D, Vector3 } from "three";
import { type SkyState, skyAt } from "../systems/clock.ts";
import { countFrame } from "../testing/index.ts";

// Shared R3F pieces every 3D game uses.

const MAX_DPR = 1.5;
// Stable objects: R3F re-applies these props whenever they change identity.
const CAMERA = { position: [0, 10, 10] as [number, number, number], fov: 45, near: 0.1, far: 200 };
const GL = {
  antialias: true,
  powerPreference: "high-performance" as const,
  toneMapping: NeutralToneMapping,
};

/** The canvas with iPad-friendly defaults: capped DPR that drops if frames get slow. */
export function GameCanvas({ children }: { children: ReactNode }) {
  const [dpr, setDpr] = useState(MAX_DPR);
  return (
    <Canvas shadows dpr={dpr} camera={CAMERA} gl={GL}>
      <PerformanceMonitor
        onDecline={() => setDpr((value) => Math.max(1, value - 0.25))}
        onIncline={() => setDpr((value) => Math.min(MAX_DPR, value + 0.25))}
      />
      <FrameCounter />
      {children}
    </Canvas>
  );
}

function FrameCounter() {
  useFrame(() => countFrame());
  return null;
}

/** Hour override for screenshots and testing: ?hour=21 */
export function hourOverride(): number | undefined {
  if (typeof location === "undefined") return undefined;
  const value = new URLSearchParams(location.search).get("hour");
  if (value === null) return undefined;
  const hour = Number(value);
  return Number.isFinite(hour) ? hour : undefined;
}

export function currentSky(): SkyState {
  const date = new Date();
  const hour = hourOverride();
  if (hour !== undefined) date.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
  return skyAt(date);
}

/** Re-reads the sky every 30 s so day turns to night while you play. */
export function useSky(): SkyState {
  const [sky, setSky] = useState(currentSky);
  useEffect(() => {
    const timer = setInterval(() => setSky(currentSky()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return sky;
}

const NIGHT = new Color("#1d2b53");
const DAY = new Color("#bfe6ff");
const DUSK = new Color("#f6b07a");

/**
 * Background, fog, and lights for the time of day. The sun casts shadows over an area of
 * `shadowSize` around `focus` (usually the player).
 */
export function SkyAndLights({
  focus,
  shadowSize = 24,
  sky: forcedSky,
}: {
  focus?: RefObject<Object3D | null>;
  shadowSize?: number;
  /** Fixed sky instead of the real clock (e.g. a day/night toggle). */
  sky?: SkyState;
}) {
  const clockSky = useSky();
  const sky = forcedSky ?? clockSky;
  const sun = useRef<DirectionalLight>(null);
  const { scene } = useThree();

  const colors = useMemo(() => {
    const background = NIGHT.clone().lerp(DAY, sky.daylight);
    if (sky.phase === "dawn" || sky.phase === "dusk") {
      background.lerp(DUSK, 0.45 * (1 - Math.abs(sky.daylight - 0.5) * 2));
    }
    return { background };
  }, [sky]);

  useEffect(() => {
    scene.background = colors.background;
  }, [scene, colors]);

  const offset = useMemo(() => new Vector3(8, 14, 6), []);
  useFrame(() => {
    const light = sun.current;
    const target = focus?.current;
    if (!light || !target) return;
    light.position.copy(target.position).add(offset);
    light.target.position.copy(target.position);
    light.target.updateMatrixWorld();
  });

  const night = 1 - sky.daylight;
  return (
    <>
      <fog attach="fog" args={[colors.background, 30, 70]} />
      <hemisphereLight args={["#ffffff", "#7fae5f", 0.55 + sky.daylight * 0.75]} />
      <directionalLight
        ref={sun}
        position={[8, 14, 6]}
        intensity={0.25 + sky.daylight * 1.6}
        color={sky.phase === "day" ? "#fff6e5" : "#ffd2a8"}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
        shadow-camera-left={-shadowSize / 2}
        shadow-camera-right={shadowSize / 2}
        shadow-camera-top={shadowSize / 2}
        shadow-camera-bottom={-shadowSize / 2}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />
      {night > 0.5 && <Stars radius={80} depth={20} count={1500} factor={3} fade speed={0.5} />}
    </>
  );
}

/** Animal Crossing–style camera: fixed angle, smoothly following a target. */
export function FollowCamera({
  target,
  offset = [0, 9, 9],
  lookOffset = [0, 0.8, 0],
}: {
  target: RefObject<Object3D | null>;
  offset?: [number, number, number];
  lookOffset?: [number, number, number];
}) {
  const desired = useMemo(() => new Vector3(), []);
  const look = useMemo(() => new Vector3(), []);
  const first = useRef(true);
  const size = useThree((state) => state.size);
  // Tall screens (an iPad in portrait) see less sideways, so pull the camera back.
  const aspect = size.width / Math.max(1, size.height);
  const pull = aspect < 1.3 ? (1.3 / aspect) ** 0.6 : 1;
  useFrame(({ camera }, delta) => {
    const object = target.current;
    if (!object) return;
    desired.set(
      object.position.x + offset[0] * pull,
      object.position.y + offset[1] * pull,
      object.position.z + offset[2] * pull,
    );
    if (first.current) {
      camera.position.copy(desired);
      first.current = false;
    } else {
      camera.position.lerp(desired, 1 - Math.exp(-delta * 5));
    }
    look.set(
      camera.position.x - offset[0] * pull + lookOffset[0],
      camera.position.y - offset[1] * pull + lookOffset[1],
      camera.position.z - offset[2] * pull + lookOffset[2],
    );
    camera.lookAt(look);
  });
  return null;
}
