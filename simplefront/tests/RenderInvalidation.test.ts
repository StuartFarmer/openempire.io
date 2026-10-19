import { describe, expect, it } from "vitest";
import { RenderInvalidation } from "../src/client/shell/RenderInvalidation";

describe("map colour invalidation", () => {
  it("starts full and then does no work until a tile changes", () => {
    const dirty = new RenderInvalidation(1024, 1024);
    expect(dirty.take()).toEqual({ kind: "full" });
    expect(dirty.take()).toEqual({ kind: "none" });
    dirty.markTile(40 * 1024 + 40);
    expect(dirty.take()).toEqual({
      kind: "chunks",
      ids: new Uint32Array([33]),
    });
  });

  it("deduplicates chunks and includes neighbours across their edges", () => {
    const dirty = new RenderInvalidation(1024, 1024);
    dirty.take();
    dirty.markTile(32 * 1024 + 32);
    dirty.markTile(32 * 1024 + 32);
    expect(dirty.take()).toEqual({
      kind: "chunks",
      ids: new Uint32Array([0, 1, 32, 33]),
    });
  });

  it("clips map edges without wrapping into another row", () => {
    const dirty = new RenderInvalidation(1024, 1024);
    dirty.take();
    dirty.markTile(0);
    expect(dirty.take()).toEqual({ kind: "chunks", ids: new Uint32Array([0]) });
    dirty.markTile(-1);
    dirty.markTile(1024 * 1024);
    dirty.markTile(NaN);
    expect(dirty.take()).toEqual({ kind: "none" });
  });

  it("preserves updates arriving after a snapshot", () => {
    const dirty = new RenderInvalidation(1024, 1024);
    dirty.take();
    dirty.markTile(40 * 1024 + 40);
    const first = dirty.take();
    dirty.markTile(400 * 1024 + 400);
    expect(first).toEqual({ kind: "chunks", ids: new Uint32Array([33]) });
    expect(dirty.take()).toEqual({
      kind: "chunks",
      ids: new Uint32Array([396]),
    });
  });

  it("falls back to the full pass for broad changes", () => {
    const dirty = new RenderInvalidation(128, 128);
    dirty.take();
    dirty.markTile(32 * 128 + 32);
    expect(dirty.take()).toEqual({ kind: "full" });
    dirty.markTile(0);
    dirty.markAll();
    expect(dirty.take()).toEqual({ kind: "full" });
    expect(dirty.take()).toEqual({ kind: "none" });
  });

  it("rounds up chunk columns for non-aligned maps", () => {
    const dirty = new RenderInvalidation(1025, 1025);
    dirty.take();
    dirty.markTile(1025 * 1025 - 1);
    expect(dirty.take()).toEqual({
      kind: "chunks",
      ids: new Uint32Array([1054, 1055, 1087, 1088]),
    });
  });

  it("uses the full pass when the region uniform would overflow", () => {
    const dirty = new RenderInvalidation(4096, 4096);
    dirty.take();
    for (let id = 0; id < 2049; id++) {
      dirty.markTile(
        (Math.floor(id / 128) * 32 + 8) * 4096 + (id % 128) * 32 + 8,
      );
    }
    expect(dirty.take()).toEqual({ kind: "full" });
  });
});
