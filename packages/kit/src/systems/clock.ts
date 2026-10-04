// Real-time helpers. Things that change over time store timestamps; their current value is
// computed from the clock when someone looks, so nothing ticks while nobody plays.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Elapsed time that runs faster for a while after a boost (e.g. watering). */
export interface Boostable {
  startedAt: number;
  /** When the current boost began, if any. */
  boostedAt?: number | undefined;
  /** Extra time already earned from earlier boosts. */
  bankedMs: number;
}

export interface BoostRule {
  /** How long one boost lasts. */
  durationMs: number;
  /** Extra speed while boosted: 0.5 means 1.5× as fast. */
  extraRate: number;
}

function currentBonus(item: Boostable, now: number, rule: BoostRule): number {
  if (item.boostedAt === undefined) return 0;
  const boosted = Math.min(Math.max(0, now - item.boostedAt), rule.durationMs);
  return boosted * rule.extraRate;
}

/** Effective elapsed time, including all boosts. */
export function boostedElapsed(item: Boostable, now: number, rule: BoostRule): number {
  return Math.max(0, now - item.startedAt) + item.bankedMs + currentBonus(item, now, rule);
}

/** Starts a new boost, banking what the previous one earned. Mutates the item. */
export function applyBoost(item: Boostable, now: number, rule: BoostRule): void {
  item.bankedMs += currentBonus(item, now, rule);
  item.boostedAt = now;
}

/** True while a boost is still running. */
export function isBoosted(item: Boostable, now: number, rule: BoostRule): boolean {
  return item.boostedAt !== undefined && now - item.boostedAt < rule.durationMs;
}

/** 0..1 progress of something that takes durationMs, clamped. */
export function progress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

export type DayPhase = "night" | "dawn" | "day" | "dusk";

export interface SkyState {
  /** Local hour as a fraction, 0..24. */
  hour: number;
  phase: DayPhase;
  /** 0 at deep night, 1 at midday. */
  daylight: number;
}

/** Day/night from the real local clock, so evening at home is evening in the game. */
export function skyAt(date: Date): SkyState {
  const hour = date.getHours() + date.getMinutes() / 60;
  // Sunrise ~6–8, sunset ~18–20.
  const rise = smoothstep(5.5, 8, hour);
  const set = 1 - smoothstep(18, 20.5, hour);
  const daylight = Math.min(rise, set);
  let phase: DayPhase = "day";
  if (daylight <= 0.05) phase = "night";
  else if (hour < 12 && daylight < 0.95) phase = "dawn";
  else if (hour >= 12 && daylight < 0.95) phase = "dusk";
  return { hour, phase, daylight };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
