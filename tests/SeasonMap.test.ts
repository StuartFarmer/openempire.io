import {
  decodeSeason,
  expectedSeasonByteLength,
  SEASON_PLANE_NAMES,
  seasonPlaneOffset,
} from "../src/core/game/SeasonMap";

describe("SeasonMap", () => {
  test("planes are laid out in SEASON_PLANE_NAMES order", () => {
    expect(SEASON_PLANE_NAMES).toEqual(["amplitude", "phase"]);
    expect(seasonPlaneOffset("amplitude", 4, 4)).toBe(0);
    expect(seasonPlaneOffset("phase", 4, 4)).toBe(16);
  });

  test("expected size is two planes", () => {
    expect(expectedSeasonByteLength(10, 7)).toBe(2 * 10 * 7);
  });

  test("accepts a correctly-sized blob and rejects mismatches", () => {
    const ok = new Uint8Array(expectedSeasonByteLength(3, 2));
    expect(decodeSeason(ok, 3, 2)).toBe(ok);
    expect(() => decodeSeason(new Uint8Array(10), 3, 2)).toThrow(
      /size mismatch: got 10 bytes, expected 12/,
    );
  });
});
