import { describe, expect, test } from "vitest";
import { GameMapSize, GameMapType } from "../../../src/core/game/Game";
import type { GameMapLoader } from "../../../src/core/game/GameMapLoader";
import {
  loadTerrainMap,
  type MapManifest,
} from "../../../src/core/game/TerrainMapLoader";

describe("TerrainMapLoader", () => {
  test("exposes terrain color sidecar only when the manifest opts in", async () => {
    const withSidecar = await loadTerrainMap(
      GameMapType.World,
      GameMapSize.Normal,
      testLoader({ terrain_colors: true }),
    );
    const withoutSidecar = await loadTerrainMap(
      GameMapType.Pangea001,
      GameMapSize.Normal,
      testLoader({}),
    );

    expect(withSidecar.terrainColorsPath).toBe("/maps/test/terrain-colors.png");
    expect(withoutSidecar.terrainColorsPath).toBeUndefined();
  });
});

function testLoader(manifestOverrides: Partial<MapManifest>): GameMapLoader {
  const manifest: MapManifest = {
    name: "Test",
    map: { width: 1, height: 1, num_land_tiles: 1 },
    map4x: { width: 1, height: 1, num_land_tiles: 1 },
    map16x: { width: 1, height: 1, num_land_tiles: 1 },
    nations: [],
    ...manifestOverrides,
  };
  return {
    getMapData: () => ({
      mapBin: async () => new Uint8Array([0x80]),
      map4xBin: async () => new Uint8Array([0x80]),
      map16xBin: async () => new Uint8Array([0x80]),
      manifest: async () => manifest,
      webpPath: "/maps/test/thumbnail.webp",
      terrainColorsPath: "/maps/test/terrain-colors.png",
    }),
  };
}
