export interface GrowthConfig {
  ceiling: number;
  reach: number;
  rate: number;
  densify: number;
  ruralCapacity: number;
  urbanCapacity: number;
  densityExponent: number;
  centreFalloff: number;
  slopePenalty: number;
  uphillPenalty: number;
  waterBonus: number;
  neighbourWeight: number;
  irregularity: number;
}

export const DEFAULT_CONFIG: Readonly<GrowthConfig> = Object.freeze({
  ceiling: 20000,
  reach: 20,
  rate: 200,
  densify: 0.65,
  ruralCapacity: 100,
  urbanCapacity: 2000,
  densityExponent: 2,
  centreFalloff: 0.75,
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
}[] = [
  {
    key: "ceiling",
    label: "City capacity ceiling",
    min: 100,
    max: 100000,
    step: 100,
    help: "Finite total housing capacity; not actual residents.",
  },
  {
    key: "reach",
    label: "Maximum reach · tiles",
    min: 0,
    max: 30,
    step: 1,
    help: "Distance from the original centre, not a fixed footprint.",
  },
  {
    key: "rate",
    label: "Development · capacity/s",
    min: 0,
    max: 2000,
    step: 25,
    help: "One shared city budget. Terrain and remaining capacity modify this rate.",
  },
  {
    key: "densify",
    label: "Densification preference",
    min: 0,
    max: 1,
    step: 0.05,
    help: "Starting preference for filling in. It rises toward 100% as the city approaches its capacity ceiling.",
  },
  {
    key: "ruralCapacity",
    label: "New rural tile capacity",
    min: 10,
    max: 1000,
    step: 10,
    help: "Development must pay this much capacity before a new tile appears.",
    advanced: true,
  },
  {
    key: "urbanCapacity",
    label: "Maximum tile capacity",
    min: 200,
    max: 10000,
    step: 100,
    help: "A fully mature central tile. Outskirts have lower preferred density.",
    advanced: true,
  },
  {
    key: "densityExponent",
    label: "Density exponent",
    min: 1,
    max: 4,
    step: 0.1,
    help: "Capacity = rural + (urban − rural) × maturity raised to this power.",
    advanced: true,
  },
  {
    key: "centreFalloff",
    label: "Outskirts density falloff",
    min: 0,
    max: 1,
    step: 0.05,
    help: "Larger values keep distant neighbourhoods rural or suburban.",
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
    throw new Error("Maximum tile capacity must exceed rural capacity.");
  if (value.ceiling < value.ruralCapacity)
    throw new Error("City ceiling must accommodate its starting tile.");
}
export const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export function tileCapacity(maturity: number, c: GrowthConfig): number {
  return (
    c.ruralCapacity +
    (c.urbanCapacity - c.ruralCapacity) * clamp(maturity) ** c.densityExponent
  );
}
export function tileMaturity(capacity: number, c: GrowthConfig): number {
  return (
    clamp((capacity - c.ruralCapacity) / (c.urbanCapacity - c.ruralCapacity)) **
    (1 / c.densityExponent)
  );
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
