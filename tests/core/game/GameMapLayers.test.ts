import { describe, expect, test } from "vitest";
import { GameMapImpl } from "../../../src/core/game/GameMap";
import {
  encodeLayers,
  LAYER_NAMES,
  type LayerName,
} from "../../../src/core/game/MapLayers";

const W = 4;
const H = 3;

function makeMap(layers: Uint8Array | null) {
  // All-land terrain (bit 7 set), magnitude 0.
  const terrain = new Uint8Array(W * H).fill(0b1000_0000);
  return new GameMapImpl(W, H, terrain, W * H, layers);
}

describe("GameMapImpl layers", () => {
  test("layer() returns the exact baked byte per plane and tile", () => {
    const planes = Object.fromEntries(
      LAYER_NAMES.map((name, p) => [
        name,
        Array.from({ length: W * H }, (_, i) => ((p * 50 + i) % 256) / 255),
      ]),
    ) as Record<LayerName, number[]>;
    const map = makeMap(encodeLayers(planes, W, H));

    LAYER_NAMES.forEach((name, p) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ref = map.ref(x, y);
          expect(map.layer(name, ref)).toBe((p * 50 + (y * W + x)) % 256);
        }
      }
    });
  });

  test("a layerless map (the pathfinding minimap) throws on layer()", () => {
    const map = makeMap(null);
    expect(() => map.layer("crop", map.ref(0, 0))).toThrow(/minimap/);
  });

  test("constructor rejects a mis-sized layers blob", () => {
    expect(() => makeMap(new Uint8Array(3))).toThrow(/size mismatch/);
  });
});
