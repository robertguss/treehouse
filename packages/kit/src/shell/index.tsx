import { type ReactNode, useEffect } from "react";
import { create } from "zustand";
import { unlockAudio, useAudioSettings } from "../audio/index.ts";
import type { UiPreset } from "../profile/index.ts";
import { IconButton, UiProvider, useUiPreset } from "../ui/index.tsx";
import "./shell.css";

// Every game gets the same frame: a title screen with one big Play button, a home button
// and a pause button while playing, and a pause menu with resume, sound, and home.
// The scene renders behind the title screen, so it's loaded by the time Play is pressed.

export type ShellPhase = "title" | "playing" | "paused";

interface ShellState {
  phase: ShellPhase;
  setPhase(phase: ShellPhase): void;
}

export const useShell = create<ShellState>((set) => ({
  phase: "title",
  setPhase: (phase) => set({ phase }),
}));

export interface GameShellProps {
  title: string;
  emoji: string;
  preset: UiPreset;
  /** The game's canvas and overlays. */
  children: ReactNode;
  /** Extra buttons in the top bar while playing (right side). */
  toolbar?: ReactNode;
  /** Skip the title screen (tests, or games that should start instantly). */
  autoStart?: boolean;
}

export function GameShell({ title, emoji, preset, children, toolbar, autoStart }: GameShellProps) {
  const phase = useShell((state) => state.phase);
  const setPhase = useShell((state) => state.setPhase);
  useEffect(() => {
    if (autoStart) setPhase("playing");
  }, [autoStart, setPhase]);

  return (
    <>
      {children}
      <UiProvider preset={preset}>
        {phase === "title" && (
          <div className="th-title" data-ui data-testid="title-screen">
            <div className="th-title-emoji">{emoji}</div>
            {preset === "standard" && <h1>{title}</h1>}
            <IconButton
              icon="▶️"
              label="Play"
              size="large"
              testId="play"
              onPress={() => {
                unlockAudio();
                setPhase("playing");
              }}
            />
          </div>
        )}
        {phase !== "title" && (
          <div className="th-topbar">
            <IconButton icon="🏠" label="Home" size="small" onPress={goHome} />
            <div className="th-topbar-right">
              {toolbar}
              <IconButton
                icon="⏸️"
                label="Pause"
                size="small"
                testId="pause"
                onPress={() => setPhase("paused")}
              />
            </div>
          </div>
        )}
        {phase === "paused" && <PauseMenu onResume={() => setPhase("playing")} />}
      </UiProvider>
    </>
  );
}

function PauseMenu({ onResume }: { onResume(): void }) {
  const muted = useAudioSettings((state) => state.muted);
  const toggleMuted = useAudioSettings((state) => state.toggleMuted);
  const preset = useUiPreset();
  return (
    <div className="th-pause" data-ui data-testid="pause-menu">
      {preset === "standard" && <h2>Paused</h2>}
      <div className="th-pause-buttons">
        <IconButton icon="▶️" label="Resume" size="large" onPress={onResume} />
        <IconButton
          icon={muted ? "🔇" : "🔊"}
          label={muted ? "Sound off" : "Sound on"}
          size="large"
          onPress={toggleMuted}
        />
        <IconButton icon="🏠" label="Home" size="large" onPress={goHome} />
      </div>
    </div>
  );
}

function goHome(): void {
  location.href = "/";
}
