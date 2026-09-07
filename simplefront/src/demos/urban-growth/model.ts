import {
  clamp,
  GrowthConfig,
  randomSource,
  tileCapacity,
  tileMaturity,
  validateConfig,
} from "./config";
import { Terrain } from "./terrain";

export const STEP_SECONDS = 0.25;
export interface Candidate {
  tile: number;
  kind: "expand" | "densify";
  score: number;
  suitability: number;
  target: number;
}
export interface GrowthStats {
  seconds: number;
  area: number;
  capacity: number;
  meanDensity: number;
  status: "growing" | "mature" | "constrained" | "paused-rate";
}
export interface TileInspection {
  tile: number;
  elevation: number;
  slope: number;
  waterDistance: number;
  distance: number;
  suitability: number;
  maturity: number;
  targetMaturity: number;
  capacity: number;
  neighbours: number;
  uphill: number;
  waterEffect: number;
  score: number;
}

export class GrowthModel {
  readonly capacity: Float64Array;
  readonly history: GrowthStats[] = [];
  pendingCredit = 0;
  pendingTile: number | null = null;
  lastAction = "City established. Ready to grow.";
  lastTile: number | null = null;
  private random: () => number;
  private noise: Float64Array;
  private ticks = 0;
  private total: number;
  private occupied = new Set<number>();
  private status: GrowthStats["status"] = "growing";
  readonly config: GrowthConfig;
  constructor(
    readonly terrain: Terrain,
    config: GrowthConfig,
    seed: number,
    readonly centre: number,
  ) {
    validateConfig(config);
    if (
      !Number.isInteger(centre) ||
      centre < 0 ||
      centre >= terrain.height.length ||
      terrain.water[centre]
    )
      throw new Error("Choose a dry land tile for the city centre.");
    this.config = { ...config };
    this.random = randomSource(seed);
    this.noise = Float64Array.from(terrain.height, () => this.random());
    this.capacity = new Float64Array(terrain.height.length);
    this.capacity[centre] = config.ruralCapacity;
    this.total = config.ruralCapacity;
    this.occupied.add(centre);
    this.history.push(this.stats());
  }
  stats(): GrowthStats {
    return {
      seconds: this.ticks * STEP_SECONDS,
      area: this.occupied.size,
      capacity: this.total,
      meanDensity: this.total / this.occupied.size,
      status: this.status,
    };
  }
  inspect(tile: number): TileInspection {
    const { terrain: t, config: c } = this;
    const ns = t.neighbours(tile).filter((n) => this.capacity[n] > 0);
    const distance = Math.hypot(
      (tile % t.width) - (this.centre % t.width),
      Math.floor(tile / t.width) - Math.floor(this.centre / t.width),
    );
    const uphill =
      tile === this.centre || !ns.length
        ? 0
        : Math.min(...ns.map((n) => Math.max(0, t.height[tile] - t.height[n])));
    const waterEffect = c.waterBonus * Math.exp(-t.waterDistance[tile] / 5);
    const suitability = t.water[tile]
      ? 0
      : clamp(
          (1 + waterEffect) *
            Math.exp(
              -c.slopePenalty * t.slope[tile] - c.uphillPenalty * uphill,
            ),
          0.1,
          2,
        );
    const nearbyDensity = ns.length
      ? ns.reduce((s, n) => s + tileMaturity(this.capacity[n], c), 0) / 4
      : 0;
    const targetMaturity =
      tile === this.centre
        ? 1
        : clamp(
            1 -
              c.centreFalloff * (distance / Math.max(1, c.reach)) ** 0.8 +
              0.12 * (suitability - 1) +
              0.15 * nearbyDensity,
            0.08,
            1,
          );
    const maturity =
      this.capacity[tile] > 0 ? tileMaturity(this.capacity[tile], c) : 0;
    const score =
      suitability ** 2 *
      Math.exp((-2 * distance) / Math.max(1, c.reach)) *
      (1 + (c.neighbourWeight * ns.length) / 4) *
      (1 + c.irregularity * (this.noise[tile] * 2 - 1) * 0.9) *
      (this.capacity[tile] > 0 ? (0.2 + maturity) ** 2 : 1);
    return {
      tile,
      elevation: t.height[tile],
      slope: t.slope[tile],
      waterDistance: t.waterDistance[tile],
      distance,
      suitability,
      maturity,
      targetMaturity,
      capacity: this.capacity[tile],
      neighbours: ns.length,
      uphill,
      waterEffect,
      score,
    };
  }
  candidates(): Candidate[] {
    const out: Candidate[] = [],
      front = new Set<number>();
    for (const tile of this.occupied) {
      const info = this.inspect(tile),
        target = tileCapacity(info.targetMaturity, this.config);
      if (target - this.capacity[tile] > 0.001)
        out.push({
          tile,
          kind: "densify",
          score: info.score,
          suitability: info.suitability,
          target,
        });
      for (const n of this.terrain.neighbours(tile))
        if (!this.capacity[n] && !this.terrain.water[n]) front.add(n);
    }
    for (const tile of front) {
      const info = this.inspect(tile);
      if (
        info.distance <= this.config.reach &&
        this.config.ceiling - this.total >=
          this.config.ruralCapacity - 0.000001 &&
        (this.pendingTile === null || tile === this.pendingTile)
      )
        out.push({
          tile,
          kind: "expand",
          score: info.score,
          suitability: info.suitability,
          target: this.config.ruralCapacity,
        });
    }
    return out;
  }
  private choose(options: Candidate[]): Candidate {
    let value = this.random() * options.reduce((s, o) => s + o.score, 0);
    for (const option of options) {
      value -= option.score;
      if (value <= 0) return option;
    }
    return options[options.length - 1];
  }
  step(): void {
    this.ticks++;
    this.grow();
    if (this.ticks % 4 === 0) {
      this.history.push(this.stats());
      if (this.history.length > 2401) this.history.shift();
    }
  }
  private grow(): void {
    const c = this.config,
      remaining = c.ceiling - this.total;
    if (remaining <= 1e-8) {
      this.status = "mature";
      this.lastAction = "Mature: city capacity ceiling reached.";
      return;
    }
    if (c.rate === 0) {
      this.status = "paused-rate";
      this.lastAction = "Development rate is zero.";
      return;
    }
    const all = this.candidates();
    // Reserve the full capacity of an unfinished rural tile, while allowing
    // existing neighbourhoods to mature between its construction steps.
    const freeRemaining =
      remaining - (this.pendingTile === null ? 0 : c.ruralCapacity);
    const dense =
      freeRemaining > 1e-8 ? all.filter((x) => x.kind === "densify") : [];
    const expand = all.filter((x) => x.kind === "expand");
    if (!dense.length && !expand.length) {
      this.status = "constrained";
      this.lastAction =
        "Constrained: no room to spread or densify within reach.";
      return;
    }
    // As capacity develops, fill-in progressively replaces outward growth.
    // This is a starting preference, not an ever-increasing city budget.
    const densifyChance =
      1 - (1 - c.densify) * (1 - this.total / c.ceiling) ** 2;
    const useDense =
      dense.length && (!expand.length || this.random() < densifyChance);
    const choice = this.choose(useDense ? dense : expand);
    this.status = "growing";
    this.lastTile = choice.tile;
    let allowance = Math.min(
      choice.kind === "densify"
        ? freeRemaining
        : remaining - this.pendingCredit,
      c.rate *
        choice.suitability *
        (1 - (this.total + this.pendingCredit) / c.ceiling) *
        STEP_SECONDS,
    );
    if (choice.kind === "expand") {
      this.pendingTile = choice.tile;
      if (
        remaining <= c.ruralCapacity + 1e-8 &&
        c.ruralCapacity - this.pendingCredit < 1
      )
        allowance = c.ruralCapacity - this.pendingCredit;
      this.pendingCredit += Math.min(
        allowance,
        c.ruralCapacity - this.pendingCredit,
      );
      this.lastAction = "Establishing a rural neighbourhood.";
      if (this.pendingCredit >= c.ruralCapacity - 1e-8) {
        this.capacity[choice.tile] = c.ruralCapacity;
        this.total += c.ruralCapacity;
        this.occupied.add(choice.tile);
        this.pendingTile = null;
        this.pendingCredit = 0;
        this.lastAction = "Expanded into a new rural neighbourhood.";
      }
    } else {
      if (
        this.pendingTile === null &&
        remaining < 1 &&
        choice.target - this.capacity[choice.tile] >= remaining
      )
        allowance = remaining;
      const gain = Math.max(
        0,
        Math.min(allowance, choice.target - this.capacity[choice.tile]),
      );
      this.capacity[choice.tile] += gain;
      this.total += gain;
      this.lastAction = "Densifying an existing neighbourhood.";
    }
    if (c.ceiling - this.total <= 1e-8) {
      this.total = c.ceiling;
      this.status = "mature";
      this.lastAction = "Mature: city capacity ceiling reached.";
    }
  }
}
