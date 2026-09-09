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
} from "./CityDevelopmentConfig";

export const STEP_SECONDS = 0.25;

/**
 * Immutable terrain view required by CityDevelopment. All arrays must have the
 * same non-zero length and that length must be divisible by width. The
 * constructor validates those shapes; finite precomputed values and valid
 * cardinal indices from neighbours are a trusted internal caller contract.
 * CityDevelopment never edits terrain.
 */
export interface DevelopmentTerrain {
  width: number;
  height: Float64Array;
  water: Uint8Array;
  slope: Float64Array;
  waterDistance: Float64Array;
  neighbours(tile: number): number[];
}

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

export type DevelopmentEligibility = (tile: number) => boolean;

export function populationPerSecond(
  population: number,
  housing: number,
  fertility: number,
  config: GrowthConfig,
): number {
  if (housing <= 0) return 0;
  return (
    config.populationRate *
    ((population * fertility) / 3 + 10) *
    clamp(1 - population / housing)
  );
}

export function housingPressure(
  population: number,
  housing: number,
  targetOccupancy: number,
): number {
  if (housing <= 0) return 0;
  return clamp(
    (population / housing - targetOccupancy) / (1 - targetOccupancy),
  );
}

/**
 * Deterministic one-city development state. Construction state is mutated only
 * through step/advance/changePopulation; callers must treat terrain as immutable.
 * Invalid configuration, terrain shapes, centres, population deltas, and
 * elapsed time are rejected before simulation state changes.
 */
export class CityDevelopment {
  readonly capacity: Float64Array;
  readonly history: GrowthStats[] = [];
  pendingCredit = 0;
  pendingTile: number | null = null;
  lastAction = "City established. Ready to grow.";
  lastTile: number | null = null;
  private random: () => number;
  private randomCalls = 0;
  private noise: Float64Array;
  private ticks = 0;
  private total: number;
  private population: number;
  private invested: number;
  private levels: Uint8Array;
  private credits: Float64Array;
  private occupied = new Set<number>();
  private status: GrowthStats["status"] = "growing";
  private elapsedRemainder = 0;
  readonly config: GrowthConfig;

  deterministicState() {
    return {
      tiles: [...this.occupied].map((tile) => [
        tile,
        this.capacity[tile],
        this.levels[tile],
        this.credits[tile],
      ]),
      pendingCredit: this.pendingCredit,
      pendingTile: this.pendingTile,
      ticks: this.ticks,
      population: this.population,
      invested: this.invested,
      elapsedRemainder: this.elapsedRemainder,
      randomCalls: this.randomCalls,
      centre: this.centre,
    };
  }

