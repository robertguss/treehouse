// Inventories are plain records of item id → count, so they serialize and patch cleanly.

export type Inventory = Record<string, number>;

export function countOf(inventory: Inventory, item: string): number {
  return inventory[item] ?? 0;
}

export function addItem(inventory: Inventory, item: string, count = 1): void {
  if (count <= 0) return;
  inventory[item] = countOf(inventory, item) + count;
}

/** Removes items if there are enough; returns whether it did. */
export function removeItem(inventory: Inventory, item: string, count = 1): boolean {
  const have = countOf(inventory, item);
  if (count <= 0 || have < count) return false;
  if (have === count) delete inventory[item];
  else inventory[item] = have - count;
  return true;
}

export function totalItems(inventory: Inventory): number {
  return Object.values(inventory).reduce((sum, count) => sum + count, 0);
}
