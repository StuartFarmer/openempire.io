import { z } from "zod";
import { AssetManifest } from "../AssetUrls";
import { DoomsdayClockSpeed } from "../game/DoomsdayClock";
import {
  Difficulty,
  Game,
  GameMode,
  GameType,
  Gold,
  Player,
  PlayerInfo,
  PlayerType,
  TerrainType,
  TerraNullius,
  Tick,
  UnitInfo,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { UserSettings } from "../game/UserSettings";
import { GameConfig, TeamCountConfig } from "../Schemas";
import { NukeType } from "../StatsSchemas";
import { assertNever, sigmoid, toInt, within } from "../Util";

interface EconomyPlayer {
  type(): PlayerType;
  isLobbyCreator(): boolean;
  numTilesOwned(): number;
  troops(): number;
  units(type: UnitType): Array<{
    isUnderConstruction(): boolean;
    level(): number;
  }>;
  /** True when the game map has layer data — the food economy is active. */
  hasFoodEconomy(): boolean;
  /** Built urban area (Σ density) — the carrying capacity on layered maps. */
  urbanArea(): number;
}

declare global {
  interface Window {
    BOOTSTRAP_CONFIG?: {
      gitCommit?: string;
      assetManifest?: AssetManifest;
      cdnBase?: string;
      gameEnv?: string;
      numWorkers?: number;
      instanceId?: string;
    };
  }
}

export enum GameEnv {
  Dev,
  Preprod,
  Prod,
}

export function parseGameEnv(value: string | undefined): GameEnv {
  switch (value) {
    case "dev":
      return GameEnv.Dev;
    case "staging":
      return GameEnv.Preprod;
    case "prod":
      return GameEnv.Prod;
    default:
      throw new Error(`unsupported game env: ${value}`);
  }
}

export interface NukeMagnitude {
  inner: number;
  outer: number;
}

const DEFENSE_DEBUFF_MIDPOINT = 150_000;
const DEFENSE_DEBUFF_DECAY_RATE = Math.LN2 / 50000;
const DEFAULT_SPAWN_IMMUNITY_TICKS = 5 * 10;

export const JwksSchema = z.object({
  keys: z
    .object({
      alg: z.literal("EdDSA"),
      crv: z.literal("Ed25519"),
      kty: z.literal("OKP"),
      x: z.string(),
    })
    .array()
    .min(1),
});

/** SAM launcher construction duration in ticks (non-instant-build). */
export const SAM_CONSTRUCTION_TICKS = 30 * 10;

// Doomsday Clock tunables (anti-stall). Off unless enabled in GameConfig.
// Times in seconds. The required map share rises in waves (levels + times in
// DoomsdayClock.ts, chosen by `speed`). A side caught below the bar gets a
// warnSeconds cooldown ("Danger, decay in Xs"), then troops bleed to zero: the
// warn (10s) + the linear drain (~55s from full troops, sooner with fewer troops
// or a shrinking territory) make ~1 minute from caught to wiped out.
const DOOMSDAY_CLOCK_DEFAULTS = {
  enabled: false,
  speed: "normal" as DoomsdayClockSpeed,
  warnSeconds: 10, // cooldown before decay after the bar catches you
  drainStartPercent: 2, // starts bleeding at once (already beats troop income)
  drainMaxPercent: 6,
  drainRampSeconds: 50, // ramps LINEARLY to the max over this long
};

/**
 * Tribal-age food economy knobs (see openspec add-tribal-food-economy).
 * Active only on layered maps (game.hasLayers()). Food flows are computed in
 * "milliunits" — 1000 milli = 1 displayed food — so sub-unit per-tick rates
 * stay integer. All balance tuning happens here; the mechanics in
 * FoodEconomy.ts are shape, not numbers.
 */
export interface FoodConfig {
  /** Milli-food one idle person eats per tick. */
  idleConsumptionMilli: number;
  /** Milli-food per tick for a troop in transit (boats). */
  moveConsumptionMilli: number;
  /** Milli-food per tick for a troop in an active attack. */
  fightConsumptionMilli: number;
  /**
   * Natural land harvest: production = floor(fertilitySum^exponent × milli).
   * DEFAULT 0 — unfarmed land produces nothing; food comes from Farmland
   * only. The knob survives for experiments.
   */
  landHarvestMilli: number;
  landHarvestExponent: number;
  /** Milli-food per tick per (tile crop byte × level) of each Farmland. */
  farmProductionMilli: number;
  /**
   * Population-cap floor with zero Settlements (the camp before the first
   * town). Real capacity comes from Settlement plots — starting with the
   * one in the spawn starter kit.
   */
  basePopulation: number;
  /**
   * Starting population for every player type (replaces vanilla
   * startManpower on layered maps). Sized to what the spawn starter kit's
   * three farms feed — idling at spawn must not starve.
   */
  startPopulation: number;
  /** Extra population cap per Settlement level. */
  populationPerSettlement: number;
  /** Storage cap (display food) with zero Barns. */
  baseStorage: number;
  /** Extra storage (display food) per Barn level. */
  storagePerBarn: number;
  /**
   * Stored food decays by numer/denom per tick (integer floor). Tuned to
   * ~25%/minute: grain rots, so war chests are built close to when they
   * are spent and sustained campaigns need farm income.
   */
  decayNumer: number;
  decayDenom: number;
  /**
   * Chance a tribal plot on conquered territory is razed (destroyed with
   * fire) instead of captured. Default 1.0 — invasion destroys everything;
   * conquest yields scorched land, never a turnkey economy.
   */
  capturedPlotRazeChance: number;
  /**
   * Growth reaches full speed when production exceeds consumption by this
   * fraction (e.g. 0.25 → a 25% surplus grows at the vanilla rate). Between
   * break-even and that point, growth scales linearly. At or below
   * break-even there is no growth (storage only buffers against starvation).
   */
  surplusForFullGrowth: number;
  /** Fraction of unfed population that starves per deficit tick. */
  starvationDeathFraction: number;
  /**
   * Plot cost bases (display food). Actual cost =
   * base × (1 + owned × costGrowthPerOwned) — cheap plots, gently rising,
   * so empires are painted from dozens of them; the storage cap still
   * gates saving for large batches.
   */
  settlementCost: number;
  farmlandCost: number;
  barnCost: number;
  /** Per-owned-plot cost growth (0.03 → plot #34 costs ~2× base). */
  costGrowthPerOwned: number;
  /**
   * Bonus per edge-adjacent same-type plot (max 4 neighbors) applied to a
   * plot's effect — rewards contiguous districts (farm belts, towns).
   */
  adjacencyBonus: number;
  /** Starting stock: buys the first farms, not comfort (fits baseStorage). */
  startingFood: number;
  /**
   * Default food allocation (add-food-allocation): the fraction of each
   * tick's production offered to the population; the rest banks into
   * storage. Players adjust it with the allocation slider (food_allocation
   * intent); bots keep the default. At 1.0 a growing population consumes
   * everything and nothing ever banks.
   */
  defaultPopulationShare: number;
  /**
   * Supply lines (add-supply-lines): every owned tile has a supply quality
   * 1/(1 + (d/supplyRadius)^supplyDecayPower), where d is the owned-land
   * step distance to the nearest completed Settlement or Barn. Quality is
   * 0.5 exactly at supplyRadius; the flood is cut off at 3× the radius
   * (quality < ~0.04) so field cost stays bounded.
   */
  supplyRadius: number;
  supplyDecayPower: number;
  /** Field refresh cadence in ticks (staleness bound between recomputes). */
  supplyRefreshTicks: number;
  /**
   * War logistics: an out-of-supply attack LOSES TROOPS each tick —
   * floor(troops × (1 − frontQuality) × warSupplyAttrition) die before the
   * army eats. 0.005 → a fully unsupplied army loses 0.5%/tick (halves in
   * ~14s); a supplied one loses nothing. Food consumption stays at the
   * base war rate — supply failures kill men, not budgets.
   */
  warSupplyAttrition: number;

  // ── Urban core growth (add-urban-core-growth) ─────────────────────────
  /**
   * Logistic growth rate: per tick, built area advances
   * ΔA = urbanGrowthRate · A · (1 − A/K) · surplusFactor, where K is the
   * summed suitability of reachable owned land. Slow founding →
   * acceleration → saturation (the empirical S-curve).
   */
  urbanGrowthRate: number;
  /** Population cap added per unit of urban area (Σ density). */
  popPerDensity: number;
  /** Food produced per (cropByte/255 · density · supplyQuality), milliunits. */
  urbanYieldMilli: number;
  /** Suitability weights: fertility, freshwater, shoreline-within-water,
   *  logistics (supply quality to core), congestion (local density). */
  wFood: number;
  wWater: number;
  wShore: number;
  wLogi: number;
  wCong: number;
  /** Fraction of the growth budget that seeds satellites beyond the frontier. */
  dispersalRate: number;
  /** Max density (milliunits) deposited on one tile per deposit chunk. */
  densityStepMilli: number;
  /** Density a founded Core seeds on its tile (milliunits). */
  coreSeedMilli: number;
  /**
   * Real-world size of one tile, in km per edge (add-urban-core-growth). A
   * 20 km city sprawl is 20/tileKm ≈ 10 tiles across at the default 2. This
   * is the scaling lever: raise it for a coarser (bigger-per-tile) world,
   * lower it for finer. Used to report built areas in km² (tiles·tileKm²).
   */
  tileKm: number;
}

// Scarcity-first defaults (rework-tribal-scarcity): raw land sustains only
// ~15–20% of the base population cap (sqrt harvest), one good farm feeds
// ~3k people, and the starting stake covers ~2 farms. The opening arc —
// population starving down toward carrying capacity until farms come
// online — is intended. Balance evidence in
// openspec/changes/*/balance-notes.md; re-sweep with tests/perf/balance
// before changing anything here.
const FOOD_DEFAULTS: FoodConfig = {
  idleConsumptionMilli: 10,
  moveConsumptionMilli: 20,
  fightConsumptionMilli: 40,
  landHarvestMilli: 0,
  landHarvestExponent: 0.5,
  farmProductionMilli: 80,
  // Urban model (add-urban-core-growth): the city IS the population source,
  // so the floor and founding size are a village that grows — not a camp of
  // thousands the seed city cannot feed. popPerDensity supplies the rest.
  basePopulation: 100,
  startPopulation: 100,
  populationPerSettlement: 3_000, // legacy plot knob (unused by urban maxTroops)
  baseStorage: 5_000,
  storagePerBarn: 1_500,
  decayNumer: 1,
  decayDenom: 2000,
  capturedPlotRazeChance: 1.0,
  surplusForFullGrowth: 0.25,
  starvationDeathFraction: 0.02,
  settlementCost: 150,
  farmlandCost: 40,
  barnCost: 60,
  costGrowthPerOwned: 0.03,
  adjacencyBonus: 0.1,
  startingFood: 4_000,
  defaultPopulationShare: 0.7,
  supplyRadius: 18,
  supplyDecayPower: 3,
  supplyRefreshTicks: 10,
  warSupplyAttrition: 0.005,
  urbanGrowthRate: 0.15,
  // Balanced so a fully-built tile (density 1) feeds its own population: it
  // houses popPerDensity people eating popPerDensity·idleConsumption milli,
  // and produces ~cropN·urbanYieldMilli — cropN·urbanYield·share ≳ pop·idle.
  popPerDensity: 220,
  urbanYieldMilli: 6_000,
  wFood: 1.0,
  wWater: 0.8,
  wShore: 0.5,
  wLogi: 1.0,
  wCong: 1.8,
  dispersalRate: 0.05,
  densityStepMilli: 250,
  coreSeedMilli: 1000,
  tileKm: 2,
};

export class Config {
  private unitInfoCache = new Map<UnitType, UnitInfo>();
  constructor(
    private _gameConfig: GameConfig,
    private _userSettings: UserSettings | null,
    private _isReplay: boolean,
  ) {}

  isReplay(): boolean {
    return this._isReplay;
  }

  traitorDefenseDebuff(): number {
    return 0.5;
  }
  traitorSpeedDebuff(): number {
    return 0.8;
  }
  traitorDuration(): number {
    return 30 * 10; // 30 seconds
  }

  // Doomsday Clock config, resolved against defaults. One read per tick.
  doomsdayClockConfig(): typeof DOOMSDAY_CLOCK_DEFAULTS {
    const c = this._gameConfig.doomsdayClock;
    const d = DOOMSDAY_CLOCK_DEFAULTS;
    return {
      enabled: c?.enabled ?? d.enabled,
      speed: c?.speed ?? d.speed,
      // Drain/warn tuning is internal (not wire-configurable): always defaults.
      warnSeconds: d.warnSeconds,
      drainStartPercent: d.drainStartPercent,
      drainMaxPercent: d.drainMaxPercent,
      drainRampSeconds: d.drainRampSeconds,
    };
  }
  spawnImmunityDuration(): Tick {
    return (
      this._gameConfig.spawnImmunityDuration ?? DEFAULT_SPAWN_IMMUNITY_TICKS
    );
  }
  nationSpawnImmunityDuration(): Tick {
    return DEFAULT_SPAWN_IMMUNITY_TICKS;
  }
  hasExtendedSpawnImmunity(): boolean {
    return this.spawnImmunityDuration() > DEFAULT_SPAWN_IMMUNITY_TICKS;
  }

  gameConfig(): GameConfig {
    return this._gameConfig;
  }

  userSettings(): UserSettings {
    if (this._userSettings === null) {
      throw new Error("userSettings is null");
    }
    return this._userSettings;
  }

  cityTroopIncrease(): number {
    return 250_000;
  }

  falloutDefenseModifier(falloutRatio: number): number {
    // falloutRatio is between 0 and 1
    // So defense modifier is between [5, 2.5]
    return 5 - falloutRatio * 2;
  }
  msPerTick(): number {
    return 100;
  }
  SAMCooldown(): number {
    return 90;
  }
  SiloCooldown(): number {
    return 90;
  }

  defensePostRange(): number {
    return 30;
  }

  defensePostDefenseBonus(): number {
    return 5;
  }

  defensePostSpeedBonus(): number {
    return 3;
  }

  playerTeams(): TeamCountConfig {
    return this._gameConfig.playerTeams ?? 0;
  }

  spawnNations(): boolean {
    return this._gameConfig.nations !== "disabled";
  }

  isUnitDisabled(unitType: UnitType): boolean {
    return this._gameConfig.disabledUnits?.includes(unitType) ?? false;
  }

  bots(): number {
    return this._gameConfig.bots;
  }
  instantBuild(): boolean {
    return this._gameConfig.instantBuild;
  }
  disableNavMesh(): boolean {
    return this._gameConfig.disableNavMesh ?? false;
  }
  disableAlliances(): boolean {
    return this._gameConfig.disableAlliances ?? false;
  }
  waterNukes(): boolean {
    return this._gameConfig.waterNukes ?? false;
  }
  isRandomSpawn(): boolean {
    return this._gameConfig.randomSpawn;
  }
  infiniteGold(): boolean {
    return this._gameConfig.infiniteGold;
  }
  donateGold(): boolean {
    return this._gameConfig.donateGold;
  }
  infiniteTroops(): boolean {
    return this._gameConfig.infiniteTroops;
  }
  donateTroops(): boolean {
    return this._gameConfig.donateTroops;
  }
  goldMultiplier(): number {
    return this._gameConfig.goldMultiplier ?? 1;
  }
  startingGold(playerInfo: PlayerInfo): Gold {
    if (playerInfo.playerType === PlayerType.Bot) {
      return 0n;
    }
    return this.startingGoldFor(playerInfo);
  }

  trainSpawnRate(numPlayerFactories: number): number {
    // hyperbolic decay, midpoint at 10 factories
    // expected number of trains = numPlayerFactories  / trainSpawnRate(numPlayerFactories)
    return (numPlayerFactories + 10) * 15;
  }
  trainGold(
    rel: "self" | "team" | "ally" | "other",
    citiesVisited: number,
    player: EconomyPlayer,
  ): Gold {
    // No penalty for the first 10 cities.
    citiesVisited = Math.max(0, citiesVisited - 9);
    let baseGold: number;
    switch (rel) {
      case "ally":
        baseGold = 35_000;
        break;
      case "team":
      case "other":
        baseGold = 25_000;
        break;
      case "self":
        baseGold = 10_000;
        break;
    }
    const distPenalty = citiesVisited * 5_000;
    const gold = Math.max(5000, baseGold - distPenalty);
    return toInt(gold * this.goldMultiplierFor(player));
  }

  trainStationMinRange(): number {
    return 15;
  }
  trainStationMaxRange(): number {
    return 110;
  }
  railroadMaxSize(): number {
    return this.trainStationMaxRange() * 1.4142;
  }

  tradeShipGold(dist: number, player: EconomyPlayer): Gold {
    // Sigmoid: concave start, sharp S-curve middle, linear end - heavily punishes trades under range debuff.
    const debuff = this.tradeShipShortRangeDebuff();
    const baseGold =
      75_000 / (1 + Math.exp(-0.03 * (dist - debuff))) + 50 * dist;
    return BigInt(Math.floor(baseGold * this.goldMultiplierFor(player)));
  }

  // Probability of trade ship spawn = 1 / tradeShipSpawnRate
  tradeShipSpawnRate(
    tradeShipSpawnRejections: number,
    numTradeShips: number,
  ): number {
    const decayRate = Math.LN2 / 50;

    // Approaches 0 as numTradeShips increase
    const baseSpawnRate = 1 - sigmoid(numTradeShips, decayRate, 400);

    // Pity timer: increases spawn chance after consecutive rejections
    const rejectionModifier = 1 / (tradeShipSpawnRejections + 1);

    return Math.floor((100 * rejectionModifier) / baseSpawnRate);
  }

  unitInfo(type: UnitType): UnitInfo {
    const cached = this.unitInfoCache.get(type);
    if (cached !== undefined) {
      return cached;
    }

    let info: UnitInfo;
    switch (type) {
      case UnitType.TransportShip:
        info = {
          cost: () => 0n,
        };
        break;
      case UnitType.Warship:
        info = {
          cost: this.costWrapper(
            (numUnits: number) => Math.min(1_000_000, (numUnits + 1) * 250_000),
            UnitType.Warship,
          ),
          maxHealth: 1000,
        };
        break;
      case UnitType.Shell:
        info = {
          cost: () => 0n,
          damage: 250,
        };
        break;
      case UnitType.SAMMissile:
        info = {
          cost: () => 0n,
        };
        break;
      case UnitType.Port:
        info = {
          cost: this.costWrapper(
            (numUnits: number) =>
              Math.min(1_000_000, Math.pow(2, numUnits) * 125_000),
            UnitType.Port,
            UnitType.Factory,
          ),
          constructionDuration: this.instantBuild() ? 0 : 5 * 10,
          upgradable: true,
        };
        break;
      case UnitType.AtomBomb:
        info = {
          cost: this.costWrapper(() => 750_000, UnitType.AtomBomb),
        };
        break;
      case UnitType.HydrogenBomb:
        info = {
          cost: this.costWrapper(() => 5_000_000, UnitType.HydrogenBomb),
        };
        break;
      case UnitType.MIRV:
        info = {
          cost: (game: Game, player: Player) => {
            if (
              player.type() === PlayerType.Human &&
              this.hasInfiniteGoldFor(player)
            ) {
              return 0n;
            }
            return 25_000_000n + game.stats().numMirvsLaunched() * 15_000_000n;
          },
        };
        break;
      case UnitType.MIRVWarhead:
        info = {
          cost: () => 0n,
        };
        break;
      case UnitType.TradeShip:
        info = {
          cost: () => 0n,
        };
        break;
      case UnitType.MissileSilo:
        info = {
          cost: this.costWrapper(() => 1_000_000, UnitType.MissileSilo),
          constructionDuration: this.instantBuild() ? 0 : 10 * 10,
          upgradable: true,
        };
        break;
      case UnitType.DefensePost:
        info = {
          cost: this.costWrapper(
            (numUnits: number) => Math.min(250_000, (numUnits + 1) * 50_000),
            UnitType.DefensePost,
          ),
          constructionDuration: this.instantBuild() ? 0 : 5 * 10,
        };
        break;
      case UnitType.SAMLauncher:
        info = {
          cost: this.costWrapper(
            (numUnits: number) =>
              Math.min(3_000_000, (numUnits + 1) * 1_500_000),
            UnitType.SAMLauncher,
          ),
          constructionDuration: this.instantBuild()
            ? 0
            : SAM_CONSTRUCTION_TICKS,
          upgradable: true,
        };
        break;
      case UnitType.City:
        info = {
          cost: this.costWrapper(
            (numUnits: number) =>
              Math.min(1_000_000, Math.pow(2, numUnits) * 125_000),
            UnitType.City,
          ),
          constructionDuration: this.instantBuild() ? 0 : 2 * 10,
          upgradable: true,
        };
        break;
      case UnitType.Factory:
        info = {
          cost: this.costWrapper(
            (numUnits: number) =>
              Math.min(1_000_000, Math.pow(2, numUnits) * 125_000),
            UnitType.Factory,
            UnitType.Port,
          ),
          constructionDuration: this.instantBuild() ? 0 : 2 * 10,
          upgradable: true,
        };
        break;
      case UnitType.Train:
        info = {
          cost: () => 0n,
        };
        break;
      case UnitType.Settlement:
        info = {
          cost: this.foodCostWrapper(
            () => this.food().settlementCost,
            UnitType.Settlement,
          ),
          costResource: "food",
          // NOT upgradable: plots multiply, they don't level. An upgradable
          // tribal plot lets buildableUnits hijack a nearby build click into
          // an instant, invisible level-up — the "built but nothing
          // rendered, stats jumped" bug.
        };
        break;
      case UnitType.Farmland:
        info = {
          cost: this.foodCostWrapper(
            () => this.food().farmlandCost,
            UnitType.Farmland,
          ),
          costResource: "food",
        };
        break;
      case UnitType.Barn:
        info = {
          cost: this.foodCostWrapper(() => this.food().barnCost, UnitType.Barn),
          costResource: "food",
          // NOT upgradable — see Settlement.
        };
        break;
      default:
        assertNever(type);
    }

    this.unitInfoCache.set(type, info);
    return info;
  }

  /**
   * Plot food cost: base × (1 + owned × costGrowthPerOwned), with the same
   * owned-counting convention as the gold costWrapper. Gentle growth — an
   * empire is painted from dozens of cheap plots; storage capacity remains
   * the gate for saving up large batches.
   */
  private foodCostWrapper(
    baseFn: () => number,
    type: UnitType,
  ): (g: Game, p: Player) => bigint {
    return (_game: Game, player: Player) => {
      const owned = Math.min(
        player.unitsOwned(type),
        player.unitsConstructed(type),
      );
      return BigInt(
        Math.ceil(baseFn() * (1 + owned * this.food().costGrowthPerOwned)),
      );
    };
  }

  private hasInfiniteGoldFor(player: EconomyPlayer): boolean {
    if (this.infiniteGold()) return true;
    const hc = this._gameConfig.hostCheats;
    return (hc?.infiniteGold ?? false) && player.isLobbyCreator();
  }

  private hasInfiniteTroopsFor(player: EconomyPlayer): boolean {
    if (this.infiniteTroops()) return true;
    return (
      (this._gameConfig.hostCheats?.infiniteTroops ?? false) &&
      player.isLobbyCreator()
    );
  }

  private hasInfiniteTroopsForInfo(playerInfo: PlayerInfo): boolean {
    if (this.infiniteTroops()) return true;
    return (
      (this._gameConfig.hostCheats?.infiniteTroops ?? false) &&
      playerInfo.isLobbyCreator
    );
  }

  private goldMultiplierFor(player: EconomyPlayer): number {
    const base = this.goldMultiplier();
    const hc = this._gameConfig.hostCheats;
    if (hc?.goldMultiplier && player.isLobbyCreator()) {
      return hc.goldMultiplier;
    }
    return base;
  }

  public conquerGoldAmount(captured: Player): Gold {
    if (
      captured.type() === PlayerType.Bot ||
      captured.type() === PlayerType.Nation
    ) {
      return captured.gold();
    } else {
      return captured.gold() / 2n;
    }
  }

  private startingGoldFor(playerInfo: PlayerInfo): Gold {
    const base = BigInt(this._gameConfig.startingGold ?? 0);
    const hc = this._gameConfig.hostCheats;
    if (hc?.startingGold && playerInfo.isLobbyCreator) {
      return base + BigInt(hc.startingGold);
    }
    return base;
  }

  private costWrapper(
    costFn: (units: number) => number,
    ...types: UnitType[]
  ): (g: Game, p: Player) => bigint {
    return (game: Game, player: Player) => {
      if (
        player.type() === PlayerType.Human &&
        this.hasInfiniteGoldFor(player)
      ) {
        return 0n;
      }
      const numUnits = types.reduce(
        (acc, type) =>
          acc +
          Math.min(player.unitsOwned(type), player.unitsConstructed(type)),
        0,
      );
      return BigInt(costFn(numUnits));
    };
  }

  defaultDonationAmount(sender: Player): number {
    return Math.floor(sender.troops() / 3);
  }
  donateCooldown(): Tick {
    return 10 * 10;
  }
  embargoAllCooldown(): Tick {
    return 10 * 10;
  }
  deletionMarkDuration(): Tick {
    return 30 * 10;
  }

  deleteUnitCooldown(): Tick {
    return 30 * 10;
  }
  emojiMessageDuration(): Tick {
    return 5 * 10;
  }
  emojiMessageCooldown(): Tick {
    return 5 * 10;
  }
  quickChatCooldown(): Tick {
    return 3 * 10;
  }
  targetDuration(): Tick {
    return 10 * 10;
  }
  targetCooldown(): Tick {
    return 15 * 10;
  }
  allianceRequestDuration(): Tick {
    return 20 * 10;
  }
  allianceRequestCooldown(): Tick {
    return 30 * 10;
  }
  allianceDuration(): Tick {
    return 300 * 10; // 5 minutes.
  }
  temporaryEmbargoDuration(): Tick {
    return 300 * 10; // 5 minutes.
  }
  minDistanceBetweenPlayers(): number {
    return 30;
  }

  percentageTilesOwnedToWin(): number {
    if (this._gameConfig.gameMode === GameMode.Team) {
      return 95;
    }
    return 80;
  }
  armyLimitWarningThreshold(): number {
    return 0.8;
  }
  boatMaxNumber(): number {
    if (this.isUnitDisabled(UnitType.TransportShip)) {
      return 0;
    }
    return 3;
  }
  numSpawnPhaseTurns(): number {
    if (this._gameConfig.gameType === GameType.Singleplayer) {
      return 100;
    }
    if (this.isRandomSpawn()) {
      return 150;
    }
    return 300;
  }
  numBots(): number {
    return this.bots();
  }

  attackLogic(
    gm: Game,
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    tileToConquer: TileRef,
  ): {
    attackerTroopLoss: number;
    defenderTroopLoss: number;
    tilesPerTickUsed: number;
  } {
    let mag;
    let speed;
    const type = gm.terrainType(tileToConquer);
    switch (type) {
      case TerrainType.Plains:
        mag = 80;
        speed = 16.5;
        break;
      case TerrainType.Highland:
        mag = 100;
        speed = 20;
        break;
      case TerrainType.Mountain:
        mag = 120;
        speed = 25;
        break;
      case TerrainType.Impassable:
        throw new Error(`impassable terrain cannot be attacked`);
      default:
        throw new Error(`terrain type ${type} not supported`);
    }
    if (defender.isPlayer()) {
      for (const dp of gm.nearbyUnits(
        tileToConquer,
        gm.config().defensePostRange(),
        UnitType.DefensePost,
      )) {
        if (dp.unit.owner() === defender) {
          mag *= this.defensePostDefenseBonus();
          speed *= this.defensePostSpeedBonus();
          break;
        }
      }
    }

    if (gm.hasFallout(tileToConquer)) {
      const falloutRatio = gm.numTilesWithFallout() / gm.numLandTiles();
      mag *= this.falloutDefenseModifier(falloutRatio);
      speed *= this.falloutDefenseModifier(falloutRatio);
    }

    if (attacker.isPlayer() && defender.isPlayer()) {
      if (defender.isDisconnected() && attacker.isOnSameTeam(defender)) {
        // No troop loss if defender is disconnected and on same team
        mag = 0;
      }
      if (
        (attacker.type() === PlayerType.Human ||
          attacker.type() === PlayerType.Nation) &&
        defender.type() === PlayerType.Bot
      ) {
        mag *= 0.7;
      }
    }

    if (defender.isPlayer()) {
      const defenseSig =
        1 -
        sigmoid(
          defender.numTilesOwned(),
          DEFENSE_DEBUFF_DECAY_RATE,
          DEFENSE_DEBUFF_MIDPOINT,
        );

      const largeDefenderSpeedDebuff = 0.7 + 0.3 * defenseSig;
      const largeDefenderAttackDebuff = 0.7 + 0.3 * defenseSig;

      let largeAttackBonus = 1;
      if (attacker.numTilesOwned() > 100_000) {
        largeAttackBonus = Math.sqrt(100_000 / attacker.numTilesOwned()) ** 0.7;
      }
      let largeAttackerSpeedBonus = 1;
      if (attacker.numTilesOwned() > 100_000) {
        largeAttackerSpeedBonus = (100_000 / attacker.numTilesOwned()) ** 0.6;
      }

      // Guard the divide: a defender can transiently report 0 tiles (e.g. a
      // failed/re-rolled spawn) while an attack against it is still live —
      // Infinity here NaN-poisons the attack and crashes removeTroops.
      const defenderTroopLoss =
        defender.troops() / Math.max(1, defender.numTilesOwned());
      const traitorMod = defender.isTraitor() ? this.traitorDefenseDebuff() : 1;
      const currentAttackerLoss =
        within(defender.troops() / attackTroops, 0.6, 2) *
        mag *
        0.8 *
        largeDefenderAttackDebuff *
        largeAttackBonus *
        traitorMod;
      const altAttackerLoss =
        1.3 * defenderTroopLoss * (mag / 100) * traitorMod;
      const attackerTroopLoss =
        0.6 * currentAttackerLoss + 0.4 * altAttackerLoss;

      return {
        attackerTroopLoss,
        defenderTroopLoss,
        tilesPerTickUsed:
          within(defender.troops() / (5 * attackTroops), 0.2, 1.5) *
          speed *
          largeDefenderSpeedDebuff *
          largeAttackerSpeedBonus *
          (defender.isTraitor() ? this.traitorSpeedDebuff() : 1),
      };
    } else {
      return {
        attackerTroopLoss:
          attacker.type() === PlayerType.Bot ? mag / 10 : mag / 5,
        defenderTroopLoss: 0,
        tilesPerTickUsed: within(
          (2000 * Math.max(10, speed)) / attackTroops,
          5,
          100,
        ),
      };
    }
  }

  attackTilesPerTick(
    attackTroops: number,
    attacker: Player,
    defender: Player | TerraNullius,
    numAdjacentTilesWithEnemy: number,
  ): number {
    if (defender.isPlayer()) {
      return (
        within(((5 * attackTroops) / defender.troops()) * 2, 0.01, 0.5) *
        numAdjacentTilesWithEnemy *
        3
      );
    } else {
      return numAdjacentTilesWithEnemy * 2;
    }
  }

  boatAttackAmount(attacker: Player, defender: Player | TerraNullius): number {
    return Math.floor(attacker.troops() / 5);
  }

  warshipShellLifetime(): number {
    return 20; // in ticks (one tick is 100ms)
  }

  radiusPortSpawn() {
    return 20;
  }

  tradeShipShortRangeDebuff(): number {
    return 300;
  }

  proximityBonusPortsNb(totalPorts: number) {
    return within(totalPorts / 3, 4, totalPorts);
  }

  attackAmount(attacker: Player, defender: Player | TerraNullius) {
    if (attacker.type() === PlayerType.Bot) {
      return attacker.troops() / 20;
    } else {
      return attacker.troops() / 5;
    }
  }

  startManpower(playerInfo: PlayerInfo): number {
    if (playerInfo.playerType === PlayerType.Bot) {
      return 10_000;
    }
    if (playerInfo.playerType === PlayerType.Nation) {
      switch (this._gameConfig.difficulty) {
        case Difficulty.Easy:
          return 12_500;
        case Difficulty.Medium:
          return 18_750;
        case Difficulty.Hard:
          return 25_000; // Like humans
        case Difficulty.Impossible:
          return 31_250;
        default:
          assertNever(this._gameConfig.difficulty);
      }
    }
    return this.hasInfiniteTroopsForInfo(playerInfo) ? 1_000_000 : 25_000;
  }

  food(): FoodConfig {
    return FOOD_DEFAULTS;
  }

  /** Convert a built area in tiles to km² using the tileKm scale. */
  urbanAreaKm2(areaTiles: number): number {
    const km = this.food().tileKm;
    return areaTiles * km * km;
  }

  maxTroops(player: EconomyPlayer): number {
    if (
      player.type() === PlayerType.Human &&
      this.hasInfiniteTroopsFor(player)
    ) {
      return 1_000_000_000;
    }
    if (player.hasFoodEconomy()) {
      // Layered maps (add-urban-core-growth): carrying capacity is the built
      // urban area — the self-growing density field — not territory. A bigger
      // city houses more people; conquered-but-unbuilt land grants nothing
      // until it urbanizes.
      const f = this.food();
      return f.basePopulation + player.urbanArea() * f.popPerDensity;
    }
    const maxTroops =
      2 * (Math.pow(player.numTilesOwned(), 0.6) * 1000 + 50000) +
      player
        .units(UnitType.City)
        .filter((u) => !u.isUnderConstruction())
        .map((city) => city.level())
        .reduce((a, b) => a + b, 0) *
        this.cityTroopIncrease();

    if (player.type() === PlayerType.Bot) {
      return maxTroops / 3;
    }

    if (player.type() === PlayerType.Human) {
      return maxTroops;
    }

    switch (this._gameConfig.difficulty) {
      case Difficulty.Easy:
        return maxTroops * 0.5;
      case Difficulty.Medium:
        return maxTroops * 0.75;
      case Difficulty.Hard:
        return maxTroops * 1; // Like humans
      case Difficulty.Impossible:
        return maxTroops * 1.25;
      default:
        assertNever(this._gameConfig.difficulty);
    }
  }

  troopIncreaseRate(player: EconomyPlayer): number {
    const max = this.maxTroops(player);

    let toAdd = 10 + Math.pow(player.troops(), 0.73) / 4;

    const ratio = 1 - player.troops() / max;
    toAdd *= ratio;

    if (player.type() === PlayerType.Bot) {
      toAdd *= 0.5;
    }

    if (player.type() === PlayerType.Nation) {
      switch (this._gameConfig.difficulty) {
        case Difficulty.Easy:
          toAdd *= 0.9;
          break;
        case Difficulty.Medium:
          toAdd *= 0.95;
          break;
        case Difficulty.Hard:
          toAdd *= 1; // Like humans
          break;
        case Difficulty.Impossible:
          toAdd *= 1.05;
          break;
        default:
          assertNever(this._gameConfig.difficulty);
      }
    }

    return Math.min(player.troops() + toAdd, max) - player.troops();
  }

  goldAdditionRate(player: EconomyPlayer): Gold {
    const multiplier = this.goldMultiplierFor(player);
    let baseRate: bigint;
    if (player.type() === PlayerType.Bot) {
      baseRate = 50n;
    } else {
      baseRate = 100n;
    }
    return BigInt(Math.floor(Number(baseRate) * multiplier));
  }

  nukeMagnitudes(unitType: UnitType): NukeMagnitude {
    switch (unitType) {
      case UnitType.MIRVWarhead:
        return { inner: 12, outer: 18 };
      case UnitType.AtomBomb:
        return { inner: 12, outer: 30 };
      case UnitType.HydrogenBomb:
        return { inner: 80, outer: 100 };
    }
    throw new Error(`Unknown nuke type: ${unitType}`);
  }

  nukeAllianceBreakThreshold(): number {
    return 100;
  }

  defaultNukeSpeed(): number {
    return 10;
  }

  defaultNukeTargetableRange(): number {
    return 150;
  }

  defaultSamRange(): number {
    return 70;
  }

  samRange(level: number): number {
    // rational growth function (level 1 = 70, level 5 just above hydro range, asymptotically approaches 150)
    return this.maxSamRange() - 480 / (level + 5);
  }

  maxSamRange(): number {
    return 150;
  }

  defaultSamMissileSpeed(): number {
    return 12;
  }

  // Humans can be soldiers, soldiers attacking, soldiers in boat etc.
  nukeDeathFactor(
    nukeType: NukeType,
    humans: number,
    tilesOwned: number,
    maxTroops: number,
  ): number {
    if (nukeType !== UnitType.MIRVWarhead) {
      return (5 * humans) / Math.max(1, tilesOwned);
    }
    const targetTroops = 0.03 * maxTroops;
    const excessTroops = Math.max(0, humans - targetTroops);
    const scalingFactor = 500;

    const steepness = 2;
    const normalizedExcess = excessTroops / maxTroops;
    return scalingFactor * (1 - Math.exp(-steepness * normalizedExcess));
  }

  structureMinDist(): number {
    return 15;
  }

  shellLifetime(): number {
    return 50;
  }

  warshipPatrolRange(): number {
    return 100;
  }

  warshipTargettingRange(): number {
    return 130;
  }

  warshipShellAttackRate(): number {
    return 20;
  }

  warshipDockingRange(): number {
    return 5;
  }

  warshipPortHealingBonusPerLevel(): number {
    return 5;
  }

  /** Health at or below which a warship retreats to repair, as a percent of its
   *  (veterancy-adjusted) max health, so the threshold scales with max health. */
  warshipRetreatHealthPercent(): number {
    return 75;
  }

  warshipPassiveHealing(): number {
    return 1;
  }

  warshipPassiveHealingRange(): number {
    return 150;
  }

  warshipPortSwitchThreshold(): number {
    return 0.75;
  }

  // --- Warship veterancy ---

  /** Maximum veterancy level a warship can reach. */
  warshipMaxVeterancy(): number {
    return 3;
  }

  /** Max-health boost per veterancy level, as an integer percent of base max
   *  health. Integer-only to keep src/core deterministic (no float constants). */
  warshipVeterancyHealthBonus(): number {
    return 20;
  }

  /** Shell-damage boost per veterancy level, as an integer percent of the
   *  rolled damage. Integer-only to keep src/core deterministic. */
  warshipVeterancyShellDamageBonus(): number {
    return 20;
  }

  /** Transport ships a warship must destroy to gain one veterancy level. */
  warshipVeterancyTransportKills(): number {
    return 10;
  }

  /** Trade ships a warship must capture to gain one veterancy level. */
  warshipVeterancyTradeCaptures(): number {
    return 25;
  }

  defensePostShellAttackRate(): number {
    return 100;
  }

  safeFromPiratesCooldownMax(): number {
    return 20;
  }

  defensePostTargettingRange(): number {
    return 75;
  }

  allianceExtensionPromptOffset(): number {
    return 300; // 30 seconds before expiration
  }
}
