import { describe, expect, test } from "vitest";
import { GameMapType } from "../../../src/core/game/Game";
import type { GameMapLoader } from "../../../src/core/game/GameMapLoader";
import { expectedLayersByteLength } from "../../../src/core/game/MapLayers";
import {
  loadTerrainMap,
  type MapManifest,
} from "../../../src/core/game/TerrainMapLoader";

describe("TerrainMapLoader", () => {
  test("loads both sidecars: decoded layers and the terrain color path", async () => {
    const data = await loadTerrainMap(
      GameMapType.World,
      testLoader({ layers: true, terrain_colors: true }),
    );
    expect(data.terrainColorsPath).toBe("/maps/test/terrain-colors.png");
    expect(data.gameMap.layer("crop", data.gameMap.ref(0, 0))).toBe(7);
  });

  test("the minimap is the pathfinding grid and carries no layers", async () => {
    const data = await loadTerrainMap(
      GameMapType.Pangea001,
      testLoader({ layers: true, terrain_colors: true }),
    );
    expect(data.miniGameMap.width()).toBe(1);
    expect(() =>
      data.miniGameMap.layer("crop", data.miniGameMap.ref(0, 0)),
    ).toThrow();
  });

  test("a map without the layers sidecar fails the load", async () => {
    await expect(
      loadTerrainMap(
        GameMapType.Pangea002,
        testLoader({ terrain_colors: true }),
      ),
    ).rejects.toThrow(/layers\.bin/);
  });

  test("a map without the terrain colors sidecar fails the load", async () => {
    await expect(
      loadTerrainMap(GameMapType.MajorMenor, testLoader({ layers: true })),
    ).rejects.toThrow(/terrain-colors\.png/);
  });

  test("a corrupt-size layers.bin fails the load instead of downgrading", async () => {
    await expect(
      loadTerrainMap(
        GameMapType.Verdantia,
        testLoader({ layers: true, terrain_colors: true }, new Uint8Array(3)),
      ),
    ).rejects.toThrow(/undecodable/);
  });
});

function testLoader(
  manifestOverrides: Partial<MapManifest>,
  layersBytes?: Uint8Array,
): GameMapLoader {
  const manifest: MapManifest = {
    name: "Test",
    map: { width: 1, height: 1, num_land_tiles: 1 },
    map4x: { width: 1, height: 1, num_land_tiles: 1 },
    nations: [],
    ...manifestOverrides,
  };
  const defaultLayers = new Uint8Array(expectedLayersByteLength(1, 1)).fill(7);
  return {
    getMapData: () => ({
      mapBin: async () => new Uint8Array([0x80]),
      map4xBin: async () => new Uint8Array([0x80]),
      manifest: async () => manifest,
      webpPath: "/maps/test/thumbnail.webp",
      terrainColorsPath: "/maps/test/terrain-colors.png",
      layersBin: async () => layersBytes ?? defaultLayers,
    }),
  };
}
