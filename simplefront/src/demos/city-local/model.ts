import {
  clamp,
  developmentIndex,
  establishmentWork,
  fertilityAtLevel,
  GrowthConfig,
  levelCapacity,
  maturationWork,
  randomSource,
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

export type PlayerID = 1 | 2;
export type Owner = 0 | PlayerID;
interface Account {
  population: number;
  capacity: number;
  area: number;
  invested: number;
  started: boolean;
  status: GrowthStats["status"];
  action: string;
  history: GrowthStats[];
}
const account = (): Account => ({
  population: 0,
  capacity: 0,
  area: 0,
  invested: 0,
  started: false,
  status: "filling",
  action: "Claim land and found a neighbourhood.",
  history: [],
});

/** Demo 4: one physical tile field, with one economy/work opportunity per player. */
export class CityModel {
  readonly capacity: Float64Array;
  readonly config: GrowthConfig;
  activePlayer: PlayerID = 1;
  lastTile: number | null = null;
  private levels: Uint8Array;
  private owners: Uint8Array;
  private credits: Float64Array;
  private occupied = new Set<number>();
  private unfinished = new Set<number>();
  private accounts: Record<PlayerID, Account> = { 1: account(), 2: account() };
  private random: Record<PlayerID, () => number>;
  private noise: Float64Array;
  private ticks = 0;

  constructor(
    readonly terrain: Terrain,
    config: GrowthConfig,
    seed: number,
    readonly centre: number, // Historical marker only; never used in scoring or control.
  ) {
    validateConfig(config);
    this.config = { ...config };
    const noise = randomSource(seed);
    this.noise = Float64Array.from(terrain.height, () => noise());
    this.random = { 1: randomSource(seed), 2: randomSource(seed ^ 0x85ebca6b) };
    this.capacity = new Float64Array(terrain.height.length);
    this.levels = new Uint8Array(terrain.height.length);
    this.owners = Uint8Array.from(terrain.water, (wet) => (wet ? 0 : 1));
    this.credits = new Float64Array(terrain.height.length);
    this.found(centre, 1);
    this.record();
  }
  get history(): GrowthStats[] {
    return this.accounts[this.activePlayer].history;
  }
  get lastAction(): string {
    return this.accounts[this.activePlayer].action;
  }
  get pendingTile(): number | null {
    return this.pendingFor(this.activePlayer);
  }
  get pendingCredit(): number {
    return this.pendingTile === null ? 0 : this.credits[this.pendingTile];
  }
  owner(tile: number): Owner {
    return (this.owners[tile] ?? 0) as Owner;
  }
  level(tile: number): number {
    return this.levels[tile] ?? 0;
  }
  private validateTile(tile: number): void {
    if (
      !Number.isInteger(tile) ||
      tile < 0 ||
      tile >= this.capacity.length ||
      this.terrain.water[tile]
    )
      throw new Error("Choose a dry land tile.");
  }
  private validatePlayer(player: number): asserts player is PlayerID {
    if (player !== 1 && player !== 2) throw new Error("Choose player A or B.");
  }
  /** An explicit lab editor action, not a simulated battle or a food purchase. */
  setOwner(tile: number, owner: Owner): void {
    this.validateTile(tile);
    if (owner !== 0) this.validatePlayer(owner);
    const previous = this.owner(tile);
    if (previous === owner) return;
    if (this.level(tile)) {
      if (previous) {
        this.accounts[previous].capacity -= this.capacity[tile];
        this.accounts[previous].area--;
      }
      if (owner) {
        this.accounts[owner].capacity += this.capacity[tile];
        this.accounts[owner].area++;
        this.accounts[owner].started = true;
      }
    }
    this.owners[tile] = owner;
    // Levels and per-tile work stay here; no population moves with ownership.
    if (previous)
      this.accounts[previous].action =
        "Territory lost; people, buildings and work are retained.";
    if (owner)
      this.accounts[owner].action =
        "Tile captured with its housing and unfinished work; no people transferred.";
  }
  /** Place a level-one seed; subsequent seeds add no people or work engines. */
  found(tile: number, player: PlayerID = this.activePlayer): void {
    this.validatePlayer(player);
    this.validateTile(tile);
    if (this.owner(tile) !== player)
      throw new Error("Found only on your own land; claim this tile first.");
    if (this.level(tile)) throw new Error("This tile is already developed.");
    const a = this.accounts[player];
    this.levels[tile] = 1;
    this.capacity[tile] = this.config.ruralCapacity;
    this.occupied.add(tile);
    this.unfinished.delete(tile);
    // Existing establishment work remains available as physical maturation work.
    a.capacity += this.config.ruralCapacity;
    a.area++;
    a.invested += this.config.ruralCapacity;
    if (!a.started) {
      a.population = this.config.ruralCapacity * 0.8;
      a.started = true;
    }
    a.action =
      "Level-one neighbourhood founded. No permanent governing centre.";
  }
  private pendingFor(player: PlayerID): number | null {
    for (const tile of this.unfinished)
      if (this.owner(tile) === player && !this.level(tile)) return tile;
    return null;
  }
  stats(player: PlayerID = this.activePlayer): GrowthStats {
    this.validatePlayer(player);
    const a = this.accounts[player];
    let development = 0,
      fertility = 0;
    if (a.capacity > 0 && a.population > 0)
      for (const tile of this.occupied)
        if (this.owner(tile) === player) {
          const share = this.capacity[tile] / a.capacity;
          development +=
            share * developmentIndex(this.level(tile), this.config);
          fertility += share * fertilityAtLevel(this.level(tile), this.config);
        }
    const occupancy = a.capacity > 0 ? a.population / a.capacity : 0;
    const pressure =
      a.capacity > 0
        ? clamp(
            (occupancy - this.config.targetOccupancy) /
              (1 - this.config.targetOccupancy),
          )
        : a.population > 0
          ? 1
          : 0;
    return {
      seconds: this.ticks * STEP_SECONDS,
      area: a.area,
      capacity: a.capacity,
      meanDensity: a.area ? a.capacity / a.area : 0,
      status: a.status,
      population: a.population,
      occupancy,
      vacancies: Math.max(0, a.capacity - a.population),
      invested: a.invested,
      developmentIndex: development,
      meanFertility: fertility,
      populationPerSecond:
        a.capacity > 0
          ? this.config.populationRate *
            ((a.population * fertility) / 3 + 10) *
            clamp(1 - occupancy)
          : 0,
      housingPressure: pressure,
      desiredHousing: a.population / this.config.targetOccupancy,
      developmentPerSecond:
        this.config.rate *
        (0.25 + 0.75 * Math.sqrt(a.population / 100)) *
        pressure,
    };
  }
  changePopulation(delta: number, player: PlayerID = this.activePlayer): void {
    this.validatePlayer(player);
    if (!Number.isFinite(delta))
      throw new Error("Population change must be finite.");
    const a = this.accounts[player];
    a.population =
      delta > 0
        ? a.population + Math.min(delta, Math.max(0, a.capacity - a.population))
        : Math.max(0, a.population + delta);
    a.action =
      delta < 0
        ? "Population lost; development and paid work remain."
        : "Existing vacancies filled; no housing created.";
    this.record();
  }
  maturationChance(player: PlayerID = this.activePlayer): number {
    const c = this.config;
    return c.maturationScale === 0
      ? c.densify
      : 1 -
          (1 - c.densify) *
            (1 - clamp(this.accounts[player].capacity / c.maturationScale)) **
              2;
  }
  inspect(tile: number): TileInspection {
    const { terrain: t, config: c } = this;
    const ns = t.neighbours(tile).filter((n) => this.level(n) > 0);
    const uphill = ns.length
      ? Math.min(...ns.map((n) => Math.max(0, t.height[tile] - t.height[n])))
      : 0;
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
    const maturity = tileMaturity(this.capacity[tile], c);
    const level = this.level(tile);
    const owner = this.owner(tile);
    const a = owner ? this.accounts[owner] : null;
    return {
      tile,
      elevation: t.height[tile],
      slope: t.slope[tile],
      waterDistance: t.waterDistance[tile],
      suitability,
      maturity,
      targetMaturity: 1,
      capacity: this.capacity[tile],
      neighbours: ns.length,
      supportingNeighbours: level
        ? ns.filter((n) => !t.water[n] && this.level(n) >= level).length
        : 0,
      uphill,
      waterEffect,
      score:
        suitability ** 2 *
        (1 + (c.neighbourWeight * ns.length) / 4) *
        (1 + c.irregularity * (this.noise[tile] * 2 - 1) * 0.9) *
        (level ? (0.2 + maturity) ** 2 : 1),
      level,
      developmentIndex: level ? developmentIndex(level, c) : 0,
      fertility: fertilityAtLevel(level, c),
      residents: a?.capacity
        ? (a.population * this.capacity[tile]) / a.capacity
        : 0,
      progress: clamp(
        this.credits[tile] /
          (level ? maturationWork(level, 100, c) : establishmentWork(c)),
      ),
    };
  }
  upgradeProgress(tile: number): number {
    return this.inspect(tile).progress;
  }
  candidates(player: PlayerID = this.activePlayer): Candidate[] {
    this.validatePlayer(player);
    const out: Candidate[] = [],
      front = new Set<number>();
    const pending = this.pendingFor(player);
    for (const tile of this.occupied) {
      const info = this.inspect(tile);
      if (
        this.owner(tile) === player &&
        info.supportingNeighbours === 4 &&
        this.level(tile) < 100
      )
        out.push({
          tile,
          kind: "densify",
          score: info.score,
          suitability: info.suitability,
          target: levelCapacity(100, this.config),
        });
      for (const n of this.terrain.neighbours(tile))
        if (
          !this.level(n) &&
          !this.terrain.water[n] &&
          this.owner(n) === player
        )
          front.add(n);
    }
    for (const tile of front)
      if (pending === null || pending === tile) {
        const info = this.inspect(tile);
        out.push({
          tile,
          kind: "expand",
          score: info.score,
          suitability: info.suitability,
          target: this.config.ruralCapacity,
        });
      }
    // Stable spatial ordering, independent of which seed was placed first.
    return out.sort((a, b) => a.tile - b.tile);
  }
  private choose(options: Candidate[], player: PlayerID): Candidate {
    let value =
      this.random[player]() * options.reduce((sum, o) => sum + o.score, 0);
    for (const option of options) {
      value -= option.score;
      if (value <= 0) return option;
    }
    return options[options.length - 1];
  }
  step(): void {
    this.ticks++;
    for (const player of [1, 2] as const) {
      const a = this.accounts[player],
        before = this.stats(player);
      a.population += Math.min(
        Math.max(0, a.capacity - a.population),
        before.populationPerSecond * STEP_SECONDS,
      );
    }
    for (const player of [1, 2] as const) this.grow(player);
    if (this.ticks % 4 === 0) this.record();
  }
  private record(): void {
    for (const player of [1, 2] as const) {
      const h = this.accounts[player].history;
      h.push(this.stats(player));
      if (h.length > 2401) h.shift();
    }
  }
  /** Seal a freshly assembled scenario's actual starting chart values. */
  finishSetup(): void {
    if (this.ticks !== 0)
      throw new Error("Cannot replace history after simulation starts.");
    for (const player of [1, 2] as const)
      this.accounts[player].history.length = 0;
    this.record();
  }
  private grow(player: PlayerID): void {
    const a = this.accounts[player],
      stats = this.stats(player),
      c = this.config;
    if (stats.housingPressure === 0 || c.rate === 0) {
      a.status = c.rate === 0 ? "paused-rate" : "filling";
      a.action =
        c.rate === 0
          ? "Development rate is zero."
          : "Filling vacancies; development and work are retained.";
      return;
    }
    const all = this.candidates(player);
    const dense = all.filter((o) => o.kind === "densify"),
      expand = all.filter((o) => o.kind === "expand");
    if (!all.length) {
      a.status = "constrained";
      a.action =
        "No legal expansion or four-sided upgrade. Claim space or inspect support.";
      return;
    }
    const useDense =
      dense.length &&
      (!expand.length || this.random[player]() < this.maturationChance(player));
    const choice = this.choose(useDense ? dense : expand, player);
    const tile = choice.tile,
      before = this.level(tile);
    const needed = before
      ? maturationWork(before, 100, c)
      : establishmentWork(c);
    const allowance =
      stats.developmentPerSecond * choice.suitability * STEP_SECONDS;
    const gain = Math.max(0, Math.min(allowance, needed - this.credits[tile]));
    this.credits[tile] += gain;
    a.invested += gain;
    if (!before) this.unfinished.add(tile);
    a.status = "growing";
    this.lastTile = tile;
    a.action = before
      ? "Maturing a locally supported neighbourhood."
      : "Establishing a level-one neighbourhood.";
    if (this.credits[tile] >= needed - 1e-8) {
      this.credits[tile] = Math.max(0, this.credits[tile] - needed);
      this.levels[tile] = before + 1;
      this.capacity[tile] = levelCapacity(before + 1, c);
      a.capacity += c.ruralCapacity;
      if (!before) {
        this.occupied.add(tile);
        this.unfinished.delete(tile);
        a.area++;
      }
      a.action = before
        ? `Matured one tile: level ${before} → ${before + 1}.`
        : "Expanded into one level-one tile.";
    }
  }
}
