import { describe, expect, test } from "vitest";
import { GameMapImpl } from "../../../src/core/game/GameMap";
import { LAYER_NAMES } from "../../../src/core/game/MapLayers";
import { createAlternativeWorldEngineMap } from "../../../src/games/alternative/world";
import {
  buildFreshwaterPlane,
  buildGeneratedMapInfo,
  buildGeneratorLayersBlob,
  buildGeneratorSourceImage,
  buildGeneratorTerrainColorImage,
  normalizeGeneratedMapIdentity,
} from "../../../src/games/alternative/world/GeneratorMapExport";

describe("generator map export", () => {
  test("builds map-generator compatible info metadata", () => {
    expect(normalizeGeneratedMapIdentity("my test map")).toEqual({
      id: "MyTestMap",
      folderName: "mytestmap",
    });

    expect(
      buildGeneratedMapInfo({ id: "my test map", name: "My Test Map" }),
    ).toEqual({
      id: "MyTestMap",
      name: "My Test Map",
      translation_key: "map.mytestmap",
      categories: ["new", "fictional"],
      multiplayer_frequency: 0,
      nations: [],
    });
  });

  test("builds source image pixels from terrain bytes", () => {
    const source = buildGeneratorSourceImage({
      width: 2,
      height: 1,
      terrain: new Uint8Array([0x80 | 5, 0]),
    });

    expect(source.width).toBe(2);
    expect(source.height).toBe(1);
    expect(Array.from(source.data)).toEqual([150, 150, 150, 255, 0, 0, 106, 0]);
  });

  test("builds terrain color sidecar from generated map colorizer", () => {
    const source = buildGeneratorTerrainColorImage({
      width: 2,
      height: 1,
      terrain: new Uint8Array([0x80, 0]),
      state: new Uint16Array(2),
      colorizer: () => new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]),
    });

    expect(source.width).toBe(2);
    expect(source.height).toBe(1);
    expect(Array.from(source.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  test("layers round-trip: engine → layers.bin → sim accessor, byte-for-byte", () => {
    const generated = createAlternativeWorldEngineMap({
      seed: 1337,
      width: 32,
      height: 32,
    });
    const { map, worldEngineLayers } = generated;

    const blob = buildGeneratorLayersBlob(
      worldEngineLayers,
      map.width,
      map.height,
    );
    const gameMap = new GameMapImpl(
      map.width,
      map.height,
      new Uint8Array(map.terrain),
      0,
      blob,
    );

    const enginePlane = {
      crop: worldEngineLayers.resources.crop,
      metal: worldEngineLayers.resources.metal,
      oil: worldEngineLayers.resources.oil,
      temperature: worldEngineLayers.temperature,
      humidity: worldEngineLayers.humidity,
      water: buildFreshwaterPlane(worldEngineLayers, map.width, map.height),
    };
    for (const name of LAYER_NAMES) {
      for (let i = 0; i < map.width * map.height; i++) {
        const v = enginePlane[name][i];
        const clamped = v <= 0 ? 0 : v >= 1 ? 1 : v;
        expect(gameMap.layer(name, i)).toBe(Math.round(clamped * 255));
      }
    }
    // Sanity: a generated world is not degenerate — fertility varies.
    const crops = new Set<number>();
    for (let i = 0; i < map.width * map.height; i++) {
      crops.add(gameMap.layer("crop", i));
    }
    expect(crops.size).toBeGreaterThan(1);
  });
});
