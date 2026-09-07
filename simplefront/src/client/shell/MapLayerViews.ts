import type { MapData } from "../../core/game/GameMapLoader";
import { layerPlaneOffset, type LayerName } from "../../core/game/MapLayers";

// Layer views for the shell camera: each view colorizes a baked map dataset
// into a full-resolution RGBA bitmap that rides the same textured-camera path
// as the original terrain colors. "terrain" is the baked terrain-colors.png;
// "elevation" derives from map.bin's magnitude bits (altitude on land, depth
// in water); the rest are the layers.bin planes through per-layer ramps with
// the ocean masked dark for legibility.

export const SHELL_VIEWS = [
  "terrain",
  "elevation",
  "crop",
  "metal",
  "oil",
  "temperature",
  "humidity",
  "water",
] as const;

export type ShellView = (typeof SHELL_VIEWS)[number];

const TERRAIN_LAND_BIT = 0x80;
const TERRAIN_MAGNITUDE_MASK = 0x1f;

type Stop = readonly [number, number, number, number]; // position, r, g, b

const OCEAN_MASK: readonly [number, number, number] = [10, 22, 34];

const LAND_ELEVATION_STOPS: readonly Stop[] = [
  [0, 74, 122, 67],
  [0.45, 138, 138, 88],
  [0.75, 138, 112, 88],
  [1, 232, 235, 226],
];
const WATER_DEPTH_STOPS: readonly Stop[] = [
  [0, 77, 151, 171],
  [1, 7, 38, 83],
];

const PLANE_STOPS: Record<
  Exclude<ShellView, "terrain" | "elevation">,
  readonly Stop[]
> = {
  crop: [
    [0, 20, 16, 11],
    [1, 126, 200, 80],
  ],
  metal: [
    [0, 16, 16, 20],
    [1, 207, 214, 221],
  ],
  oil: [
    [0, 20, 16, 11],
    [1, 165, 95, 214],
  ],
  temperature: [
    [0, 40, 80, 160],
    [0.5, 232, 220, 120],
    [1, 200, 60, 50],
  ],
  humidity: [
    [0, 176, 146, 88],
    [1, 30, 140, 80],
  ],
  water: [
    [0, 20, 26, 32],
    [1, 82, 208, 255],
  ],
};

function ramp(stops: readonly Stop[], value: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, value));
  for (let s = 0; s < stops.length - 1; s += 1) {
    const left = stops[s];
    const right = stops[s + 1];
    if (v <= right[0]) {
      const t = (v - left[0]) / Math.max(0.0001, right[0] - left[0]);
      return [
        left[1] + (right[1] - left[1]) * t,
        left[2] + (right[2] - left[2]) * t,
        left[3] + (right[3] - left[3]) * t,
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

export async function buildViewBitmap(
  view: ShellView,
  mapData: MapData,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  if (view === "terrain") {
    if (!mapData.terrainColorsPath) {
      throw new Error("map has no terrain-colors.png");
    }
    const response = await fetch(mapData.terrainColorsPath);
    if (!response.ok) {
      throw new Error(`Failed to load terrain colors: ${response.status}`);
    }
    return createImageBitmap(await response.blob());
  }

  const terrain = await mapData.mapBin();
  const area = width * height;
  const pixels = new Uint8ClampedArray(area * 4);

  if (view === "elevation") {
    for (let i = 0; i < area; i += 1) {
      const byte = terrain[i];
      const magnitude = (byte & TERRAIN_MAGNITUDE_MASK) / 31;
      const [r, g, b] =
        (byte & TERRAIN_LAND_BIT) !== 0
          ? ramp(LAND_ELEVATION_STOPS, magnitude)
          : ramp(WATER_DEPTH_STOPS, magnitude);
      const o = i * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
    }
  } else {
    if (!mapData.layersBin) {
      throw new Error("map has no layers.bin");
    }
    const layers = await mapData.layersBin();
    const offset = layerPlaneOffset(view as LayerName, width, height);
    const stops = PLANE_STOPS[view];
    for (let i = 0; i < area; i += 1) {
      const land = (terrain[i] & TERRAIN_LAND_BIT) !== 0;
      const [r, g, b] = land
        ? ramp(stops, layers[offset + i] / 255)
        : OCEAN_MASK;
      const o = i * 4;
      pixels[o] = r;
      pixels[o + 1] = g;
      pixels[o + 2] = b;
      pixels[o + 3] = 255;
    }
  }

  return createImageBitmap(new ImageData(pixels, width, height));
}
