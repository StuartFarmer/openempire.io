import { describe, expect, test, vi } from "vitest";
import { CameraRenderer } from "../src/client/shell/CameraRenderer";

type TextureWrite = [
  { origin?: unknown },
  Uint8Array,
  Record<string, unknown>,
  unknown,
];

function rendererFixture() {
  const writes: TextureWrite[] = [];
  const writeTexture = vi.fn((...args: TextureWrite) => writes.push(args));
  const renderer = Object.create(CameraRenderer.prototype) as CameraRenderer;
  Object.assign(renderer, {
    device: { queue: { writeTexture } },
    plotTexture: { label: "plot" },
    plotStaging: null,
  });
  return { renderer, writes };
}

describe("CameraRenderer plot uploads", () => {
  test("merges sorted duplicate tiles into row-bounded uploads", () => {
    const { renderer, writes } = rendererFixture();
    const bytes = Uint8Array.from({ length: 128 }, (_, tile) => tile);

    renderer.writePlotTiles(bytes, 64, 2, [65, 3, 2, 3]);

    expect(writes).toHaveLength(2);
    expect(writes[0][0].origin).toEqual([2, 0]);
    expect(Array.from(writes[0][1] as Uint8Array)).toEqual([2, 3]);
    expect(writes[0][2]).toEqual({});
    expect(writes[0][3]).toEqual([2, 1]);
    expect(writes[1][0].origin).toEqual([1, 1]);
    expect(Array.from(writes[1][1] as Uint8Array)).toEqual([65]);
    expect(writes[1][2]).toEqual({});
    expect(writes[1][3]).toEqual([1, 1]);
  });

  test("does not merge adjacent tile IDs across rows", () => {
    const { renderer, writes } = rendererFixture();

    renderer.writePlotTiles(new Uint8Array(128), 64, 2, [63, 64]);

    expect(writes.map((write) => write[0].origin)).toEqual([
      [63, 0],
      [0, 1],
    ]);
    expect(writes.map((write) => write[3])).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  test("uses the full upload when changed tiles exceed one sixteenth of the plane", () => {
    const { renderer, writes } = rendererFixture();
    const bytes = new Uint8Array(256 * 4);

    renderer.writePlotTiles(
      bytes,
      256,
      4,
      Array.from({ length: 65 }, (_, i) => i),
    );

    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toBe(bytes);
    expect(writes[0][2]).toEqual({ bytesPerRow: 256, rowsPerImage: 4 });
    expect(writes[0][3]).toEqual({ width: 256, height: 4 });
  });

  test("recreates full-upload staging when dimensions grow", () => {
    const { renderer, writes } = rendererFixture();

    renderer.writePlotPlane(new Uint8Array(2), 1, 2);
    renderer.writePlotPlane(new Uint8Array(4), 1, 4);

    expect((writes[1][1] as Uint8Array).byteLength).toBe(1024);
  });

  test("ignores invalid dimensions, buffers, and tile IDs", () => {
    const { renderer, writes } = rendererFixture();

    renderer.writePlotTiles(new Uint8Array(4), 0, 2, [0]);
    renderer.writePlotTiles(new Uint8Array(3), 2, 2, [0]);
    renderer.writePlotTiles(new Uint8Array(4), 2, 2, [-1, 4, 1.5]);

    expect(writes).toHaveLength(0);
  });
});
