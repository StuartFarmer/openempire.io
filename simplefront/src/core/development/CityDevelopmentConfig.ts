/** Actual-game people per model population unit; keeps demo-tuned work unchanged. */
export const GAME_POPULATION_SCALE = 100;

export interface GrowthConfig {
  populationRate: number;
  lowerLevel: number;
  upperLevel: number;
  lowerLevelBirths: number;
  upperLevelBirths: number;
  targetOccupancy: number;
  maturationScale: number;
  reach: number;
  rate: number;
  densify: number;
  ruralCapacity: number;
  urbanCapacity: number;
  centreFalloff: number;
  slopePenalty: number;
  uphillPenalty: number;
  waterBonus: number;
  neighbourWeight: number;
  irregularity: number;
}

export const DEFAULT_CONFIG: Readonly<GrowthConfig> = Object.freeze({
  populationRate: 0.2,
  lowerLevel: 1,
  upperLevel: 10,
  lowerLevelBirths: 4.5,
  upperLevelBirths: 1.5,
  targetOccupancy: 0.85,
  maturationScale: 20000,
  reach: 20,
  rate: 200,
  densify: 0.65,
  ruralCapacity: 100,
  urbanCapacity: 2000,
  centreFalloff: 0.75,
  slopePenalty: 8,
  uphillPenalty: 12,
  waterBonus: 0.5,
  neighbourWeight: 1.2,
  irregularity: 0.15,
});

const CONFIG_RANGES: {
  [Key in keyof GrowthConfig]: readonly [minimum: number, maximum: number];
} = {
  populationRate: [0, 2],
  lowerLevel: [1, 99],
  upperLevel: [2, 100],
  lowerLevelBirths: [0, 10],
  upperLevelBirths: [0, 10],
  targetOccupancy: [0.5, 0.95],
  maturationScale: [0, 100000],
  reach: [0, 30],
  rate: [0, 2000],
  densify: [0, 1],
  ruralCapacity: [10, 1000],
  urbanCapacity: [200, 10000],
  centreFalloff: [0, 1],
  slopePenalty: [0, 30],
  uphillPenalty: [0, 30],
  waterBonus: [0, 1],
  neighbourWeight: [0, 4],
  irregularity: [0, 1],
};

/** Validates the complete numeric contract used by the development model. */
export function validateConfig(value: GrowthConfig): void {
  if (!value || typeof value !== "object")
    throw new Error("Growth settings are missing.");
  for (const key of Object.keys(CONFIG_RANGES) as (keyof GrowthConfig)[]) {
    const number = value[key];
    const [minimum, maximum] = CONFIG_RANGES[key];
    if (
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      number < minimum ||
      number > maximum
    )
      throw new Error(`${key} must be between ${minimum} and ${maximum}.`);
  }
  if (value.urbanCapacity <= value.ruralCapacity)
    throw new Error("Maturation work reference must exceed housing per level.");
  if (
    !Number.isInteger(value.lowerLevel) ||
    !Number.isInteger(value.upperLevel)
  )
    throw new Error("Development boundaries must be whole levels.");
  if (value.lowerLevel >= value.upperLevel)
    throw new Error(
      "Upper development level must exceed lower development level.",
    );
}

export function developmentIndex(level: number, config: GrowthConfig): number {
  return clamp(
    (level - config.lowerLevel) / (config.upperLevel - config.lowerLevel),
  );
}

export function fertilityAtLevel(level: number, config: GrowthConfig): number {
  if (level <= 0) return 0;
  return (
    config.lowerLevelBirths +
    developmentIndex(level, config) *
      (config.upperLevelBirths - config.lowerLevelBirths)
  );
}

export function levelCapacity(level: number, config: GrowthConfig): number {
  return config.ruralCapacity * level;
}

const MATURATION_SPEED_FLOOR = 0.1;

export function establishmentWork(config: GrowthConfig): number {
  return config.ruralCapacity / MATURATION_SPEED_FLOOR;
}

/** Work for one discrete maturation, sampling a sigmoid's speed at its midpoint. */
export function maturationWork(
  level: number,
  targetLevel: number,
  config: GrowthConfig,
): number {
  if (level >= targetLevel) return Infinity;
  const phase = clamp((level - 0.5) / (targetLevel - 1));
  const speed =
    MATURATION_SPEED_FLOOR +
    (1 - MATURATION_SPEED_FLOOR) * 4 * phase * (1 - phase);
  return (config.urbanCapacity - config.ruralCapacity) / 99 / speed;
}

export const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

export function tileCapacity(maturity: number, config: GrowthConfig): number {
  return config.ruralCapacity * (1 + 99 * clamp(maturity));
}

export function tileMaturity(capacity: number, config: GrowthConfig): number {
  return clamp((capacity / config.ruralCapacity - 1) / 99);
}

/** Deterministic xorshift32 stream retained for exact demo parity. */
export function randomSource(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
