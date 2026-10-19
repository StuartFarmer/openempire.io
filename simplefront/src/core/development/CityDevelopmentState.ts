import { simpleHash } from "../Util";
import type { Candidate, DevelopmentTerrain } from "./CityDevelopment";
import {
  clamp,
  establishmentWork,
  fertilityAtLevel,
  type GrowthConfig,
  levelCapacity,
  maturationWork,
  randomSource,
  tileMaturity,
  validateConfig,
} from "./CityDevelopmentConfig";

export interface CityDevelopmentAccount {
  model: CityDevelopmentState;
  randomState: number;
  elapsedMilliseconds: number;
}

/** Development-only snapshot. Ownership, troops and birth credit belong to the game. */
export interface CityDevelopmentSnapshot {
  version: "tile-local-1";
  seed: number;
  size: number;
  config: GrowthConfig;
  tiles: [tile: number, level: number, work: number][];
  unfinished: number[];
  accounts: [
    player: string,
    randomState: number,
    elapsedMilliseconds: number,
  ][];
}

/** One physical field per game; ownership is read from the game at each opportunity. */
export class CityDevelopmentState {
  readonly capacity: Float64Array;
  readonly config: Readonly<GrowthConfig>;
  private readonly levels: Uint8Array;
  private readonly credits: Float64Array;
  private readonly noise: Float64Array;
  private readonly occupied = new Set<number>();
  private readonly unfinished = new Set<number>();
  private readonly accounts = new Map<string, CityDevelopmentAccount>();
  private readonly owned = new Map<number, Set<number>>();
  private readonly growth = new Map<number, Set<number>>();
  private readonly orderedOwned = new Map<number, number[]>();
  private readonly developmentOrder: Uint32Array;
  private readonly recentChanges = new Uint32Array(4096);
  private changeRevision = 0;
  private historyStart = 0;
  private readonly inspections = new Map<
    number,
    { suitability: number; supports: number; score: number }
  >();

  constructor(
    readonly terrain: DevelopmentTerrain,
    config: GrowthConfig,
    private readonly seed = 0x9e3779b9,
    private readonly ownerAt?: (tile: number) => number,
  ) {
    validateConfig(config);
    this.config = Object.freeze({ ...config });
    const size = terrain.height.length;
    this.capacity = new Float64Array(size);
    this.levels = new Uint8Array(size);
    this.credits = new Float64Array(size);
    this.developmentOrder = new Uint32Array(size);
    const random = randomSource(seed);
    this.noise = Float64Array.from(terrain.height, () => random());
  }

  account(player: string, seed = simpleHash(player)): CityDevelopmentAccount {
    let account = this.accounts.get(player);
    if (!account) {
      account = {
        model: this,
        randomState: seed >>> 0 || 0x9e3779b9,
        elapsedMilliseconds: 0,
      };
      this.accounts.set(player, account);
    }
    return account;
  }

  level(tile: number): number {
    return this.levels[tile] ?? 0;
  }

  work(tile: number): number {
    return this.credits[tile] ?? 0;
  }

  developedTiles(): IterableIterator<number> {
    return this.occupied.values();
  }

  get developmentRevision(): number {
    return this.changeRevision;
  }

  /** Independent readers can miss ticks; an expired cursor requires a full scan. */
  changesSince(revision: number): number[] | null {
    if (
      revision < this.historyStart ||
      revision > this.changeRevision ||
      this.changeRevision - revision > this.recentChanges.length
    )
      return null;
    const tiles = new Set<number>();
    for (let i = revision; i < this.changeRevision; i++)
      tiles.add(this.recentChanges[i % this.recentChanges.length]);
    // Preserve the full observer's physical insertion order.
    return [...tiles].sort(
      (a, b) => this.developmentOrder[a] - this.developmentOrder[b],
    );
  }

  private recordChange(tile: number): void {
    this.recentChanges[this.changeRevision % this.recentChanges.length] = tile;
    this.changeRevision++;
  }

  /** Preserve physical insertion order, including after capture, for exact birth arithmetic. */
  ownedDevelopedTiles(owner: number): Iterable<number> {
    if (!this.ownerAt) return this.occupied;
    let tiles = this.orderedOwned.get(owner);
    if (!tiles) {
      tiles = [...(this.owned.get(owner) ?? [])].sort(
        (a, b) => this.developmentOrder[a] - this.developmentOrder[b],
      );
      this.orderedOwned.set(owner, tiles);
    }
    return tiles;
  }

