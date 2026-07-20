import { GameMap, TileRef } from "./GameMap";

/**
 * The baked per-tile CITY suitability plane (restore-organic-growth,
 * city-growth spec) — fertility's twin for urban growth:
 *
 *   suitability = clamp01((fertilityN + waterAccessN + (1 − magnitudeN)) / 3)
 *     waterAccessN = min(1, waterN + 0.5·shore)
 *
 * Fertile, watered, LOW ground makes good city land. Water/impassable
 * tiles are 0. Constants, not knobs — the plane is baked once at game
 * construction (beside FertilityMap) and every runtime read is a lookup.
 */

/** Suitability of one tile in [0,1] from its inputs (pure, for tests). */
export function suitabilityOf(
  fertilityN: number,
  waterN: number,
  shore: boolean,
  magnitudeN: number,
): number {
  const waterAccessN = Math.min(1, waterN + (shore ? 0.5 : 0));
  const v = (fertilityN + waterAccessN + (1 - magnitudeN)) / 3;
  return Math.max(0, Math.min(1, v));
}

/** Bake the full-map suitability plane (u8, 0..255). `fertility` is the
 *  already-baked fertility plane (same indexing: TileRef = y·width + x). */
export function bakeSuitability(
  map: GameMap,
  fertility: Uint8Array,
): Uint8Array {
  const w = map.width();
  const h = map.height();
  const plane = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ref = map.ref(x, y) as TileRef;
      if (!map.isLand(ref) || map.isImpassable(ref)) continue; // stays 0
      const v = suitabilityOf(
        fertility[ref] / 255,
        map.layer("water", ref) / 255,
        map.isShoreline(ref) || map.isOceanShore(ref),
        map.magnitude(ref) / 31,
      );
      plane[ref] = Math.round(v * 255);
    }
  }
  return plane;
}