  constructor(
    readonly terrain: DevelopmentTerrain,
    config: GrowthConfig,
    seed: number,
    public centre: number,
  ) {
    validateConfig(config);
    this.validateTerrain();
    if (
      !Number.isInteger(centre) ||
      centre < 0 ||
      centre >= terrain.height.length ||
      terrain.water[centre]
    )
      throw new Error("Choose a dry land tile for the city centre.");
    this.config = { ...config };
    const source = randomSource(seed);
    this.random = () => {
      this.randomCalls++;
      return source();
    };
    this.noise = Float64Array.from(terrain.height, () => this.random());
    // ponytail: these full-map arrays are acceptable for this one-city parity
    // stage; replace them with shared tile state before allocating per city.
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

  private validateTerrain(): void {
    const { terrain } = this;
    const length = terrain?.height?.length;
    if (
      !terrain ||
      !Number.isInteger(terrain.width) ||
      terrain.width <= 0 ||
      !length ||
      length % terrain.width !== 0 ||
      terrain.water?.length !== length ||
      terrain.slope?.length !== length ||
      terrain.waterDistance?.length !== length ||
      typeof terrain.neighbours !== "function"
    )
      throw new Error("Terrain arrays and width are inconsistent.");
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
    if (this.population === 0) return { developmentIndex: 0, meanFertility: 0 };
    let index = 0;
    let fertility = 0;
    for (const tile of this.occupied) {
      const share = this.capacity[tile] / this.total;
      index += share * developmentIndex(this.levels[tile], this.config);
      fertility += share * fertilityAtLevel(this.levels[tile], this.config);
    }
    return { developmentIndex: index, meanFertility: fertility };
  }

  private populationPerSecond(fertility: number): number {
    return populationPerSecond(
      this.population,
      this.total,
      fertility,
      this.config,
    );
  }

  private housingPressure(): number {
    return housingPressure(
      this.population,
      this.total,
      this.config.targetOccupancy,
    );
  }

  private developmentPerSecond(): number {
    return (
      this.config.rate *
      (0.25 + 0.75 * Math.sqrt(this.population / 100)) *
      this.housingPressure()
    );
  }

  developedTiles(): IterableIterator<number> {
    return this.occupied.values();
  }

  /** Paid replacement founder: retain the old footprint and seed this centre. */
  refound(centre: number): void {
    if (
      !Number.isInteger(centre) ||
      centre < 0 ||
      centre >= this.capacity.length ||
      this.terrain.water[centre]
    )
      throw new Error("Choose a dry land tile for the city centre.");
    this.centre = centre;
    if (this.levels[centre] === 0) {
      this.capacity[centre] = this.config.ruralCapacity;
      this.levels[centre] = 1;
      this.total += this.config.ruralCapacity;
      this.invested += this.config.ruralCapacity;
      this.occupied.add(centre);
      if (this.pendingTile === centre) {
        this.credits[centre] += this.pendingCredit;
        this.pendingCredit = 0;
        this.pendingTile = null;
      }
    }
  }

  usableCapacity(eligible: DevelopmentEligibility): number {
    let total = 0;
    for (const tile of this.occupied)
      if (eligible(tile)) total += this.capacity[tile];
    return total;
  }

  populationPerSecondFor(
    population: number,
    usableHousing: number,
    eligible: DevelopmentEligibility,
  ): number {
    if (!Number.isFinite(population) || population < 0)
      throw new Error("Population must be finite and non-negative.");
    if (!Number.isFinite(usableHousing) || usableHousing < 0)
      throw new Error("Usable housing must be finite and non-negative.");
    let fertility = 0;
    if (population > 0 && usableHousing > 0) {
      for (const tile of this.occupied)
        if (eligible(tile))
          fertility +=
            (this.capacity[tile] / usableHousing) *
            fertilityAtLevel(this.levels[tile], this.config);
    }
    return populationPerSecond(
      population,
      usableHousing,
      fertility,
      this.config,
    );
  }

  /** Construction-only core step; game population remains authoritative. */
  advanceConstructionStep(
    population: number,
    usableHousing: number,
    eligible: DevelopmentEligibility,
  ): void {
    if (!Number.isFinite(population) || population < 0)
      throw new Error("Population must be finite and non-negative.");
    if (!Number.isFinite(usableHousing) || usableHousing < 0)
      throw new Error("Usable housing must be finite and non-negative.");
    this.ticks++;
    this.population = population;
    this.grow(population, usableHousing, eligible);
    if (this.ticks % 4 === 0) {
      this.history.push(this.stats());
      if (this.history.length > 2401) this.history.shift();
    }
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
    // ponytail: clamping to this city's housing is a one-city prototype limit;
    // replace it with player-global population allocation during integration.
    this.population = clamp(this.population + delta, 0, this.total);
    this.lastAction =
      delta < 0
        ? "Population lost; all development and paid progress remain."
        : "Existing vacancies filled; no housing created.";
    this.history.push(this.stats());
    if (this.history.length > 2401) this.history.shift();
  }

  /** Advances by fixed 0.25-second steps and retains all fractional time. */
  advance(elapsedSeconds: number): void {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0)
      throw new Error(
        "Elapsed simulation time must be finite and non-negative.",
      );
    const elapsed = this.elapsedRemainder + elapsedSeconds;
    if (!Number.isFinite(elapsed))
      throw new Error("Elapsed simulation time is too large.");
    let steps = Math.floor(elapsed / STEP_SECONDS);
    if (!Number.isSafeInteger(steps))
      throw new Error("Elapsed simulation time contains too many steps.");
    let remainder = elapsed - steps * STEP_SECONDS;
    const tolerance = Number.EPSILON * Math.max(1, elapsed) * 8;
    if (STEP_SECONDS - remainder <= tolerance) {
      steps++;
      remainder = 0;
    } else if (remainder <= tolerance) {
      remainder = 0;
    }
    for (let step = 0; step < steps; step++) this.step();
    this.elapsedRemainder = remainder;
  }

