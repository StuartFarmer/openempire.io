import {
  clamp,
  developmentIndex,
  establishmentWork,
  fertilityAtLevel,
  GrowthConfig,
  levelCapacity,
  maturationWork,
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
  status: "growing" | "filling" | "constrained" | "paused-rate";
  population: number;
  occupancy: number;
  vacancies: number;
  invested: number;
  developmentIndex: number;
  meanFertility: number;
  populationPerSecond: number;
  housingPressure: number;
  desiredHousing: number;
  developmentPerSecond: number;
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
  supportingNeighbours: number;
  uphill: number;
  waterEffect: number;
  score: number;
  level: number;
  progress: number;
  developmentIndex: number;
  fertility: number;
  residents: number;
}

export class CityModel {
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
  private population: number;
  private invested: number;
  private levels: Uint8Array;
  private credits: Float64Array;
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
    this.population = this.total * 0.8;
    this.invested = this.total;
    this.levels = new Uint8Array(terrain.height.length);
    this.levels[centre] = 1;
    this.credits = new Float64Array(terrain.height.length);
    this.occupied.add(centre);
    this.history.push(this.stats());
  }
  stats(): GrowthStats {
    const demographics = this.demographics();
    return {
      seconds: this.ticks * STEP_SECONDS,
      area: this.occupied.size,
      capacity: this.total,
      meanDensity: this.total / this.occupied.size,
      status: this.status,
      population: this.population,
      occupancy: this.population / this.total,
      vacancies: Math.max(0, this.total - this.population),
      invested: this.invested,
      ...demographics,
      populationPerSecond: this.populationPerSecond(demographics.meanFertility),
      housingPressure: this.housingPressure(),
      desiredHousing: this.population / this.config.targetOccupancy,
      developmentPerSecond: this.developmentPerSecond(),
    };
  }
  private demographics(): { developmentIndex: number; meanFertility: number } {
    // Uniform occupancy: resident shares equal housing shares. Vacant homes
    // never generate births; these means are multiplied by actual population.
    if (this.population === 0) return { developmentIndex: 0, meanFertility: 0 };
    let index = 0,
      fertility = 0;
    for (const tile of this.occupied) {
      const share = this.capacity[tile] / this.total;
      index += share * developmentIndex(this.levels[tile], this.config);
      fertility += share * fertilityAtLevel(this.levels[tile], this.config);
    }
    return { developmentIndex: index, meanFertility: fertility };
  }
  private populationPerSecond(fertility: number): number {
    // 3 is a fixed calibration reference, not replacement fertility. Recovery
    // is independent of births, allowing an abandoned city to be repopulated.
    return (
      this.config.populationRate *
      ((this.population * fertility) / 3 + 10) *
      clamp(1 - this.population / this.total)
    );
  }
  private housingPressure(): number {
    return clamp(
      (this.population / this.total - this.config.targetOccupancy) /
        (1 - this.config.targetOccupancy),
    );
  }
  private developmentPerSecond(): number {
    return (
      this.config.rate *
      (0.25 + 0.75 * Math.sqrt(this.population / 100)) *
      this.housingPressure()
    );
  }
  level(tile: number): number {
    return this.levels[tile] ?? 0;
  }
  upgradeProgress(tile: number): number {
    return this.inspect(tile).progress;
  }
  changePopulation(delta: number): void {
    if (!Number.isFinite(delta))
      throw new Error("Population change must be finite.");
    this.population = clamp(this.population + delta, 0, this.total);
    this.lastAction =
      delta < 0
        ? "Population lost; all development and paid progress remain."
        : "Existing vacancies filled; no housing created.";
    this.history.push(this.stats());
    if (this.history.length > 2401) this.history.shift();
  }
  maturationChance(): number {
    const c = this.config;
    return c.maturationScale === 0
      ? c.densify
      : 1 - (1 - c.densify) * (1 - clamp(this.total / c.maturationScale)) ** 2;
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
      supportingNeighbours: this.level(tile)
        ? ns.filter((n) => !t.water[n] && this.level(n) >= this.level(tile))
            .length
        : 0,
      uphill,
      waterEffect,
      score,
      level: this.level(tile),
      developmentIndex: this.level(tile)
        ? developmentIndex(this.level(tile), c)
        : 0,
      fertility: fertilityAtLevel(this.level(tile), c),
      residents: (this.population * this.capacity[tile]) / this.total,
      progress: this.level(tile)
        ? clamp(
            this.credits[tile] /
              maturationWork(
                this.level(tile),
                1 + Math.floor(targetMaturity * 99 + 1e-8),
                c,
              ),
          )
        : this.pendingTile === tile
          ? clamp(this.pendingCredit / establishmentWork(c))
          : 0,
    };
  }
  candidates(): Candidate[] {
    const out: Candidate[] = [],
      front = new Set<number>();
    for (const tile of this.occupied) {
      const info = this.inspect(tile),
        target = tileCapacity(info.targetMaturity, this.config);
      if (
        info.supportingNeighbours === 4 &&
        this.level(tile) < 100 &&
        levelCapacity(this.level(tile) + 1, this.config) <= target + 1e-8
      )
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
      if (this.pendingTile === null || tile === this.pendingTile)
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
    this.population = Math.min(
      this.total,
      this.population +
        this.populationPerSecond(this.demographics().meanFertility) *
          STEP_SECONDS,
    );
    this.grow();
    if (this.ticks % 4 === 0) {
      this.history.push(this.stats());
      if (this.history.length > 2401) this.history.shift();
    }
  }
  private grow(): void {
    const c = this.config;
    if (this.housingPressure() === 0) {
      this.status = "filling";
      this.lastAction =
        "Filling existing vacancies. Development and paid progress are retained.";
      return;
    }
    if (c.rate === 0) {
      this.status = "paused-rate";
      this.lastAction = "Development rate is zero.";
      return;
    }
    const all = this.candidates();
    const dense = all.filter((x) => x.kind === "densify");
    const expand = all.filter((x) => x.kind === "expand");
    if (!dense.length && !expand.length) {
      this.status = "constrained";
      this.lastAction =
        "No available expansion or maturation under the current terrain and neighbourhood targets.";
      return;
    }
    // Same per-step choice and pending-rural interleaving as experiment 01.
    // Preserve the original maturation ramp as a nonbinding reference; only the
    // city ceiling constraint and its rate taper are removed.
    const useDense =
      dense.length &&
      (!expand.length || this.random() < this.maturationChance());
    const choice = this.choose(useDense ? dense : expand);
    this.status = "growing";
    this.lastTile = choice.tile;
    const allowance =
      this.developmentPerSecond() * choice.suitability * STEP_SECONDS;
    if (choice.kind === "expand") {
      this.pendingTile = choice.tile;
      const needed = establishmentWork(c);
      const gain = Math.min(allowance, needed - this.pendingCredit);
      this.pendingCredit += gain;
      this.invested += gain;
      this.lastAction =
        "Establishing a rural neighbourhood; other tiles can mature between its growth steps.";
      if (this.pendingCredit >= needed - 1e-8) {
        this.capacity[choice.tile] = c.ruralCapacity;
        this.levels[choice.tile] = 1;
        this.total += c.ruralCapacity;
        this.occupied.add(choice.tile);
        this.pendingTile = null;
        this.pendingCredit = 0;
        this.lastAction = "Expanded into a new level-one rural neighbourhood.";
      }
    } else {
      // Housing is linear in level; work follows this tile's independent
      // slow-fast-slow maturation, independent of the whole city's age or size.
      const tile = choice.tile;
      const targetLevel = Math.min(
        100,
        1 + Math.floor(tileMaturity(choice.target, c) * 99 + 1e-8),
      );
      const before = this.levels[tile];
      const needed = maturationWork(before, targetLevel, c);
      const gain = Math.max(
        0,
        Math.min(allowance, needed - this.credits[tile]),
      );
      this.credits[tile] += gain;
      this.invested += gain;
      // A completed maturation is exactly +1. Do not spend this step's excess
      // allowance on another level or let establishment immediately mature.
      if (this.credits[tile] + 1e-8 >= needed) {
        const next = levelCapacity(before + 1, c);
        this.credits[tile] = Math.max(0, this.credits[tile] - needed);
        this.total += next - this.capacity[tile];
        this.capacity[tile] = next;
        this.levels[tile]++;
      }
      this.lastAction =
        this.levels[tile] > before
          ? `Matured an existing neighbourhood: level ${before} → ${this.levels[tile]}.`
          : `Maturing an existing neighbourhood: level ${before} → ${before + 1}.`;
    }
  }
}
