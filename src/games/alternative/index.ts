import type { BoardMap } from "../../core/game/BoardMap";

const LAND = 0x80;
const WATER = 0x00;
const OWNER_MASK = 0x0fff;

export interface AlternativeMapOptions {
  width?: number;
  height?: number;
  seed?: number;
}

export function createAlternativeMap(
  options: AlternativeMapOptions = {},
): BoardMap {
  const width = options.width ?? 32;
  const height = options.height ?? 32;
  const seed = options.seed ?? 1;
  const tileCount = width * height;
  const terrain = new Uint8Array(tileCount);
  const state = new Uint16Array(tileCount);
  const elevation = new Uint8Array(tileCount);
  const moisture = new Uint8Array(tileCount);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ref = y * width + x;
      const nx = width <= 1 ? 0 : x / (width - 1);
      const ny = height <= 1 ? 0 : y / (height - 1);
      const edge = Math.min(nx, 1 - nx, ny, 1 - ny);
      const variation = hashByte(seed, x, y);
      const hill =
        120 +
        Math.round(70 * Math.sin((nx * 1.8 + ny * 0.35) * Math.PI * 2)) +
        Math.round(40 * Math.cos((ny * 2.4 - nx * 0.25) * Math.PI * 2)) +
        Math.round((variation - 128) * 0.35);

      elevation[ref] = clampByte(hill - Math.round((0.12 - edge) * 460));
      moisture[ref] = hashByte(seed + 97, x, y);
      terrain[ref] = elevation[ref] < 92 ? WATER : LAND;
    }
  }

  const spawn = nearestLandToCenter(width, height, terrain);
  if (spawn >= 0) state[spawn] = 1;

  return {
    width,
    height,
    terrain,
    state,
    layers: { elevation, moisture },
    colorizer: alternativeTerrainColorizer,
  };
}

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

function nearestLandToCenter(
  width: number,
  height: number,
  terrain: Uint8Array,
): number {
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ref = y * width + x;
      if ((terrain[ref] & LAND) === 0) continue;
      const dist = Math.abs(x - centerX) + Math.abs(y - centerY);
      if (dist < bestDist) {
        best = ref;
        bestDist = dist;
      }
    }
  }
  return best;
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

function hashByte(seed: number, x: number, y: number): number {
  let value = seed | 0;
  value ^= Math.imul(x + 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);
  value ^= value >>> 15;
  return value & 0xff;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value | 0));
}
