import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GameMapLoader } from "../src/core/game/GameMapLoader";

export function paintedMapLoader(
  root = fileURLToPath(new URL("../resources/maps/", import.meta.url)),
): GameMapLoader {
  return {
    getMapData(map) {
      const directory = join(root, map.toLowerCase());
      const bytes = async (name: string) =>
        new Uint8Array(await readFile(join(directory, name)));
      return {
        mapBin: () => bytes("map.bin"),
        map4xBin: () => bytes("map4x.bin"),
        layersBin: () => bytes("layers.bin"),
        manifest: async () =>
          JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
        terrainColorsPath: join(directory, "terrain-colors.png"),
        webpPath: join(directory, "thumbnail.webp"),
      };
    },
  };
}
