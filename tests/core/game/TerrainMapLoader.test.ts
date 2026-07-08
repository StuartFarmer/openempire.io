import { describe, expect, test } from "vitest";
import { GameMapSize, GameMapType } from "../../../src/core/game/Game";
import type { GameMapLoader } from "../../../src/core/game/GameMapLoader";
import { expectedLayersByteLength } from "../../../src/core/game/MapLayers";
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
    // Neither manifest set layers: true, so both load unlayered.
    expect(withSidecar.gameMap.hasLayers()).toBe(false);
    expect(withoutSidecar.gameMap.hasLayers()).toBe(false);
  });

  test("loads layers when the manifest opts in at Normal size", async () => {
    const data = await loadTerrainMap(
      GameMapType.Pangea002,
      GameMapSize.Normal,
      testLoader({ layers: true }),
    );
    expect(data.gameMap.hasLayers()).toBe(true);
    expect(data.gameMap.layer("crop", data.gameMap.ref(0, 0))).toBe(7);
    // The minimap never carries layers.
    expect(data.miniGameMap.hasLayers()).toBe(false);
  });

  test("ignores layers at Compact size even when the manifest opts in", async () => {
    const data = await loadTerrainMap(
      GameMapType.MajorMenor,
      GameMapSize.Compact,
      testLoader({ layers: true }),
    );
    expect(data.gameMap.hasLayers()).toBe(false);
  });

  test("a corrupt-size layers.bin downgrades to no layers instead of failing", async () => {
    // loadTerrainMap caches by map:size — MajorMenor at Normal is otherwise
    // unused in this file, so this exercises a fresh load.
    const data = await loadTerrainMap(
      GameMapType.MajorMenor,
      GameMapSize.Normal,
      testLoader({ layers: true }, new Uint8Array(3)),
    );
    expect(data.gameMap.hasLayers()).toBe(false);
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
    map16x: { width: 1, height: 1, num_land_tiles: 1 },
    nations: [],
    ...manifestOverrides,
  };
  const defaultLayers = new Uint8Array(expectedLayersByteLength(1, 1)).fill(7);
  return {
    getMapData: () => ({
      mapBin: async () => new Uint8Array([0x80]),
      map4xBin: async () => new Uint8Array([0x80]),
      map16xBin: async () => new Uint8Array([0x80]),
      manifest: async () => manifest,
      webpPath: "/maps/test/thumbnail.webp",
      terrainColorsPath: "/maps/test/terrain-colors.png",
      layersBin: async () => layersBytes ?? defaultLayers,
    }),
  };
}