  maturationChance(): number {
    const config = this.config;
    return config.maturationScale === 0
      ? config.densify
      : 1 -
          (1 - config.densify) *
            (1 - clamp(this.total / config.maturationScale)) ** 2;
  }

  inspect(tile: number): TileInspection {
    const { terrain, config } = this;
    const neighbours = terrain
      .neighbours(tile)
      .filter((neighbour) => this.capacity[neighbour] > 0);
    const distance = Math.hypot(
      (tile % terrain.width) - (this.centre % terrain.width),
      Math.floor(tile / terrain.width) -
        Math.floor(this.centre / terrain.width),
    );
    const uphill =
      tile === this.centre || !neighbours.length
        ? 0
        : Math.min(
            ...neighbours.map((neighbour) =>
              Math.max(0, terrain.height[tile] - terrain.height[neighbour]),
            ),
          );
    const waterEffect =
      config.waterBonus * Math.exp(-terrain.waterDistance[tile] / 5);
    const suitability = terrain.water[tile]
      ? 0
      : clamp(
          (1 + waterEffect) *
            Math.exp(
              -config.slopePenalty * terrain.slope[tile] -
                config.uphillPenalty * uphill,
            ),
          0.1,
          2,
        );
    const nearbyDensity = neighbours.length
      ? neighbours.reduce(
          (sum, neighbour) =>
            sum + tileMaturity(this.capacity[neighbour], config),
          0,
        ) / 4
      : 0;
    const targetMaturity =
      tile === this.centre
        ? 1
        : clamp(
            1 -
              config.centreFalloff *
                (distance / Math.max(1, config.reach)) ** 0.8 +
              0.12 * (suitability - 1) +
              0.15 * nearbyDensity,
            0.08,
            1,
          );
    const maturity = this.capacity[tile]
      ? tileMaturity(this.capacity[tile], config)
      : 0;
    const score =
      suitability ** 2 *
      Math.exp((-2 * distance) / Math.max(1, config.reach)) *
      (1 + (config.neighbourWeight * neighbours.length) / 4) *
      (1 + config.irregularity * (this.noise[tile] * 2 - 1) * 0.9) *
      (this.capacity[tile] > 0 ? (0.2 + maturity) ** 2 : 1);
    return {
      tile,
      elevation: terrain.height[tile],
      slope: terrain.slope[tile],
      waterDistance: terrain.waterDistance[tile],
      distance,
      suitability,
      maturity,
      targetMaturity,
      capacity: this.capacity[tile],
      neighbours: neighbours.length,
      supportingNeighbours: this.level(tile)
        ? neighbours.filter(
            (neighbour) =>
              !terrain.water[neighbour] &&
              this.level(neighbour) >= this.level(tile),
          ).length
        : 0,
      uphill,
      waterEffect,
      score,
      level: this.level(tile),
      developmentIndex: this.level(tile)
        ? developmentIndex(this.level(tile), config)
        : 0,
      fertility: fertilityAtLevel(this.level(tile), config),
      residents: (this.population * this.capacity[tile]) / this.total,
      progress: this.level(tile)
        ? clamp(
            this.credits[tile] /
              maturationWork(
                this.level(tile),
                1 + Math.floor(targetMaturity * 99 + 1e-8),
                config,
              ),
          )
        : this.pendingTile === tile
          ? clamp(this.pendingCredit / establishmentWork(config))
          : 0,
    };
  }

