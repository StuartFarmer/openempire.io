import { describe, expect, test } from "vitest";
import { buildBoardMapTerrainRGBA } from "../../../src/client/render/gl";
import {
  createAlternativeMap,
  expandAlternativeTerritory,
} from "../../../src/games/alternative";

describe("alternative game sandbox", () => {
  test("creates a deterministic board map with byte layers", () => {
    const first = createAlternativeMap({ width: 12, height: 8, seed: 7 });
    const second = createAlternativeMap({ width: 12, height: 8, seed: 7 });

    expect(first.width).toBe(12);
    expect(first.height).toBe(8);
    expect(first.terrain).toHaveLength(96);
    expect(first.state).toHaveLength(96);
    expect(first.layers?.elevation).toHaveLength(96);
    expect(first.layers?.moisture).toHaveLength(96);
    expect(Array.from(first.terrain)).toEqual(Array.from(second.terrain));
    expect(Array.from(first.layers!.elevation)).toEqual(
      Array.from(second.layers!.elevation),
    );
  });

  test("colorizer returns one RGBA pixel per tile", () => {
    const map = createAlternativeMap({ width: 4, height: 4, seed: 1 });

    expect(buildBoardMapTerrainRGBA(map)).toHaveLength(4 * 4 * 4);
  });

  test("expands into neighboring land and leaves water unowned", () => {
    const map = createAlternativeMap({ width: 5, height: 3, seed: 3 });
    map.terrain.fill(0x80);
    map.terrain[2] = 0x00;
    map.state.fill(0);
    map.state[6] = 1;

    const changed = expandAlternativeTerritory(map, 1);

    expect(changed.length).toBeGreaterThan(0);
    expect(map.state[2]).toBe(0);
    expect(changed.every((ref) => map.terrain[ref] & 0x80)).toBe(true);
  });
});
