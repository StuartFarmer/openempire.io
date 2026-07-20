import { FoodConfig } from "../configuration/FoodConfig";
import { GameMap, TileRef } from "./GameMap";

/**
 * The baked per-tile fertility plane (simplify-food-economy, tile-fertility
 * spec) — the single terrain-quality number the whole economy reads.
 *
 *   fertility = (cropN + moistureN + tempFit) / 3
 *     moistureN = (humidityN + waterN) / 2
 *     tempFit   = max(0, 1 − |temperatureN − tempOpt| / tempWidth)
 *
 * Water and impassable tiles are 0. Defaults calibrate tempFit(0.5) = 0.5,
 * so all-mid-range inputs bake to exactly 0.5 — "average land is 0.5".
 * Baked ONCE at game construction into a u8 plane; every runtime read is a
 * plain lookup. The only thing allowed between this plane and production is
 * the fertilityBonus multiplier, applied at the point of farm output.
 */

/** Fertility of one tile in [0,1] from its layer bytes (pure, for tests). */
export function fertilityOf(
  cropN: number,
  humidityN: number,
  waterN: number,
  temperatureN: number,
  f: Pick<FoodConfig, "fertilityTempOptN" | "fertilityTempWidthN">,
): number {
  const moistureN = (humidityN + waterN) / 2;
  const tempFit = Math.max(
    0,
    1 - Math.abs(temperatureN - f.fertilityTempOptN) / f.fertilityTempWidthN,
  );
  return (cropN + moistureN + tempFit) / 3;
}

/** Bake the full-map fertility plane (u8, 0..255) from the layer planes. */
export function bakeFertility(
  map: GameMap,
  f: Pick<FoodConfig, "fertilityTempOptN" | "fertilityTempWidthN">,
): Uint8Array {
  const w = map.width();
  const h = map.height();
  const plane = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ref = map.ref(x, y) as TileRef;
      if (!map.isLand(ref) || map.isImpassable(ref)) continue; // stays 0
      const v = fertilityOf(
        map.layer("crop", ref) / 255,
        map.layer("humidity", ref) / 255,
        map.layer("water", ref) / 255,
        map.layer("temperature", ref) / 255,
        f,
      );
      plane[ref] = Math.round(Math.max(0, Math.min(1, v)) * 255);
    }
  }
  return plane;
}
