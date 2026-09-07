/** All rates are per simulation tick; food prices are integer milli-food. */
export interface PaintedEconomyConfig {
  baselineFoodCapacity: number;
  foodCapacityPerFarm: number;
  troopCapacityPerCity: number;
  startingFood: number;
  startingTroops: number;
  foodBootstrapFraction: number;
  troopBootstrapFraction: number;
  foodGrowthRate: number;
  troopGrowthRate: number;
  farmCostMilli: bigint;
  cityCostMilli: bigint;
  landDispatchMilliPerTroop: bigint;
  transportDispatchMilliPerTroop: bigint;
}

export const PAINTED_DEFAULTS: Readonly<PaintedEconomyConfig> = Object.freeze({
  baselineFoodCapacity: 5000,
  foodCapacityPerFarm: 5000,
  troopCapacityPerCity: 10000,
  startingFood: 4000,
  startingTroops: 2000,
  foodBootstrapFraction: 0.001,
  troopBootstrapFraction: 0.0003,
  foodGrowthRate: 0.004,
  troopGrowthRate: 0.009,
  farmCostMilli: 1_500_000n,
  cityCostMilli: 2_000_000n,
  landDispatchMilliPerTroop: 200n,
  transportDispatchMilliPerTroop: 200n,
});

function safeCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(
      "Painted economy count exceeds the nonnegative safe-integer range",
    );
  return value;
}

export function foodCapacityMilli(
  farms: number,
  c: Readonly<PaintedEconomyConfig>,
): bigint {
  return BigInt(
    safeCount(
      (c.baselineFoodCapacity + safeCount(farms) * c.foodCapacityPerFarm) *
        1000,
    ),
  );
}

export function troopCapacity(
  cities: number,
  c: Readonly<PaintedEconomyConfig>,
): number {
  return safeCount(safeCount(cities) * c.troopCapacityPerCity);
}

export function sigmoidGain(
  x: number,
  k: number,
  b: number,
  r: number,
): number {
  return k <= 0 || x >= k ? 0 : (b + r * x) * (1 - x / k);
}

export function advanceResource(
  x: number,
  k: number,
  credit: number,
  b: number,
  r: number,
): { amount: number; credit: number } {
  if (k <= 0 || x >= k) return { amount: x, credit: 0 };
  const gain = sigmoidGain(x, k, b, r);
  if (gain > 0 && k - x <= 1) return { amount: k, credit: 0 };
  const accumulated = credit + gain;
  const whole = Math.min(k - x, Math.floor(accumulated));
  return {
    amount: x + whole,
    credit: x + whole === k ? 0 : accumulated - whole,
  };
}

export function capacityScaledGain(
  x: number,
  k: number,
  a: number,
  r: number,
): number {
  return sigmoidGain(x, k, a * k, r);
}

export function validatePaintedConfig(c: Readonly<PaintedEconomyConfig>): void {
  for (const value of Object.values(c)) {
    if (
      typeof value === "bigint"
        ? value < 0n
        : !Number.isFinite(value) || value < 0
    )
      throw new Error(
        "Painted economy settings must be finite and nonnegative",
      );
  }
  for (const value of [
    c.baselineFoodCapacity,
    c.foodCapacityPerFarm,
    c.troopCapacityPerCity,
    c.startingFood,
    c.startingTroops,
  ])
    safeCount(value);
  foodCapacityMilli(1, c);
  safeCount(c.startingFood * 1000);
  if (
    c.baselineFoodCapacity <= 0 ||
    c.troopCapacityPerCity <= 0 ||
    c.farmCostMilli > foodCapacityMilli(0, c) ||
    c.cityCostMilli > foodCapacityMilli(0, c)
  )
    throw new Error("Baseline resources must permit reconstruction");
  for (const [a, r] of [
    [c.foodBootstrapFraction, c.foodGrowthRate],
    [c.troopBootstrapFraction, c.troopGrowthRate],
  ]) {
    if (a === 0 && r === 0) continue;
    if (a <= 0 || r <= 0 || a >= r || r + a > 1)
      throw new Error(
        "Refill must recover from zero on a stable S-shaped curve",
      );
  }
}

validatePaintedConfig(PAINTED_DEFAULTS);
