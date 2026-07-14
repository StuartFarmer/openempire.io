/**
 * The normalization layer is where the Earth map's judgement lives, and every
 * bug we hit while building it was a SILENT one — the map still looked
 * plausible, it was just wrong. These tests pin the specific mistakes:
 *
 *   - log1p on precipitation rendered the Sahara (19 mm/yr) as byte 95, i.e.
 *     "37% humid".
 *   - Boosting oil before normalizing broke the clamp, so Ghawar — the largest
 *     oil field on Earth — came out at byte 17.
 *   - Signed temperature: without it, -30 degC and 0 degC quantize identically.
 */
import { describe, expect, it } from "vitest";
import {
  buildMap,
  buildTerrainImage,
} from "../src/games/alternative/earth/BuildLayers";
import {
  buildEarthTerrainColors,
  defaultEarthColorOptions,
} from "../src/games/alternative/earth/EarthColors";
import {
  blur,
  distanceToSeed,
  Field,
  makeField,
  normalize,
  normalizeSigned,
  quantize,
} from "../src/games/alternative/earth/Normalize";
import { defaultTuning } from "../src/games/alternative/earth/Tuning";

const W = 16;
const H = 8;

function field(fn: (x: number, y: number) => number): Field {
  const f = makeField(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f.data[y * W + x] = fn(x, y);
  }
  return f;
}

/** A minimal but complete set of raw fields, so buildMap() has everything. */
function rawFields(
  over: Record<string, (x: number, y: number) => number> = {},
) {
  const names = [
    "elevation",
    "land",
    "temperature",
    "precip",
    "npp",
    "biome",
    "mining",
    "cu_density",
    "metal_pts",
    "basin_fill",
    "oil_au",
    "oil_field",
    "river",
    "lake",
  ];
  const defaults: Record<string, (x: number, y: number) => number> = {
    // Left half land, right half ocean.
    land: (x) => (x < W / 2 ? 1 : 0),
    elevation: (x) => (x < W / 2 ? x * 500 : -1000),
    temperature: () => 15,
    precip: () => 800,
    npp: () => 1e10,
    biome: () => 4,
  };
  const out: Record<string, Field> = {};
  for (const n of names) {
    const fn = over[n] ?? defaults[n] ?? (() => 0);
    out[n] = field(fn);
  }
  return out;
}

describe("quantize", () => {
  it("maps 0..1 onto the full byte range and clamps outside it", () => {
    const f = field((x) => [-1, 0, 0.5, 1, 2][Math.min(4, x)]);
    const q = quantize(f);
    expect(q[0]).toBe(0); // -1 clamps to 0
    expect(q[1]).toBe(0);
    expect(q[2]).toBe(128); // 0.5
    expect(q[3]).toBe(255);
    expect(q[4]).toBe(255); // 2 clamps to 255
  });
});

describe("normalize", () => {
  it("sqrt keeps the arid end low where log1p wrongly lifts it", () => {
    // The actual regression: the Sahara gets 19 mm/yr of rain. Under log1p with
    // a 0..3000 mm range it quantized to 95/255 — over a third "humid".
    const sahara = field(() => 19);
    const range = { kind: "absolute", min: 0, max: 3000 } as const;

    const withLog = quantize(
      normalize(sahara, { curve: "log1p", range, gamma: 1 }),
    )[0];
    const withSqrt = quantize(
      normalize(sahara, { curve: "sqrt", range, gamma: 1 }),
    )[0];

    expect(withLog).toBeGreaterThan(90); // the bug, reproduced
    expect(withSqrt).toBeLessThan(30); // the fix
  });

  it("absolute bounds are interpreted in physical units, not curved units", () => {
    // 3000 mm/yr is the stated ceiling, so it must land on 255 under ANY curve.
    for (const curve of ["linear", "sqrt", "log1p"] as const) {
      const q = quantize(
        normalize(
          field(() => 3000),
          {
            curve,
            range: { kind: "absolute", min: 0, max: 3000 },
            gamma: 1,
          },
        ),
      );
      expect(q[0]).toBe(255);
    }
  });

  it("percentile ranges ignore zeros, which dominate sparse fields", () => {
    // Mining touches ~1% of tiles. If percentiles were taken over the whole
    // array they would be 0 at every level and the range would collapse to
    // nothing. Taken over nonzero cells only, the handful of real values set
    // the scale. Here just three cells are nonzero (10, 50, 100).
    const sparse = field((x, y) => (y === 0 ? ([10, 50, 100][x] ?? 0) : 0));
    const q = quantize(
      normalize(sparse, {
        curve: "linear",
        range: { kind: "percentile", lo: 0, hi: 100 },
        gamma: 1,
      }),
    );
    expect(q[2]).toBe(255); // 100 = the top of the nonzero distribution
    expect(q[1]).toBeGreaterThan(0); // 50 lands in the middle...
    expect(q[1]).toBeLessThan(255); // ...not pinned to either end
    expect(q[3]).toBe(0); // an empty cell stays empty
  });
});

