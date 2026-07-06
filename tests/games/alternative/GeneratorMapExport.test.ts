import { describe, expect, test } from "vitest";
import {
  buildGeneratedMapInfo,
  buildGeneratorSourceImage,
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
});