  /** Includes wilderness beside foreign/neutral buildings, not just our own city. */
  growthTiles(owner: number): Iterable<number> | undefined {
    return this.ownerAt ? (this.growth.get(owner) ?? []) : undefined;
  }

  ownershipChanged(tile: number, previousOwner: number): void {
    if (this.level(tile)) this.recordChange(tile);
    if (!this.ownerAt) return;
    if (this.owned.get(previousOwner)?.delete(tile))
      this.orderedOwned.delete(previousOwner);
    this.growth.get(previousOwner)?.delete(tile);
    this.indexTile(tile);
  }

  private indexTile(tile: number): void {
    if (!this.ownerAt) return;
    const owner = this.ownerAt(tile);
    if (!owner) return;
    const add = (index: Map<number, Set<number>>) => {
      let tiles = index.get(owner);
      if (!tiles) index.set(owner, (tiles = new Set()));
      if (tiles.has(tile)) return false;
      tiles.add(tile);
      return true;
    };
    // Maturation and nearby growth preserve insertion order. Only membership
    // changes require sorting the owner's developed tiles again.
    if (this.level(tile) && add(this.owned)) this.orderedOwned.delete(owner);
    if (
      this.level(tile) ||
      this.terrain.neighbours(tile).some((t) => this.level(t))
    )
      add(this.growth);
  }

  private indexDevelopment(tile: number): void {
    this.recordChange(tile);
    this.inspections.delete(tile);
    this.indexTile(tile);
    for (const next of this.terrain.neighbours(tile)) {
      this.inspections.delete(next);
      this.indexTile(next);
    }
  }

  found(tile: number): void {
    if (
      !Number.isInteger(tile) ||
      tile < 0 ||
      tile >= this.levels.length ||
      this.terrain.water[tile]
    )
      throw new Error("Found only on valid dry land.");
    if (this.level(tile)) throw new Error("Tile is already developed.");
    this.levels[tile] = 1;
    this.capacity[tile] = this.config.ruralCapacity;
    this.developmentOrder[tile] = this.occupied.size;
    this.occupied.add(tile);
    this.indexDevelopment(tile);
    this.unfinished.delete(tile);
    // Like Demo 4, paid establishment work remains physical maturation credit.
  }

  pendingFor(eligible: (tile: number) => boolean): number | null {
    for (const tile of this.unfinished) if (eligible(tile)) return tile;
    return null;
  }

  usableCapacity(
    eligible: (tile: number) => boolean,
    tiles: Iterable<number> = this.occupied,
  ): number {
    let housing = 0;
    for (const tile of tiles)
      if (eligible(tile)) housing += this.capacity[tile];
    return housing;
  }

  populationPerSecondFor(
    population: number,
    housing: number,
    eligible: (tile: number) => boolean,
    tiles: Iterable<number> = this.occupied,
  ): number {
    if (housing <= 0 || population >= housing) return 0;
    let fertility = 0;
    if (population > 0)
      for (const tile of tiles)
        if (eligible(tile))
          fertility +=
            (this.capacity[tile] / housing) *
            fertilityAtLevel(this.level(tile), this.config);
    return (
      this.config.populationRate *
      ((population * fertility) / 3 + 10) *
      clamp(1 - population / housing)
    );
  }

  maturationChance(housing: number): number {
    const c = this.config;
    return c.maturationScale === 0
      ? c.densify
      : 1 - (1 - c.densify) * (1 - clamp(housing / c.maturationScale)) ** 2;
  }

