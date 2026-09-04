import { describe, expect, it } from "vitest";
import {
  formatSeamDiff,
  mergeSeamDiffs,
  seamDiff,
} from "../src/client/economy/SeamDiff";

describe("seamDiff", () => {
  it("agrees when both sides serve the same thing", () => {
    const r = seamDiff(
      [
        [1, 10],
        [2, 20],
      ],
      [
        [1, 10],
        [2, 20],
      ],
    );
    expect(r.ok).toBe(true);
    expect(r.compared).toBe(2);
    expect(r.onlyCpu).toBe(0);
    expect(r.onlyGpu).toBe(0);
    expect(r.valueDiff).toBe(0);
  });

  // The whole point of the primitive: a probe once passed every check on a
  // board where nothing was above the claim threshold, because every check
  // compared nothing.
  it("FAILS a comparison that compared nothing", () => {
    const r = seamDiff<number, number>([], []);
    expect(r.empty).toBe(true);
    expect(r.ok).toBe(false);
    expect(formatSeamDiff(r)).toContain("compared NOTHING");
  });

  it("fails when the two sides share no keys, however large each is", () => {
    const r = seamDiff(
      [
        [1, 1],
        [2, 2],
      ],
      [
        [3, 3],
        [4, 4],
      ],
    );
    expect(r.compared).toBe(0);
    expect(r.onlyCpu).toBe(2);
    expect(r.onlyGpu).toBe(2);
    expect(r.ok).toBe(false);
  });

  it("counts membership disagreement in both directions", () => {
    const r = seamDiff(
      [
        [1, 1],
        [2, 2],
      ],
      [
        [2, 2],
        [3, 3],
      ],
    );
    expect(r.compared).toBe(1);
    expect(r.onlyCpu).toBe(1); // 1 is CPU-only
    expect(r.onlyGpu).toBe(1); // 3 is GPU-only
    expect(r.ok).toBe(false);
  });

  it("reports the worst distance between disagreeing values", () => {
    const r = seamDiff(
      [
        [1, 100],
        [2, 200],
      ],
      [
        [1, 103],
        [2, 190],
      ],
    );
    expect(r.valueDiff).toBe(2);
    expect(r.worst).toBe(10);
    expect(r.samples.length).toBe(2);
  });

  it("honours a custom equality, so an f32 term can carry a stated bound", () => {
    const r = seamDiff(
      [
        [1, 100],
        [2, 200],
      ],
      [
        [1, 100.5],
        [2, 200.5],
      ],
      { equal: (a, b) => Math.abs(a - b) <= 1 },
    );
    expect(r.ok).toBe(true);
    expect(r.valueDiff).toBe(0);
  });

  it("does not silently report 0 for values that are not numbers", () => {
    const r = seamDiff([[1, "a"]], [[1, "b"]], {});
    expect(r.valueDiff).toBe(1);
    expect(Number.isNaN(r.worst)).toBe(true);
  });

  it("accepts a Map directly as well as entries", () => {
    const cpu = new Map([[7, 1]]);
    const gpu = new Map([[7, 1]]);
    expect(seamDiff(cpu, gpu).ok).toBe(true);
  });
});

// Design D4: a seam computed from a snapshot can name entries the tick has
// destroyed. That is a contract to be STATED, not a number to be excused.
describe("seamDiff staleness allowance", () => {
  const hundred = (n: number): [number, number][] =>
    Array.from({ length: n }, (_, i) => [i, i * 10]);

  it("passes membership drift inside a stated allowance", () => {
    const cpu = hundred(100);
    const gpu = hundred(100).slice(0, 99); // one entry gone stale
    const r = seamDiff(cpu, gpu, {
      membershipAllowance: 0.02,
      allowanceReason: "one tick of churn",
    });
    expect(r.membershipDrift).toBeCloseTo(0.01);
    expect(r.ok).toBe(true);
    expect(formatSeamDiff(r)).toContain("within contract");
  });

  it("fails membership drift beyond the allowance", () => {
    const cpu = hundred(100);
    const gpu = hundred(100).slice(0, 90);
    const r = seamDiff(cpu, gpu, {
      membershipAllowance: 0.02,
      allowanceReason: "one tick of churn",
    });
    expect(r.ok).toBe(false);
    expect(formatSeamDiff(r)).toContain("exceeds the stated allowance");
  });

  // Staleness changes WHICH entries exist, never what a shared one says.
  it("never lets an allowance excuse a value disagreement", () => {
    const r = seamDiff([[1, 5]], [[1, 9]], {
      membershipAllowance: 0.99,
      allowanceReason: "very stale",
    });
    expect(r.valuesOk).toBe(false);
    expect(r.ok).toBe(false);
    expect(formatSeamDiff(r)).toContain("staleness cannot explain this");
  });

  it("refuses an allowance with no stated reason", () => {
    expect(() =>
      seamDiff([[1, 1]], [[1, 1]], { membershipAllowance: 0.05 }),
    ).toThrow(/stated reason/);
  });

  it("defaults to no allowance at all", () => {
    const r = seamDiff([[1, 1]], []);
    expect(r.allowance).toBe(0);
    expect(r.ok).toBe(false);
  });

  it("merging takes the strictest allowance, never the loosest", () => {
    const strict = seamDiff([[1, 1]], [[1, 1]]);
    const loose = seamDiff([[2, 2]], [[2, 2]], {
      membershipAllowance: 0.5,
      allowanceReason: "loose",
    });
    expect(mergeSeamDiffs([loose, strict], "m").allowance).toBe(0);
  });
});

describe("mergeSeamDiffs", () => {
  it("sums counts and takes the worst", () => {
    const a = seamDiff([[1, 10]], [[1, 12]]);
    const b = seamDiff([[2, 10]], [[2, 15]]);
    const m = mergeSeamDiffs([a, b], "merged");
    expect(m.compared).toBe(2);
    expect(m.valueDiff).toBe(2);
    expect(m.worst).toBe(5);
    expect(m.ok).toBe(false);
  });

  // A player with no shed contributes an empty part and is not a failure; a run
  // in which NO player had one is.
  it("tolerates empty parts but not an entirely empty whole", () => {
    const empty = seamDiff<number, number>([], []);
    const real = seamDiff([[1, 1]], [[1, 1]]);
    expect(mergeSeamDiffs([empty, real], "mixed").ok).toBe(true);
    expect(mergeSeamDiffs([empty, empty], "all empty").ok).toBe(false);
  });

  it("merges nothing into a failure rather than a pass", () => {
    expect(mergeSeamDiffs([], "none").ok).toBe(false);
  });
});
