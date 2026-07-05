import type { BoardMap } from "../../core/game/BoardMap";
import {
  createAlternativeWorldEngineMap,
  type AlternativeWorldEngineMap,
} from "./world";

const LAND = 0x80;
const OWNER_MASK = 0x0fff;

export interface AlternativeMapOptions {
  width?: number;
  height?: number;
  seed?: number;
}

export function createAlternativeMap(
  options: AlternativeMapOptions = {},
): BoardMap {
  return createAlternativeWorldEngineMap(options).map;
}

export {
  AlternativeOpenFrontExpansionSystem,
  createAlternativeOpenFrontRuntime,
} from "./OpenFrontExpansionSystem";
export { createAlternativeWorldEngineMap, type AlternativeWorldEngineMap };

export function expandAlternativeTerritory(
  map: BoardMap,
  ownerId: number,
  limit = 8,
): number[] {
  const changed: number[] = [];
  for (let ref = 0; ref < map.state.length && changed.length < limit; ref++) {
    if ((map.state[ref] & OWNER_MASK) !== ownerId) continue;
    for (const next of neighbors4(map, ref)) {
      if (changed.length >= limit) break;
      if ((map.terrain[next] & LAND) === 0) continue;
      if ((map.state[next] & OWNER_MASK) !== 0) continue;
      map.state[next] = ownerId;
      changed.push(next);
    }
  }
  return changed;
}

export function alternativeTerrainColorizer(map: BoardMap): Uint8Array {
  const elevation = map.layers?.elevation;
  const moisture = map.layers?.moisture;
  const pixels = new Uint8Array(map.width * map.height * 4);

  for (let ref = 0; ref < map.terrain.length; ref++) {
    const e = elevation?.[ref] ?? 0;
    const m = moisture?.[ref] ?? 0;
    const offset = ref * 4;

    if ((map.terrain[ref] & LAND) === 0) {
      pixels[offset] = 24;
      pixels[offset + 1] = 72 + Math.round(e * 0.18);
      pixels[offset + 2] = 122 + Math.round(e * 0.28);
    } else {
      pixels[offset] = 72 + Math.round(e * 0.34);
      pixels[offset + 1] = 100 + Math.round(m * 0.42);
      pixels[offset + 2] = 58 + Math.round(e * 0.22);
    }
    pixels[offset + 3] = 255;
  }

  return pixels;
}

function neighbors4(
  map: Pick<BoardMap, "width" | "height">,
  ref: number,
): number[] {
  const x = ref % map.width;
  const y = Math.floor(ref / map.width);
  const out: number[] = [];
  if (x > 0) out.push(ref - 1);
  if (x < map.width - 1) out.push(ref + 1);
  if (y > 0) out.push(ref - map.width);
  if (y < map.height - 1) out.push(ref + map.width);
  return out;
}
