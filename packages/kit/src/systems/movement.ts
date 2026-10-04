// Character movement on the ground plane: steer, push out of round obstacles, stay inside
// the play area. Pure functions, so they're unit-tested and identical everywhere.

export interface Point {
  x: number;
  z: number;
}

export interface Collider extends Point {
  r: number;
}

export interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Direction (length ≤ 1) from a point toward a target, slowing down on arrival. */
export function steerToward(from: Point, to: Point, arriveWithin = 0.15): Point | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= arriveWithin) return null;
  const slow = Math.min(1, distance / 0.6);
  return { x: (dx / distance) * slow, z: (dz / distance) * slow };
}

export function stepMovement(
  position: Point,
  direction: Point,
  speed: number,
  dt: number,
  colliders: readonly Collider[],
  area: Area,
  radius = 0.35,
): Point {
  let x = position.x + direction.x * speed * dt;
  let z = position.z + direction.z * speed * dt;
  for (const collider of colliders) {
    const dx = x - collider.x;
    const dz = z - collider.z;
    const min = collider.r + radius;
    const distance = Math.hypot(dx, dz);
    if (distance < min) {
      if (distance < 1e-6) {
        x = collider.x + min;
      } else {
        x = collider.x + (dx / distance) * min;
        z = collider.z + (dz / distance) * min;
      }
    }
  }
  x = Math.min(area.maxX - radius, Math.max(area.minX + radius, x));
  z = Math.min(area.maxZ - radius, Math.max(area.minZ + radius, z));
  return { x, z };
}

/** Facing angle (rotation around Y) for a movement direction; 0 faces +z. */
export function headingOf(direction: Point): number {
  return Math.atan2(direction.x, direction.z);
}

/** Turns an angle toward a target angle by at most maxStep, the short way around. */
export function turnToward(current: number, target: number, maxStep: number): number {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}