describe("normalizeSigned", () => {
  it("keeps sub-zero temperatures distinct from freezing", () => {
    // A plain normalize() collapses everything <= 0 to byte 0, which would make
    // Siberia and the tropics' winter indistinguishable.
    const f = field((x) => [-30, -15, 0, 20, 35][Math.min(4, x)]);
    const q = quantize(normalizeSigned(f, -30, 35, 1));
    expect(q[0]).toBe(0); // -30
    expect(q[2]).toBeGreaterThan(q[1]); // 0 > -15
    expect(q[1]).toBeGreaterThan(0); // -15 is NOT byte 0
    expect(q[4]).toBe(255); // 35
  });
});

describe("blur", () => {
  it("wraps across the antimeridian — the map is a cylinder", () => {
    const spike = field((x) => (x === 0 ? 100 : 0));
    const b = blur(spike, 1.5);
    // Energy must bleed to the far-right column, not fall off an edge.
    expect(b.data[W - 1]).toBeGreaterThan(0);
  });

  it("conserves mass along longitude, which wraps", () => {
    // Only x is conserved: latitude is CLAMPED (the poles are not adjacent), so
    // edge replication there legitimately adds mass. Use a field that is
    // constant in y to isolate the wrapping axis.
    const f = field((x) => x % 5);
    const before = f.data.reduce((a, b) => a + b, 0);
    const after = blur(f, 2).data.reduce((a, b) => a + b, 0);
    expect(after).toBeCloseTo(before, 1);
  });
});

describe("distanceToSeed", () => {
  it("is zero at a seed and grows away from it, wrapping in x", () => {
    const seed = field((x, y) => (x === 0 && y === 0 ? 1 : 0));
    const d = distanceToSeed(seed);
    expect(d.data[0]).toBe(0);
    expect(d.data[1]).toBeCloseTo(1, 3);
    // x = W-1 is adjacent to x = 0 across the seam, so distance is 1, not W-1.
    expect(d.data[W - 1]).toBeCloseTo(1, 3);
  });
});

describe("buildMap", () => {
  it("produces all six planes at full size", () => {
    const built = buildMap(rawFields(), defaultTuning());
    for (const name of [
      "crop",
      "metal",
      "oil",
      "temperature",
      "humidity",
      "water",
    ] as const) {
      expect(built.planes[name].length).toBe(W * H);
    }
    expect(built.stats.landTiles).toBe((W / 2) * H);
  });

  it("gives a deep basin inside a known field far more oil than bare geology", () => {
    // The Ghawar regression: boosting BEFORE normalizing broke the 0..23 km
    // clamp (bonuses reach 2.8x, so the real range was 0..64) and the largest
    // oil field on Earth came out at byte 17.
    const fields = rawFields({
      basin_fill: () => 11, // Ghawar: 11 km of sediment
      oil_au: (x) => (x === 0 ? 1 : 0), // inside an assessment unit
      oil_field: (x) => (x === 0 ? 1 : 0), // and a producing field
    });
    const built = buildMap(fields, defaultTuning());
    const ghawar = built.planes.oil[0];
    const bareBasin = built.planes.oil[1]; // same geology, no bonuses

    expect(ghawar).toBe(255);
    expect(ghawar).toBeGreaterThan(bareBasin * 2);
  });

  it("leaves tiles outside every basin at exactly zero oil", () => {
    // The Canadian Shield genuinely has no oil. A basin-less tile must not pick
    // any up from blurring or from an assessment-unit bonus.
    const fields = rawFields({
      basin_fill: () => 0,
      oil_au: () => 1,
      oil_field: () => 1,
    });
    const built = buildMap(fields, defaultTuning());
    expect([...built.planes.oil].every((v) => v === 0)).toBe(true);
  });

  it("applies the biome multiplier — rainforest is not prime farmland", () => {
    // Both biomes must live in the SAME map. crop is percentile-normalized, and
    // a percentile rank over a spatially uniform field erases any constant
    // multiplier — so comparing two separate all-rainforest / all-temperate
    // maps would (correctly!) show no difference at all.
    //
    // Identical carbon, rain and warmth on both halves of the land; only the
    // biome differs. NPP says the rainforest is the most productive place on
    // Earth. As farmland it is not, and the multiplier is what says so.
    const built = buildMap(
      rawFields({
        npp: () => 1e11,
        precip: () => 2500,
        temperature: () => 25,
        biome: (x) => (x < 4 ? 1 : 4), // x<4 rainforest (x0.65), x4..7 temperate (x1.0)
      }),
      defaultTuning(),
    );
    const at = (x: number) => built.planes.crop[0 * 16 + x];
    expect(at(5)).toBeGreaterThan(at(1)); // temperate beats rainforest
  });

  it("is deterministic — same inputs, same bytes", () => {
    const a = buildMap(rawFields(), defaultTuning());
    const b = buildMap(rawFields(), defaultTuning());
    expect([...a.planes.crop]).toEqual([...b.planes.crop]);
    expect([...a.terrain]).toEqual([...b.terrain]);
  });
});

