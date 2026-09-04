import { describe, expect, test } from "vitest";
import { GameMapImpl } from "../../../src/core/game/GameMap";
import { LAYER_NAMES } from "../../../src/core/game/MapLayers";
import { createAlternativeWorldEngineMap } from "../../../src/games/alternative/world";
import {
  buildFreshwaterPlane,
  buildGeneratedMapInfo,
  buildGeneratorHydroBlob,
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

  test("encodes lake then river hydro planes with generator values", () => {
    const blob = buildGeneratorHydroBlob(
      {
        lakes: new Uint8Array([0, 1, 2, 0]),
        normalizedWatermap: new Float32Array([-1, 0.5, 1, 2]),
      },
      2,
      2,
    );

    expect(blob.length).toBe(8);
    expect(Array.from(blob)).toEqual([0, 255, 255, 0, 0, 128, 255, 255]);
  });

  test("downloads hydro.bin from the current generated hydro planes", async () => {
    const litWarning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { GeneratorPage } = await import("../../../src/client/GeneratorPage");
    litWarning.mockRestore();
    const page = new GeneratorPage();
    document.body.append(page);
    await page.updateComplete;

    const button = Array.from(page.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "hydro.bin",
    );
    expect(button, "generator export controls omit hydro.bin").toBeDefined();

    const downloads: Blob[] = [];
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        if (!(blob instanceof Blob)) throw new Error("expected Blob download");
        downloads.push(blob);
        return "blob:test";
      });
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    let downloadName: string | undefined;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadName = this.download;
      });

    try {
      button?.click();
      expect(downloads).toHaveLength(1);
      expect(downloadName).toBe("hydro.bin");

      const bytes = await readBlob(downloads[0]);
      const generated = (
        page as unknown as {
          generated: ReturnType<typeof createAlternativeWorldEngineMap>;
        }
      ).generated;
      const expected = buildGeneratorHydroBlob(
        generated.worldEngineLayers,
        generated.map.width,
        generated.map.height,
      );
      expect(bytes).toEqual(expected);
    } finally {
      click.mockRestore();
      revokeObjectUrl.mockRestore();
      createObjectUrl.mockRestore();
      page.remove();
    }
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

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(new Uint8Array(reader.result as ArrayBuffer));
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsArrayBuffer(blob);
  });
}
