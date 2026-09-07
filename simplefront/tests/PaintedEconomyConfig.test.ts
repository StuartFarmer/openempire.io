import { expect, test } from "vitest";
import { Config } from "../src/core/configuration/Config";
import {
  PAINTED_DEFAULTS,
  advanceResource,
  foodCapacityMilli,
  sigmoidGain,
  troopCapacity,
  validatePaintedConfig,
} from "../src/core/configuration/PaintedEconomyConfig";
import { createRulesetConfig } from "../src/core/game/Rulesets";

test("capacity increases without changing the refill curve", () => {
  expect(foodCapacityMilli(0, PAINTED_DEFAULTS)).toBe(5_000_000n);
  expect(foodCapacityMilli(1, PAINTED_DEFAULTS)).toBe(10_000_000n);
  expect(troopCapacity(0, PAINTED_DEFAULTS)).toBe(0);
  expect(troopCapacity(2, PAINTED_DEFAULTS)).toBe(20_000);
  expect(
    [0, 1250, 2500, 3750, 5000].map((x) => sigmoidGain(x, 5000, 2, 0.003)),
  ).toEqual([2, 4.3125, 4.75, 3.3125, 0]);
});

test("fractional gains accumulate and the final quantum reaches capacity", () => {
  expect(advanceResource(0, 10_000, 0.5, 0.25, 0.003)).toEqual({
    amount: 0,
    credit: 0.75,
  });
  expect(advanceResource(0, 10_000, 0.75, 0.25, 0.003)).toEqual({
    amount: 1,
    credit: 0,
  });
  expect(advanceResource(9999, 10_000, 0.5, 1, 0.003)).toEqual({
    amount: 10_000,
    credit: 0,
  });
  expect(advanceResource(15_000, 10_000, 0.5, 1, 0.003)).toEqual({
    amount: 15_000,
    credit: 0,
  });
  expect(advanceResource(1, 0, 0.5, 1, 0.003)).toEqual({
    amount: 1,
    credit: 0,
  });
  expect(advanceResource(9999, 10_000, 0, 0, 0)).toEqual({
    amount: 9999,
    credit: 0,
  });
});

test("rejects invalid, unsafe, unstable and non-recoverable presets", () => {
  expect(() => validatePaintedConfig(PAINTED_DEFAULTS)).not.toThrow();
  for (const patch of [
    { foodGrowthRate: NaN },
    { foodBootstrapFraction: -1 },
    { startingTroops: 0.5 },
    { baselineFoodCapacity: 0 },
    { foodCapacityPerFarm: Number.MAX_SAFE_INTEGER },
    { farmCostMilli: -1n },
    { cityCostMilli: 6_000_000n },
    { foodGrowthRate: 2 },
    { foodBootstrapFraction: 20 },
    { troopGrowthRate: 0 },
  ])
    expect(() =>
      validatePaintedConfig({ ...PAINTED_DEFAULTS, ...patch }),
    ).toThrow();
  expect(() =>
    foodCapacityMilli(Number.MAX_SAFE_INTEGER, PAINTED_DEFAULTS),
  ).toThrow();
  expect(() => troopCapacity(-1, PAINTED_DEFAULTS)).toThrow();
  expect(() =>
    validatePaintedConfig({
      ...PAINTED_DEFAULTS,
      foodBootstrapFraction: 0,
      troopBootstrapFraction: 0,
      foodGrowthRate: 0,
      troopGrowthRate: 0,
    }),
  ).not.toThrow();
});

test("only SimpleFront selects painted rules", () => {
  const selected = createRulesetConfig("simplefront", {} as never, null, false);
  expect(selected.paintedEconomy()).toEqual(PAINTED_DEFAULTS);
  expect(new Config({} as never, null, false).paintedEconomy()).toBeNull();
});