  private inspect(tile: number) {
    // Terrain/config are immutable. Only a level change at this tile or one
    // cardinal neighbour changes geometry; ownership/obstacles stay live in
    // candidates() and never enter this cache.
    const cached = this.inspections.get(tile);
    if (cached) return cached;
    const { terrain: t, config: c } = this;
    const neighbours = t
      .neighbours(tile)
      .filter((next) => this.level(next) > 0);
    const uphill = neighbours.length
      ? Math.min(
          ...neighbours.map((next) =>
            Math.max(0, t.height[tile] - t.height[next]),
          ),
        )
      : 0;
    const suitability = t.water[tile]
      ? 0
      : clamp(
          (1 + c.waterBonus * Math.exp(-t.waterDistance[tile] / 5)) *
            Math.exp(
              -c.slopePenalty * t.slope[tile] - c.uphillPenalty * uphill,
            ),
          0.1,
          2,
        );
    const level = this.level(tile);
    const result = {
      suitability,
      supports: neighbours.filter(
        (next) => !t.water[next] && this.level(next) >= level,
      ).length,
      score:
        suitability ** 2 *
        (1 + (c.neighbourWeight * neighbours.length) / 4) *
        (1 + c.irregularity * (this.noise[tile] * 2 - 1) * 0.9) *
        (level ? (0.2 + tileMaturity(this.capacity[tile], c)) ** 2 : 1),
    };
    this.inspections.set(tile, result);
    return result;
  }

  /** A finite limit is an existence probe; full construction queries stay tile-sorted. */
  candidates(
    eligible: (tile: number) => boolean,
    limit = Infinity,
    scope?: Iterable<number>,
  ): Candidate[] {
    const out: Candidate[] = [],
      front = new Set<number>();
    const pending = this.pendingFor(eligible);
    for (const tile of scope ?? this.occupied) {
      if (this.level(tile) > 0 && this.level(tile) < 100) {
        const info = this.inspect(tile);
        // Most developed tiles cannot mature. Check cached geometry before
        // querying live ownership, damage and structures.
        if (info.supports === 4 && eligible(tile)) {
          out.push({
            tile,
            kind: "densify",
            score: info.score,
            suitability: info.suitability,
            target: levelCapacity(100, this.config),
          });
          if (out.length >= limit) return out;
        }
      }
      if (scope) {
        if (
          !this.level(tile) &&
          !this.terrain.water[tile] &&
          (pending === null || pending === tile) &&
          eligible(tile)
        ) {
          const info = this.inspect(tile);
          out.push({
            tile,
            kind: "expand",
            score: info.score,
            suitability: info.suitability,
            target: this.config.ruralCapacity,
          });
          if (out.length >= limit) return out;
        }
        continue;
      }
      // Physical foreign/neutral buildings support expansion too.
      for (const next of this.terrain.neighbours(tile))
        if (
          !front.has(next) &&
          !this.level(next) &&
          !this.terrain.water[next] &&
          (pending === null || pending === next) &&
          eligible(next)
        ) {
          front.add(next);
          const info = this.inspect(next);
          out.push({
            tile: next,
            kind: "expand",
            score: info.score,
            suitability: info.suitability,
            target: this.config.ruralCapacity,
          });
          if (out.length >= limit) return out;
        }
    }
    return out.sort((a, b) => a.tile - b.tile);
  }

  private random(account: CityDevelopmentAccount): number {
    let state = account.randomState;
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    account.randomState = state >>> 0;
    return account.randomState / 4294967296;
  }

  advanceConstructionStep(
    account: CityDevelopmentAccount,
    population: number,
    housing: number,
    eligible: (tile: number) => boolean,
    scope?: Iterable<number>,
  ): void {
    const c = this.config;
    const pressure =
      housing > 0
        ? clamp(
            (population / housing - c.targetOccupancy) /
              (1 - c.targetOccupancy),
          )
        : population > 0
          ? 1
          : 0;
    if (!pressure || !c.rate) return;
    const all = this.candidates(eligible, Infinity, scope);
    if (!all.length) return;
    const dense = all.filter((o) => o.kind === "densify"),
      expand = all.filter((o) => o.kind === "expand");
    const useDense =
      dense.length &&
      (!expand.length || this.random(account) < this.maturationChance(housing));
    const options = useDense ? dense : expand;
    let roll =
      this.random(account) *
      options.reduce((sum, option) => sum + option.score, 0);
    let choice = options[options.length - 1];
    for (const option of options) {
      roll -= option.score;
      if (roll <= 0) {
        choice = option;
        break;
      }
    }
    const tile = choice.tile,
      before = this.level(tile);
    const needed = before
      ? maturationWork(before, 100, c)
      : establishmentWork(c);
    const allowance =
      c.rate *
      (0.25 + 0.75 * Math.sqrt(population / 100)) *
      pressure *
      choice.suitability *
      0.25;
    this.credits[tile] += Math.max(
      0,
      Math.min(allowance, needed - this.credits[tile]),
    );
    if (!before) this.unfinished.add(tile);
    if (this.credits[tile] >= needed - 1e-8) {
      this.credits[tile] = Math.max(0, this.credits[tile] - needed);
      this.levels[tile] = before + 1;
      this.capacity[tile] = levelCapacity(before + 1, c);
      if (!before) this.developmentOrder[tile] = this.occupied.size;
      this.occupied.add(tile);
      this.indexDevelopment(tile);
      this.unfinished.delete(tile);
    }
  }

