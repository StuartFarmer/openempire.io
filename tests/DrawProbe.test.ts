import { beforeEach, describe, expect, it } from "vitest";
import {
  drawMargin,
  observeDraw,
  setDrawObserver,
  type DrawObserver,
} from "../src/core/execution/utils/DrawProbe";

describe("DrawProbe", () => {
  beforeEach(() => setDrawObserver(null));

  describe("drawMargin", () => {
    it("measures the distance to the nearer edge of the winner's interval", () => {
      // Cumulative edges at 0, 10, 30, 60. A draw at 12 sits 2 past the
      // opening edge of candidate 1 and 18 short of its closing edge.
      expect(drawMargin([10, 20, 30], 12, 1)).toBeCloseTo(2 / 60, 12);
      expect(drawMargin([10, 20, 30], 28, 1)).toBeCloseTo(2 / 60, 12);
      expect(drawMargin([10, 20, 30], 20, 1)).toBeCloseTo(10 / 60, 12);
    });

    it("is relative to the total, so pools of any size compare", () => {
      // The same geometry scaled by 1000 gives the same margin.
      expect(drawMargin([10, 20, 30], 12, 1)).toBeCloseTo(
        drawMargin([10_000, 20_000, 30_000], 12_000, 1),
        12,
      );
    });

    it("reports a single-candidate pool as unperturbable", () => {
      // There is no other answer to reach, so no weight perturbation — of any
      // size — can change the outcome.
      expect(drawMargin([7], 3, 0)).toBe(1);
      expect(drawMargin([], 0, 0)).toBe(1);
    });

    it("reports a zero-weight pool as unperturbable", () => {
      expect(drawMargin([0, 0], 0, 0)).toBe(1);
    });

    it("goes to zero as the draw approaches a boundary", () => {
      // This is the whole point: a draw this close to an edge is decided by
      // the last bits of the weights, which is what f32 evaluation moves.
      const margin = drawMargin([1, 1], 1 - 1e-9, 0);
      expect(margin).toBeLessThan(1e-9);
      expect(margin).toBeGreaterThan(0);
    });
  });

  describe("the observer seam", () => {
    it("reports nothing until an observer is installed", () => {
      // The default must be inert — this runs inside the shipping tick.
      expect(() => observeDraw("urban", [1, 2], 1.5, 1)).not.toThrow();
    });

    it("passes the pool through to the observer", () => {
      const seen: Parameters<DrawObserver>[] = [];
      setDrawObserver((...args) => seen.push(args));
      observeDraw("patch", [3, 4], 5, 1);
      expect(seen).toEqual([["patch", [3, 4], 5, 1]]);
    });

    it("stops reporting once cleared", () => {
      let calls = 0;
      setDrawObserver(() => calls++);
      observeDraw("urban", [1], 0, 0);
      setDrawObserver(null);
      observeDraw("urban", [1], 0, 0);
      expect(calls).toBe(1);
    });
  });
});
