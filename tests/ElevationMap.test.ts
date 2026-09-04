import {
  decodeElevation,
  encodeElevation,
  expectedElevationByteLength,
} from "../src/core/game/ElevationMap";

describe("ElevationMap", () => {
  test("round-trips normalized elevation within quantization error", () => {
    const width = 7;
    const height = 5;
    const values = Float32Array.from({ length: width * height }, (_, i) =>
      Math.abs(Math.sin(i * 0.7)),
    );
    const decoded = decodeElevation(
      encodeElevation(values, width, height),
      width,
      height,
    );
    expect(decoded.length).toBe(width * height);
    for (let i = 0; i < values.length; i++) {
      expect(Math.abs(decoded[i] - values[i])).toBeLessThanOrEqual(1 / 65535);
    }
  });

  test("clamps out-of-range values and is little-endian", () => {
    const bytes = encodeElevation([-0.5, 2, 0.5], 3, 1);
    expect(bytes.length).toBe(expectedElevationByteLength(3, 1));
    expect([bytes[0], bytes[1]]).toEqual([0, 0]); // clamped to 0
    expect([bytes[2], bytes[3]]).toEqual([0xff, 0xff]); // clamped to 1
    // 0.5 → 32768 = 0x8000, little-endian: low byte first.
    expect([bytes[4], bytes[5]]).toEqual([0x00, 0x80]);
  });

  test("rejects size mismatches loudly", () => {
    expect(() => decodeElevation(new Uint8Array(10), 3, 2)).toThrow(
      /size mismatch: got 10 bytes, expected 12/,
    );
    expect(() => encodeElevation([0, 1], 3, 1)).toThrow(/2 values, expected 3/);
  });

  test("decodes from an offset view correctly", () => {
    const backing = new Uint8Array(4 + expectedElevationByteLength(2, 1));
    const bytes = encodeElevation([0.25, 0.75], 2, 1);
    backing.set(bytes, 4);
    const view = new Uint8Array(backing.buffer, 4, bytes.length);
    const decoded = decodeElevation(view, 2, 1);
    expect(decoded[0]).toBeCloseTo(0.25, 4);
    expect(decoded[1]).toBeCloseTo(0.75, 4);
  });
});
