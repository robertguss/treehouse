// A square tile grid on the ground plane (x, z). Tiles are addressed by integer
// coordinates and stored in records keyed by "x,z".

export type TileKey = `${number},${number}`;

export interface TileCoord {
  x: number;
  z: number;
}

export function tileKey(x: number, z: number): TileKey {
  return `${x},${z}`;
}

export function parseTileKey(key: string): TileCoord | undefined {
  const match = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!match) return undefined;
  return { x: Number(match[1]), z: Number(match[2]) };
}

/** The tile containing a world position, for tiles of the given size. */
export function tileAt(worldX: number, worldZ: number, size = 1): TileCoord {
  return { x: Math.floor(worldX / size), z: Math.floor(worldZ / size) };
}

/** World position of a tile's center. */
export function tileCenter(tile: TileCoord, size = 1): { x: number; z: number } {
  return { x: (tile.x + 0.5) * size, z: (tile.z + 0.5) * size };
}

export function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function inBounds(tile: TileCoord, bounds: Bounds): boolean {
  return (
    tile.x >= bounds.minX && tile.x <= bounds.maxX && tile.z >= bounds.minZ && tile.z <= bounds.maxZ
  );
}