describe("buildTerrainImage", () => {
  it("encodes exactly what the Go baker decodes", () => {
    // map_generator.go: alpha < 20 -> water; land magnitude = (blue - 140) / 2.
    const tuning = defaultTuning();
    const fields = rawFields();
    const built = buildMap(fields, tuning);
    const { rgba } = buildTerrainImage(
      fields,
      tuning,
      built.land,
      makeField(W, H),
    );

    for (let i = 0; i < W * H; i++) {
      const o = i * 4;
      const isLand = built.land.data[i] > 0;
      if (!isLand) {
        expect(rgba[o + 3]).toBeLessThan(20); // water
        expect(rgba[o + 2]).toBe(106); // the baker's water key colour
      } else {
        expect(rgba[o + 3]).toBe(255);
        expect(rgba[o + 2]).toBeGreaterThanOrEqual(140);
        expect(rgba[o + 2]).toBeLessThanOrEqual(200);
        const mag = (rgba[o + 2] - 140) / 2;
        expect(Number.isInteger(mag)).toBe(true);
        expect(mag).toBeGreaterThanOrEqual(0);
        expect(mag).toBeLessThanOrEqual(30);
      }
    }
  });

  it("marks ice as impassable void (opaque black), not as land", () => {
    const tuning = defaultTuning();
    tuning.terrain.iceAsImpassable = true;
    const fields = rawFields({ temperature: () => -40 });
    const built = buildMap(fields, tuning);
    // Every land tile is below the ice threshold, so all of them go void.
    expect(built.stats.impassableTiles).toBe(built.stats.landTiles);
    expect(built.terrain[2]).toBe(0); // blue = 0
    expect(built.terrain[3]).toBe(255); // opaque -> #000 impassable
  });
});

describe("buildEarthTerrainColors", () => {
  // Without a terrain-colors.png sidecar the map silently renders with VANILLA
  // OpenFront shading — flat blue sea, no biomes, no bathymetry. These pin the
  // two ways the sidecar itself came out wrong.

  const isBlue = (rgba: Uint8Array, i: number) =>
    rgba[i * 4 + 2] > rgba[i * 4 + 1] && rgba[i * 4 + 2] > rgba[i * 4];

  it("does not paint land as river-blue just because a stream crosses it", () => {
    // The regression: HydroRIVERS keeps every trickle down to 5 m3/s, which is
    // 28.65% of all land. Feeding that straight to the renderer flooded a
    // quarter of the planet with RIVER_STRONG blue — the Amazon basin, Siberia
    // and Canada all came out looking like open sea.
    const tuning = defaultTuning();
    const opts = defaultEarthColorOptions();
    const fields = rawFields({
      temperature: () => 25,
      precip: () => 2200, // warm + wet = rainforest
      river: () => 20, // a trickle, far below the 1000 m3/s gate
    });
    const built = buildMap(fields, tuning);
    const rgba = buildEarthTerrainColors(fields, tuning, built.land, opts);

    for (let i = 0; i < W * H; i++) {
      if (built.land.data[i] > 0) {
        expect(isBlue(rgba, i)).toBe(false); // land must not read as water
      }
    }
  });

  it("still draws a real river", () => {
    const tuning = defaultTuning();
    const fields = rawFields({
      temperature: () => 25,
      precip: () => 2200,
      river: (x, y) => (y === 0 && x < 4 ? 50_000 : 0), // an Amazon-scale river
    });
    const built = buildMap(fields, tuning);
    const rgba = buildEarthTerrainColors(fields, tuning, built.land);
    expect(isBlue(rgba, 0)).toBe(true); // on the river
    expect(isBlue(rgba, 2 * W + 1)).toBe(false); // dry land nearby
  });

  it("shades the ocean by real depth instead of one flat blue", () => {
    // The whole point of the sidecar: bathymetry. A shelf and an abyss must not
    // quantize to the same pixel.
    const tuning = defaultTuning();
    const fields = rawFields({
      land: () => 0, // all ocean
      elevation: (x) => (x < 8 ? -50 : -6000), // shelf | abyss
    });
    const built = buildMap(fields, tuning);
    const rgba = buildEarthTerrainColors(fields, tuning, built.land);

    const shelf = [rgba[0], rgba[1], rgba[2]];
    const abyss = [rgba[10 * 4], rgba[10 * 4 + 1], rgba[10 * 4 + 2]];
    expect(shelf).not.toEqual(abyss);
    // Deeper water is darker.
    const lum = (c: number[]) => c[0] + c[1] + c[2];
    expect(lum(abyss)).toBeLessThan(lum(shelf));
  });
});
