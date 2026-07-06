import type { BoardMap } from "../../../core/game/BoardMap";

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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