  candidates(eligible: DevelopmentEligibility = () => true): Candidate[] {
    const output: Candidate[] = [];
    const frontier = new Set<number>();
    for (const tile of this.occupied) {
      const inspection = this.inspect(tile);
      const target = tileCapacity(inspection.targetMaturity, this.config);
      if (
        eligible(tile) &&
        inspection.supportingNeighbours === 4 &&
        this.level(tile) < 100 &&
        levelCapacity(this.level(tile) + 1, this.config) <= target + 1e-8
      )
        output.push({
          tile,
          kind: "densify",
          score: inspection.score,
          suitability: inspection.suitability,
          target,
        });
      for (const neighbour of this.terrain.neighbours(tile))
        if (
          !this.capacity[neighbour] &&
          !this.terrain.water[neighbour] &&
          eligible(neighbour)
        )
          frontier.add(neighbour);
    }
    for (const tile of frontier) {
      const inspection = this.inspect(tile);
      if (this.pendingTile === null || tile === this.pendingTile)
        output.push({
          tile,
          kind: "expand",
          score: inspection.score,
          suitability: inspection.suitability,
          target: this.config.ruralCapacity,
        });
    }
    return output;
  }

  private choose(options: Candidate[]): Candidate {
    let value =
      this.random() * options.reduce((sum, option) => sum + option.score, 0);
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

  private grow(
    population = this.population,
    usableHousing = this.total,
    eligible: DevelopmentEligibility = () => true,
  ): void {
    const config = this.config;
    const pressure = housingPressure(
      population,
      usableHousing,
      config.targetOccupancy,
    );
    if (pressure === 0) {
      this.status = "filling";
      this.lastAction =
        "Filling existing vacancies. Development and paid progress are retained.";
      return;
    }
    if (config.rate === 0) {
      this.status = "paused-rate";
      this.lastAction = "Development rate is zero.";
      return;
    }
    const all = this.candidates(eligible);
    const dense = all.filter((candidate) => candidate.kind === "densify");
    const expand = all.filter((candidate) => candidate.kind === "expand");
    if (!dense.length && !expand.length) {
      this.status = "constrained";
      this.lastAction =
        "No available expansion or maturation under the current terrain and neighbourhood targets.";
      return;
    }
    const useDense =
      dense.length &&
      (!expand.length || this.random() < this.maturationChance());
    const choice = this.choose(useDense ? dense : expand);
    this.status = "growing";
    this.lastTile = choice.tile;
    const allowance =
      config.rate *
      (0.25 + 0.75 * Math.sqrt(population / 100)) *
      pressure *
      choice.suitability *
      STEP_SECONDS;
    if (choice.kind === "expand") {
      this.pendingTile = choice.tile;
      const needed = establishmentWork(config);
      const gain = Math.min(allowance, needed - this.pendingCredit);
      this.pendingCredit += gain;
      this.invested += gain;
      this.lastAction =
        "Establishing a rural neighbourhood; other tiles can mature between its growth steps.";
      if (this.pendingCredit >= needed - 1e-8) {
        this.capacity[choice.tile] = config.ruralCapacity;
        this.levels[choice.tile] = 1;
        this.total += config.ruralCapacity;
        this.occupied.add(choice.tile);
        this.pendingTile = null;
        this.pendingCredit = 0;
        this.lastAction = "Expanded into a new level-one rural neighbourhood.";
      }
      return;
    }

    const tile = choice.tile;
    const targetLevel = Math.min(
      100,
      1 + Math.floor(tileMaturity(choice.target, config) * 99 + 1e-8),
    );
    const before = this.levels[tile];
    const needed = maturationWork(before, targetLevel, config);
    const gain = Math.max(0, Math.min(allowance, needed - this.credits[tile]));
    this.credits[tile] += gain;
    this.invested += gain;
    if (this.credits[tile] + 1e-8 >= needed) {
      const next = levelCapacity(before + 1, config);
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
