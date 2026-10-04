import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Model, preloadModels } from "@treehouse/kit/assets";
import { sfx } from "@treehouse/kit/audio";
import { isTap } from "@treehouse/kit/input";
import { connectNetworkRoom, createLocalRoom, type Member, type Room } from "@treehouse/kit/net";
import { presetsFor, useDeviceProfile } from "@treehouse/kit/profile";
import { GameCanvas, SkyAndLights } from "@treehouse/kit/render";
import { usePeerIds, useRoomState, useRoomStatus } from "@treehouse/kit/room";
import { GameShell } from "@treehouse/kit/shell";
import { exposeTestHook } from "@treehouse/kit/testing";
import { UiProvider } from "@treehouse/kit/ui";
import { StrictMode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Group, Vector3 } from "three";
import { game, type State } from "./rules/index.ts";
import "./index.css";

// __TITLE__: a starter shared-world game. Everyone in the family taps the sheep, and the
// count is shared live across devices. Replace the scene and rules with your game; keep the
// shape (profile → room → shell → canvas + HUD). Write docs/games/__NAME__.md first.
//
// ?local        run without a server (single player, saved in this browser)
// ?world=<id>   join another shared world (tests use throwaway worlds)
// ?as=<member>  play as this family member on this device
// ?autostart    skip the title screen

const params = new URLSearchParams(location.search);
const WORLD = params.get("world") ?? "family";

preloadModels(["animals/sheep"]);

function Boot() {
  if (params.has("local")) return <LocalGame />;
  return <SharedGame />;
}

function SharedGame() {
  const { family, profile, error } = useDeviceProfile();
  useEffect(() => {
    // Nobody chosen on this device yet: the launcher asks "who are you?" and comes back.
    if (family && !profile) {
      location.href = `/?pick=1&next=${encodeURIComponent(location.pathname + location.search)}`;
    }
  }, [family, profile]);
  if (error) return <div className="splash">📡</div>;
  if (!family || !profile) return <div className="splash">🌱</div>;
  return <Connected profile={profile} />;
}

function Connected({ profile }: { profile: Member }) {
  const room = useMemo(
    () => connectNetworkRoom<State>({ game: "__NAME__", world: WORLD, player: profile.id }),
    [profile.id],
  );
  useEffect(() => () => room.close(), [room]);
  return <App room={room} me={profile} />;
}

const LOCAL_MEMBER: Member = {
  id: "local",
  name: "Me",
  avatar: "🦊",
  color: "#e8743b",
  role: "grownup",
  input: matchMedia("(pointer: coarse)").matches ? "touch" : "desktop",
  ui: matchMedia("(pointer: coarse)").matches ? "kid" : "standard",
};

function LocalGame() {
  const room = useMemo<Room<State>>(
    () => createLocalRoom<State>({ game, member: LOCAL_MEMBER, storageKey: "treehouse.__NAME__" }),
    [],
  );
  return <App room={room} me={LOCAL_MEMBER} />;
}

function App({ room, me }: { room: Room<State>; me: Member }) {
  const presets = presetsFor(me);
  const status = useRoomStatus(room);
  useEffect(() => {
    exposeTestHook({
      state: () => room.getState(),
      dispatch: (name: string, input: unknown) => room.dispatch(name, input),
    });
  }, [room]);
  return (
    <GameShell
      title="__TITLE__"
      emoji="__EMOJI__"
      preset={presets.ui}
      autoStart={params.has("autostart")}
    >
      <div style={{ position: "fixed", inset: 0, touchAction: "none" }}>
        <GameCanvas>
          <SkyAndLights />
          <Suspense fallback={null}>{status === "online" && <Meadow room={room} />}</Suspense>
        </GameCanvas>
      </div>
      <UiProvider preset={presets.ui}>
        {status === "online" ? <Hud room={room} me={me} /> : <div className="splash">🌱</div>}
      </UiProvider>
    </GameShell>
  );
}

function Meadow({ room }: { room: Room<State> }) {
  const sheep = useRef<Group>(null);
  const [hearts, setHearts] = useState(0);
  const hopStarted = useRef(-10);

  useFrame(({ camera, clock, size }) => {
    camera.position.set(0, 3, 7);
    camera.lookAt(0, 0.8, 0);
    const object = sheep.current;
    if (object) {
      const t = clock.elapsedTime - hopStarted.current;
      object.position.y = t < 0.6 ? Math.sin((t / 0.6) * Math.PI) * 0.8 : 0;
      object.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.4;
    }
    // Tests ask where the sheep is on screen instead of guessing pixels.
    exposeTestHook({
      sheepOnScreen: () => {
        const point = new Vector3(0, 0.8, 0).project(camera);
        return { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height };
      },
    });
    // A tap marks the hop with -1; start it on this frame's clock.
    if (hopStarted.current === -1) hopStarted.current = clock.elapsedTime;
  });

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#9bd67a" />
      </mesh>
      <group
        ref={sheep}
        onClick={(event) => {
          if (!isTap(event)) return;
          event.stopPropagation();
          sfx("baa");
          hopStarted.current = -1;
          setHearts((count) => count + 1);
          void room.dispatch("tap", {});
        }}
      >
        <Model model="animals/sheep" scale={1.8} />
        {hearts > 0 && (
          <Html key={hearts} position={[0, 2.4, 0]} center style={{ pointerEvents: "none" }}>
            <div className="hearts">💛💖💛</div>
          </Html>
        )}
      </group>
    </>
  );
}

function Hud({ room, me }: { room: Room<State>; me: Member }) {
  const total = useRoomState(room, (state) => state.total);
  const mine = useRoomState(room, (state) => state.players[me.id]?.taps ?? 0);
  const peerIds = usePeerIds(room);
  const peers = peerIds
    .split(",")
    .filter(Boolean)
    .map((id) => room.getPeers().get(id)?.member)
    .filter((member) => member !== undefined);
  return (
    <>
      <div className="score" data-testid="total">
        🐑 <span>{total}</span>
      </div>
      <div className="mine" data-testid="mine">
        {me.avatar} <span>{mine}</span>
      </div>
      {peers.length > 0 && (
        <div className="online" data-testid="online">
          {peers.map((member) => (
            <span key={member.id} style={{ borderColor: member.color }}>
              {member.avatar}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
