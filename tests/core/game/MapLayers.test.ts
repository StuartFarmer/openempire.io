import { describe, expect, test } from "vitest";
import {
  decodeLayers,
  encodeLayers,
  expectedLayersByteLength,
  LAYER_NAMES,
  layerPlaneOffset,
  type LayerName,
} from "../../../src/core/game/MapLayers";

const W = 4;
const H = 3;
const PLANE = W * H;

function planes(fill: (name: LayerName, i: number) => number) {
  return Object.fromEntries(
    LAYER_NAMES.map((name) => [
      name,
      Array.from({ length: PLANE }, (_, i) => fill(name, i)),
    ]),
  ) as Record<LayerName, number[]>;
}

describe("MapLayers", () => {
  test("encode → decode round-trips quantized bytes per plane", () => {
    const source = planes(
      (name, i) => (LAYER_NAMES.indexOf(name) * PLANE + i) / 255,
    );
    const bytes = decodeLayers(encodeLayers(source, W, H), W, H);

    expect(bytes.length).toBe(expectedLayersByteLength(W, H));
    for (const name of LAYER_NAMES) {
      const offset = layerPlaneOffset(name, W, H);
      for (let i = 0; i < PLANE; i++) {
        expect(bytes[offset + i]).toBe(
          Math.round(source[name][i] * 255),
        );
      }
    }
  });

  test("quantization clamps out-of-range values", () => {
    const source = planes(() => 0.5);
    source.crop[0] = -3;
    source.crop[1] = 7;
    const bytes = encodeLayers(source, W, H);
    const offset = layerPlaneOffset("crop", W, H);
    expect(bytes[offset]).toBe(0);
    expect(bytes[offset + 1]).toBe(255);
  });

  test("plane offsets address consecutive row-major planes in order", () => {
    LAYER_NAMES.forEach((name, index) => {
      expect(layerPlaneOffset(name, W, H)).toBe(index * PLANE);
    });
  });

  test("decode rejects a size mismatch", () => {
    expect(() => decodeLayers(new Uint8Array(PLANE * 2), W, H)).toThrow(
      /size mismatch/,
    );
  });

  test("encode rejects a plane of the wrong length", () => {
    const source = planes(() => 0.5);
    source.oil = source.oil.slice(1);
    expect(() => encodeLayers(source, W, H)).toThrow(/expected/);
  });
});
