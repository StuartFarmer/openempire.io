import type { BoardMap } from "../../../core/game/BoardMap";
import { encodeLayers, type LayerName } from "../../../core/game/MapLayers";
import type { FoundationWorldEngineLayers } from "./WorldEngineElevation";

export interface GeneratedMapIdentity {
  id: string;
  folderName: string;
}

export interface GeneratedMapInfo {
  id: string;
  name: string;
  translation_key: string;
  categories: string[];
  multiplayer_frequency: number;
  nations: [];
}

export interface GeneratedMapSourceImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function normalizeGeneratedMapIdentity(
  input: string,
): GeneratedMapIdentity {
  const words = input.match(/[a-zA-Z0-9]+/g) ?? ["Generated", "World"];
  let id = words.map(capitalize).join("");
  if (!/^[A-Za-z]/.test(id)) {
    id = `Generated${id}`;
  }
  return {
    id,
    folderName: id.toLowerCase(),
  };
}

export function buildGeneratedMapInfo(input: {
  id: string;
  name: string;
}): GeneratedMapInfo {
  const identity = normalizeGeneratedMapIdentity(input.id);
  return {
    id: identity.id,
    name: input.name.trim() || identity.id,
    translation_key: `map.${identity.folderName}`,
    categories: ["new", "fictional"],
    multiplayer_frequency: 0,
    nations: [],
  };
}

export function buildGeneratorSourceImage(
  map: Pick<BoardMap, "width" | "height" | "terrain">,
): GeneratedMapSourceImage {
  const data = new Uint8ClampedArray(map.width * map.height * 4);

  for (let ref = 0; ref < map.terrain.length; ref += 1) {
    const terrain = map.terrain[ref];
    const offset = ref * 4;
    if ((terrain & 0x80) === 0) {
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 106;
      data[offset + 3] = 0;
      continue;
    }

    const magnitude = Math.min(30, terrain & 0x1f);
    const blue = 140 + magnitude * 2;
    data[offset] = blue;
    data[offset + 1] = blue;
    data[offset + 2] = blue;
    data[offset + 3] = 255;
  }

  return { width: map.width, height: map.height, data };
}

export function buildGeneratorTerrainColorImage(
  map: Pick<
    BoardMap,
    "width" | "height" | "terrain" | "state" | "layers" | "colorizer"
  >,
): GeneratedMapSourceImage {
  const colors = map.colorizer?.(map as BoardMap);
  const expected = map.width * map.height * 4;
  if (!colors) {
    throw new Error("generated map does not provide terrain colors");
  }
  if (colors.length !== expected) {
    throw new Error(
      `terrain color length ${colors.length} does not match ${map.width}x${map.height} RGBA`,
    );
  }

  return {
    width: map.width,
    height: map.height,
    data: new Uint8ClampedArray(colors),
  };
}

/**
 * Serialize the world engine's climate/resource fields into the layers.bin
 * sidecar (see core MapLayers.ts for the format). The plane set and order are
 * owned by core so the exporter and the sim cannot drift.
 */
export function buildGeneratorLayersBlob(
  layers: Pick<
    FoundationWorldEngineLayers,
    "temperature" | "humidity" | "irrigation" | "normalizedWatermap" | "lakes"
  > & {
    resources: Pick<
      FoundationWorldEngineLayers["resources"],
      "crop" | "metal" | "oil"
    >;
  },
  width: number,
  height: number,
): Uint8Array {
  const planes: Record<LayerName, ArrayLike<number>> = {
    crop: layers.resources.crop,
    metal: layers.resources.metal,
    oil: layers.resources.oil,
    temperature: layers.temperature,
    humidity: layers.humidity,
    water: buildFreshwaterPlane(layers, width, height),
  };
  return encodeLayers(planes, width, height);
}

/**
 * Freshwater proximity in 0..1 (add-urban-core-growth): irrigation carries the
 * diffused distance-to-water field, normalizedWatermap the river channels, and
 * lakes a hard bonus on standing water. encodeLayers quantizes to 0..255.
 */
export function buildFreshwaterPlane(
  layers: Pick<
    FoundationWorldEngineLayers,
    "irrigation" | "normalizedWatermap" | "lakes"
  >,
  width: number,
  height: number,
): Float32Array {
  const { irrigation, normalizedWatermap, lakes } = layers;
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const river = normalizedWatermap[i];
    const diffuse = irrigation[i];
    const lake = lakes[i] ? 1 : 0;
    const v = 0.6 * diffuse + 0.5 * river + lake;
    out[i] = v <= 0 ? 0 : v >= 1 ? 1 : v;
  }
  return out;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