  deterministicState(): CityDevelopmentSnapshot {
    const tiles = new Set([...this.occupied, ...this.unfinished]);
    return {
      version: "tile-local-1",
      seed: this.seed,
      size: this.levels.length,
      config: { ...this.config },
      // Preserve iteration order as well as unfinished order for exact continuation.
      tiles: [...tiles].map((tile) => [
        tile,
        this.level(tile),
        this.work(tile),
      ]),
      unfinished: [...this.unfinished],
      accounts: [...this.accounts]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([id, a]) => [id, a.randomState, a.elapsedMilliseconds]),
    };
  }

  /** Restore into the same terrain/config and game ownership; validate before changing live state. */
  restore(snapshot: CityDevelopmentSnapshot): void {
    if (
      snapshot.version !== "tile-local-1" ||
      snapshot.seed !== this.seed ||
      snapshot.size !== this.levels.length ||
      JSON.stringify(snapshot.config) !== JSON.stringify(this.config)
    )
      throw new Error("Incompatible city development snapshot.");
    const tiles = new Set<number>();
    for (const [tile, level, work] of snapshot.tiles) {
      if (
        !Number.isInteger(tile) ||
        tile < 0 ||
        tile >= this.levels.length ||
        this.terrain.water[tile] ||
        tiles.has(tile) ||
        !Number.isInteger(level) ||
        level < 0 ||
        level > 100 ||
        !Number.isFinite(work) ||
        work < 0
      )
        throw new Error("Invalid development tile.");
      tiles.add(tile);
    }
    const unfinished = new Set(snapshot.unfinished);
    if (
      unfinished.size !== snapshot.unfinished.length ||
      snapshot.unfinished.some((tile) => !tiles.has(tile)) ||
      snapshot.tiles.some(
        ([tile, level]) => unfinished.has(tile) !== (level === 0),
      )
    )
      throw new Error("Invalid unfinished work order.");
    const accounts = new Set<string>();
    for (const [id, random, elapsed] of snapshot.accounts) {
      if (
        typeof id !== "string" ||
        accounts.has(id) ||
        !Number.isInteger(random) ||
        random <= 0 ||
        random > 0xffffffff ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        elapsed >= 250
      )
        throw new Error("Invalid development account.");
      accounts.add(id);
    }
    if ([...this.accounts.keys()].some((id) => !accounts.has(id)))
      throw new Error("Missing development account.");
    this.levels.fill(0);
    this.capacity.fill(0);
    this.credits.fill(0);
    this.occupied.clear();
    this.unfinished.clear();
    this.owned.clear();
    this.orderedOwned.clear();
    this.growth.clear();
    this.inspections.clear();
    for (const [tile, level, work] of snapshot.tiles) {
      this.levels[tile] = level;
      this.capacity[tile] = levelCapacity(level, this.config);
      this.credits[tile] = work;
      if (level) {
        this.developmentOrder[tile] = this.occupied.size;
        this.occupied.add(tile);
      }
    }
    for (const tile of this.occupied) this.indexDevelopment(tile);
    for (const tile of snapshot.unfinished) this.unfinished.add(tile);
    for (const [id, randomState, elapsedMilliseconds] of snapshot.accounts)
      Object.assign(this.account(id), { randomState, elapsedMilliseconds });
    // Restore can remove tiles and rewind physical insertion order. Every
    // existing observer must reconcile a complete snapshot on its next read.
    this.historyStart = ++this.changeRevision;
  }
}
