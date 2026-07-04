import type { Cosmetics } from "../core/CosmeticSchemas";

let cosmeticsCache: Cosmetics | null = null;

export function getCachedCosmetics(): Cosmetics | null {
  return cosmeticsCache;
}

export function setCachedCosmetics(value: Cosmetics | null): void {
  cosmeticsCache = value;
}
