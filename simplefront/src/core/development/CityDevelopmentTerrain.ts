import type { GameMap, TileRef } from "../game/GameMap";
import type { DevelopmentTerrain } from "./CityDevelopment";

// One immutable terrain allocation per live GameMap; the WeakMap follows the
// map lifecycle and never owns player/city state.
const cache = new WeakMap<GameMap, DevelopmentTerrain>();

/** Immutable map-derived terrain. Dynamic ownership and structures stay out. */
export function cityDevelopmentTerrain(map: GameMap): DevelopmentTerrain {
  const cached = cache.get(map);
  if (cached) return cached;
  const size = map.width() * map.height();
  const height = new Float64Array(size);
  const water = new Uint8Array(size);
  const slope = new Float64Array(size);
  const waterDistance = new Float64Array(size);
  waterDistance.fill(Infinity);
  const queue = new Int32Array(size);
  let read = 0;
  let write = 0;
  for (let tile = 0; tile < size; tile++) {
    water[tile] = map.isWater(tile) || map.isImpassable(tile) ? 1 : 0;
    height[tile] = map.magnitude(tile) / 31;
    if (map.isWater(tile)) {
      waterDistance[tile] = 0;
      queue[write++] = tile;
    }
  }
  const neighbours = (tile: TileRef): TileRef[] => {
    const output: TileRef[] = [];
    map.forEachNeighbor(tile, (next) => output.push(next));
    return output;
  };
  while (read < write) {
    const tile = queue[read++];
    const nextDistance = waterDistance[tile] + 1;
    map.forEachNeighbor(tile, (next) => {
      if (waterDistance[next] <= nextDistance) return;
      waterDistance[next] = nextDistance;
      queue[write++] = next;
    });
  }
  for (let tile = 0; tile < size; tile++) {
    if (map.isWater(tile)) continue;
    let maximum = 0;
    map.forEachNeighbor(tile, (next) => {
      if (!map.isWater(next))
        maximum = Math.max(maximum, Math.abs(height[tile] - height[next]));
    });
    slope[tile] = maximum;
  }
  const terrain = {
    width: map.width(),
    height,
    water,
    slope,
    waterDistance,
    neighbours,
  };
  cache.set(map, terrain);
  return terrain;
}
