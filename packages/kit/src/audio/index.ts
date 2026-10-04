import { create } from "zustand";

// Little synthesized sound effects, so games need no audio files and nothing to license.
// iPad Safari only allows audio after a user gesture: unlockAudio() runs on the first tap.

let context: AudioContext | undefined;
let master: GainNode | undefined;

function audio(): { ctx: AudioContext; out: GainNode } | undefined {
  if (typeof AudioContext === "undefined") return undefined;
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = useAudioSettings.getState().muted ? 0 : 0.6;
    master.connect(context.destination);
  }
  return master ? { ctx: context, out: master } : undefined;
}

/** Call from a user gesture (the shell's Play button does). */
export function unlockAudio(): void {
  const a = audio();
  if (a && a.ctx.state !== "running") void a.ctx.resume();
}

if (typeof window !== "undefined") {
  const unlock = () => unlockAudio();
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
}

const MUTE_KEY = "treehouse.muted";

interface AudioSettings {
  muted: boolean;
  toggleMuted(): void;
}

export const useAudioSettings = create<AudioSettings>((set, get) => ({
  muted: readMuted(),
  toggleMuted: () => {
    const muted = !get().muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {}
    if (master) master.gain.value = muted ? 0 : 0.6;
    set({ muted });
  },
}));

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

interface Tone {
  type?: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  volume?: number;
  delay?: number;
  vibrato?: number;
}

function tone({
  type = "sine",
  from,
  to = from,
  duration,
  volume = 0.5,
  delay = 0,
  vibrato,
}: Tone) {
  const a = audio();
  if (a?.ctx.state !== "running") return;
  const start = a.ctx.currentTime + delay;
  const osc = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
  if (vibrato) {
    const lfo = a.ctx.createOscillator();
    const depth = a.ctx.createGain();
    lfo.frequency.value = vibrato;
    depth.gain.value = from * 0.06;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(start);
    lfo.stop(start + duration);
  }
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(a.out);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noise(duration: number, volume: number, filterFrom: number, filterTo: number, delay = 0) {
  const a = audio();
  if (a?.ctx.state !== "running") return;
  const start = a.ctx.currentTime + delay;
  const buffer = a.ctx.createBuffer(1, Math.ceil(a.ctx.sampleRate * duration), a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = a.ctx.createBufferSource();
  source.buffer = buffer;
  const filter = a.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFrom, start);
  filter.frequency.exponentialRampToValueAtTime(filterTo, start + duration);
  const gain = a.ctx.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(a.out);
  source.start(start);
}

const SOUNDS = {
  tap: () => tone({ from: 660, to: 880, duration: 0.08, volume: 0.25 }),
  pop: () => tone({ from: 400, to: 1200, duration: 0.12, volume: 0.4 }),
  coin: () => {
    tone({ type: "square", from: 988, duration: 0.08, volume: 0.15 });
    tone({ type: "square", from: 1319, duration: 0.25, volume: 0.15, delay: 0.08 });
  },
  harvest: () => {
    for (const [i, f] of [523, 659, 784, 1047].entries()) {
      tone({ type: "triangle", from: f, duration: 0.15, volume: 0.3, delay: i * 0.07 });
    }
  },
  plant: () => {
    noise(0.15, 0.4, 600, 300);
    tone({ from: 300, to: 200, duration: 0.12, volume: 0.25, delay: 0.05 });
  },
  water: () => noise(0.5, 0.35, 2500, 900),
  rustle: () => noise(0.4, 0.3, 1800, 3500),
  sparkle: () => {
    for (const [i, f] of [1568, 2093, 2637].entries()) {
      tone({ from: f, duration: 0.2, volume: 0.12, delay: i * 0.05 });
    }
  },
  nope: () => tone({ type: "triangle", from: 300, to: 220, duration: 0.18, volume: 0.25 }),
  door: () => {
    tone({ type: "triangle", from: 440, to: 330, duration: 0.15, volume: 0.25 });
    tone({ type: "triangle", from: 330, to: 440, duration: 0.15, volume: 0.25, delay: 0.15 });
  },
  moo: () =>
    tone({ type: "sawtooth", from: 150, to: 110, duration: 0.9, volume: 0.18, vibrato: 5 }),
  baa: () =>
    tone({ type: "sawtooth", from: 420, to: 380, duration: 0.6, volume: 0.13, vibrato: 14 }),
  oink: () => {
    noise(0.12, 0.3, 500, 400);
    tone({ type: "square", from: 220, to: 180, duration: 0.12, volume: 0.12 });
    tone({ type: "square", from: 240, to: 190, duration: 0.12, volume: 0.12, delay: 0.16 });
  },
  neigh: () =>
    tone({ type: "sawtooth", from: 900, to: 500, duration: 0.8, volume: 0.1, vibrato: 18 }),
  hum: () =>
    tone({ type: "triangle", from: 330, to: 300, duration: 0.5, volume: 0.15, vibrato: 7 }),
  woof: () => {
    tone({ type: "square", from: 300, to: 160, duration: 0.12, volume: 0.15 });
    tone({ type: "square", from: 320, to: 170, duration: 0.12, volume: 0.15, delay: 0.18 });
  },
  quack: () =>
    tone({ type: "sawtooth", from: 700, to: 500, duration: 0.2, volume: 0.12, vibrato: 30 }),
} as const;

export type SoundName = keyof typeof SOUNDS;

export function sfx(name: SoundName): void {
  if (useAudioSettings.getState().muted) return;
  SOUNDS[name]();
}
