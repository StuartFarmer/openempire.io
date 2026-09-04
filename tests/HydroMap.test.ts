import {
  decodeHydro,
  encodeHydro,
  expectedHydroByteLength,
  HYDRO_PLANE_NAMES,
  hydroPlaneOffset,
} from "../src/core/game/HydroMap";

describe("HydroMap", () => {
  test("round-trips lake + river planes within quantization error", () => {
    const width = 5;
    const height = 4;
    const n = width * height;
    const lake = Float32Array.from({ length: n }, (_, i) =>
      i % 3 === 0 ? 1 : 0,
    );
    const river = Float32Array.from({ length: n }, (_, i) =>
      Math.abs(Math.sin(i)),
    );
    const bytes = encodeHydro({ lake, river }, width, height);
    expect(bytes.length).toBe(expectedHydroByteLength(width, height));
    const decoded = decodeHydro(bytes, width, height);
    const riverOffset = hydroPlaneOffset("river", width, height);
    for (let i = 0; i < n; i++) {
      expect(Math.abs(decoded[i] / 255 - lake[i])).toBeLessThanOrEqual(1 / 255);
      expect(
        Math.abs(decoded[riverOffset + i] / 255 - river[i]),
      ).toBeLessThanOrEqual(1 / 255);
    }
  });

  test("planes are laid out in HYDRO_PLANE_NAMES order", () => {
    expect(HYDRO_PLANE_NAMES).toEqual(["lake", "river"]);
    expect(hydroPlaneOffset("lake", 4, 4)).toBe(0);
    expect(hydroPlaneOffset("river", 4, 4)).toBe(16);
  });

  test("rejects size mismatches loudly", () => {
    expect(() => decodeHydro(new Uint8Array(10), 3, 2)).toThrow(
      /size mismatch: got 10 bytes, expected 12/,
    );
  });
});
