export interface GrowthConfig {
  populationRate: number;
  maturationScale: number;
  reach: number;
  rate: number;
  densify: number;
  ruralCapacity: number;
  urbanCapacity: number; // Legacy scenario key: now used only as a work reference.
  centreFalloff: number;
  slopePenalty: number;
  uphillPenalty: number;
  waterBonus: number;
  neighbourWeight: number;
  irregularity: number;
}

export const DEFAULT_CONFIG: Readonly<GrowthConfig> = Object.freeze({
  populationRate: 400,
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
    key: "populationRate",
    label: "Population replenishment · maximum/s",
    min: 0,
    max: 2000,
    step: 25,
    help: "A bounded sigmoid-shaped refill into existing housing. People do not create new construction budgets.",
  },
  {
    key: "reach",
    label: "Density falloff distance · tiles",
    min: 0,
    max: 30,
    step: 1,
    help: "The original distance scale for neighbourhood density and selection weights; no longer a hard expansion border.",
  },
  {
    key: "rate",
    label: "Development · work/s",
    min: 0,
    max: 2000,
    step: 25,
    help: "One shared work allowance, modified by terrain. Each tile matures slowly at first, faster in the middle, then slowly near its local target. At most one level per simulation step.",
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
    throw new Error("Maturation work reference must exceed housing per level.");
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
