import { describe, expect, test } from "vitest";
import { buildBoardMapTerrainRGBA } from "../../../src/client/render/gl";
import { createAlternativeWorldEngineMap } from "../../../src/games/alternative/world";

describe("alternative world engine map", () => {
  test("creates deterministic terrain, colors, and named layers", () => {
    const first = createAlternativeWorldEngineMap({
      width: 32,
      height: 32,
      seed: 42,
    });
    const second = createAlternativeWorldEngineMap({
      width: 32,
      height: 32,
      seed: 42,
    });

    expect(first.map.width).toBe(32);
    expect(first.map.height).toBe(32);
    expect(Array.from(first.map.terrain)).toEqual(
      Array.from(second.map.terrain),
    );
    expect(Array.from(first.terrainColors)).toEqual(
      Array.from(second.terrainColors),
    );

    for (const layer of Object.values(first.map.layers ?? {})) {
      expect(layer).toHaveLength(32 * 32);
    }
  });

  test("renders exact generated world-engine colors through BoardMap", () => {
    const generated = createAlternativeWorldEngineMap({
      width: 32,
      height: 32,
      seed: 7,
    });

    expect(Array.from(buildBoardMapTerrainRGBA(generated.map))).toEqual(
      Array.from(generated.terrainColors),
    );
  });
});
