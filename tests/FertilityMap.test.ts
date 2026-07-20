import { describe, expect, test } from "vitest";
import { FOOD_DEFAULTS } from "../src/core/configuration/FoodConfig";
import { fertilityOf } from "../src/core/game/FertilityMap";
import { Game, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * The baked fertility plane (simplify-food-economy, tile-fertility spec):
 * one 0..1 number per tile from crop/humidity/water/temperature, calibrated
 * so all-mid-range inputs score exactly 0.5, baked once at map load.
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");

async function gameWith(fill: LayersFill): Promise<Game> {
  return setup(
    "half_land_half_ocean",
    { instantBuild: true },
    [info],
    undefined,
    undefined,
    true,
    fill,
  );
}

describe("fertility formula", () => {
  test("average land scores exactly 0.5 (the calibration guarantee)", () => {
    expect(fertilityOf(0.5, 0.5, 0.5, 0.5, FOOD_DEFAULTS)).toBeCloseTo(0.5, 9);
  });

  test("each factor pulls: barren, dry, and off-temperature land score low", () => {
    const perfectTemp = FOOD_DEFAULTS.fertilityTempOptN;
    expect(fertilityOf(1, 1, 1, perfectTemp, FOOD_DEFAULTS)).toBeCloseTo(1, 5);
    expect(fertilityOf(0, 1, 1, perfectTemp, FOOD_DEFAULTS)).toBeCloseTo(
      2 / 3,
      5,
    );
    // Arctic (temp 0): the band factor is 0 — a third of the score gone.
    expect(fertilityOf(1, 1, 1, 0, FOOD_DEFAULTS)).toBeCloseTo(2 / 3, 5);
    // Total desert on every axis.
    expect(fertilityOf(0, 0, 0, 0, FOOD_DEFAULTS)).toBe(0);
  });
});

describe("the baked plane", () => {
  test("mid-range layers bake to byte 128; water tiles bake to 0", async () => {
    const g = await gameWith(() => 128);
    // Find a land and a water tile.
    let land = -1;
    let water = -1;
    for (let y = 0; y < g.height() && (land < 0 || water < 0); y++) {
      for (let x = 0; x < g.width(); x++) {
        const t = g.ref(x, y);
        if (g.isLand(t) && land < 0) land = t;
        if (!g.isLand(t) && water < 0) water = t;
      }
    }
    // 128/255 inputs are one quantization step off exact 0.5 — allow ±1.
    expect(Math.abs(g.fertility(land) - 128)).toBeLessThanOrEqual(1);
    expect(g.fertility(water)).toBe(0);
  });

  test("the plane is deterministic across loads", async () => {
    const fill: LayersFill = (n, x, y) => (x * 7 + y * 13) % 256;
    const a = await gameWith(fill);
    const b = await gameWith(fill);
    for (let y = 0; y < a.height(); y += 5) {
      for (let x = 0; x < a.width(); x += 5) {
        const t = a.ref(x, y);
        expect(a.fertility(t)).toBe(b.fertility(t));
      }
    }
  });
});
