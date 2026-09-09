export interface GrowthConfig {
  populationRate: number;
  lowerLevel: number;
  upperLevel: number;
  lowerLevelBirths: number;
  upperLevelBirths: number;
  targetOccupancy: number;
  maturationScale: number;
  rate: number;
  densify: number;
  ruralCapacity: number;
  urbanCapacity: number; // Legacy scenario key: now used only as a work reference.
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
  rate: 200,
  densify: 0.65,
  ruralCapacity: 100,
  urbanCapacity: 2000,
  slopePenalty: 8,
  uphillPenalty: 12,
  waterBonus: 0.5,
  neighbourWeight: 1.2,
  irregularity: 0.15,
});

export const CONTROLS: {
  key: keyof GrowthConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  help: string;
  advanced?: boolean;
  fertility?: boolean;
}[] = [
  {
    key: "populationRate",
    label: "Population speed · game-time multiplier",
    min: 0,
    max: 2,
    step: 0.01,
    help: "Scales resident births plus a small recovery allowance. Available housing slows replenishment near capacity. Zero pauses all population growth; this is not a real-world annual birth rate.",
  },
  {
    key: "targetOccupancy",
    label: "Housing demand starts at occupancy",
    min: 0.5,
    max: 0.95,
    step: 0.01,
    help: "Below this occupancy, fill vacancies first. Above it, housing pressure smoothly increases construction, reaching full pressure when housing is full.",
  },
  {
    key: "lowerLevel",
    label: "Lower development level",
    min: 1,
    max: 99,
    step: 1,
    help: "Developed tiles at or below this level use the starting fertility. Not a minimum building level.",
    fertility: true,
  },
  {
    key: "upperLevel",
    label: "Upper development level",
    min: 2,
    max: 100,
    step: 1,
    help: "Tiles at or above this level use the ending fertility. Not a cap on upgrades or housing. Must exceed the lower level.",
    fertility: true,
  },
  {
    key: "lowerLevelBirths",
    label: "Births per woman · lower level",
    min: 0,
    max: 10,
    step: 0.1,
    help: "Starting endpoint of the linear fertility gradient; a game equivalent, not simulated households.",
    fertility: true,
  },
  {
    key: "upperLevelBirths",
    label: "Births per woman · upper level",
    min: 0,
    max: 10,
    step: 0.1,
    help: "Ending endpoint. Match both birth values for a flat gradient; reverse them to test an increasing gradient.",
    fertility: true,
  },
  {
    key: "rate",
    label: "Development · work/s at 100 residents",
    min: 0,
    max: 2000,
    step: 25,
    help: "One shared budget grows with the square root of population, then scales with housing pressure and terrain. Tile maturation and the one-level-per-step rule are unchanged.",
  },
  {
    key: "densify",
    label: "Maturation preference",
    min: 0,
    max: 1,
    step: 0.05,
    help: "Starting upgrade preference; rises as the city develops. Only cells supported on all four sides by equal-or-higher-level neighbours can mature. If none qualify, expand instead.",
  },
  {
    key: "ruralCapacity",
    label: "Housing per level",
    min: 10,
    max: 1000,
    step: 10,
    help: "Housing = level × this amount. Establishment and each completed +1 upgrade award the same housing gain. Default: 100.",
    advanced: true,
  },
  {
    key: "urbanCapacity",
    label: "Maturation work reference",
    min: 200,
    max: 10000,
    step: 100,
    help: "Controls maturation work costs, not housing. The base work per upgrade is (reference − housing per level) / 99, modified by the tile's slow–fast–slow curve.",
    advanced: true,
  },
  {
    key: "maturationScale",
    label: "Maturation ramp · housing reference",
    min: 0,
    max: 100000,
    step: 100,
    help: "Preserves the original shift toward fill-in. This is not a housing ceiling or rate limit: the city can grow past it. Zero disables the ramp and uses the slider percentage directly.",
    advanced: true,
  },
  {
    key: "slopePenalty",
    label: "Steepness resistance",
    min: 0,
    max: 30,
    step: 1,
    help: "Penalizes steep terrain in both directions.",
    advanced: true,
  },
  {
    key: "uphillPenalty",
    label: "Extra uphill resistance",
    min: 0,
    max: 30,
    step: 1,
    help: "Additional cost of climbing from the best adjacent developed tile.",
    advanced: true,
  },
  {
    key: "waterBonus",
    label: "Water attraction",
    min: 0,
    max: 1,
    step: 0.05,
    help: "Nearby water attracts development and speeds it up; no flood model.",
    advanced: true,
  },
  {
    key: "neighbourWeight",
    label: "Neighbour attraction",
    min: 0,
    max: 4,
    step: 0.1,
    help: "Encourages filling gaps and forming coherent neighbourhoods.",
    advanced: true,
  },
  {
    key: "irregularity",
    label: "Organic irregularity",
    min: 0,
    max: 1,
    step: 0.05,
    help: "Stable seeded local variation, not a new roll on every render.",
    advanced: true,
  },
];

export function validateConfig(value: GrowthConfig): void {
  if (!value || typeof value !== "object")
    throw new Error("Growth settings are missing.");
  for (const control of CONTROLS) {
    const n = value[control.key];
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      n < control.min ||
      n > control.max
    )
      throw new Error(
        `${control.label} must be between ${control.min} and ${control.max}.`,
      );
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
export function developmentIndex(level: number, c: GrowthConfig): number {
  return clamp((level - c.lowerLevel) / (c.upperLevel - c.lowerLevel));
}
export function fertilityAtLevel(level: number, c: GrowthConfig): number {
  if (level <= 0) return 0;
  return (
    c.lowerLevelBirths +
    developmentIndex(level, c) * (c.upperLevelBirths - c.lowerLevelBirths)
  );
}
export function levelCapacity(level: number, c: GrowthConfig): number {
  return c.ruralCapacity * level;
}
const MATURATION_SPEED_FLOOR = 0.1;
export function establishmentWork(c: GrowthConfig): number {
  return c.ruralCapacity / MATURATION_SPEED_FLOOR;
}
/** Work for one discrete maturation, sampling a sigmoid's speed at its midpoint. */
export function maturationWork(
  level: number,
  targetLevel: number,
  c: GrowthConfig,
): number {
  if (level >= targetLevel) return Infinity;
  const phase = clamp((level - 0.5) / (targetLevel - 1));
  const speed =
    MATURATION_SPEED_FLOOR +
    (1 - MATURATION_SPEED_FLOOR) * 4 * phase * (1 - phase);
  return (c.urbanCapacity - c.ruralCapacity) / 99 / speed;
}
export const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export function tileCapacity(maturity: number, c: GrowthConfig): number {
  return c.ruralCapacity * (1 + 99 * clamp(maturity));
}
export function tileMaturity(capacity: number, c: GrowthConfig): number {
  return clamp((capacity / c.ruralCapacity - 1) / 99);
}

/** Small deterministic PRNG owned by this experiment, independent of game state. */
export function randomSource(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
