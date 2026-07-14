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
  /** Built urban area (Σ density) — the carrying capacity. */
  urbanArea(): number;
  /** Extra housing from tile tenure (rework-settlement-ecology): old city
   *  tiles hold more people than young ones. */
  tenureCapacityBonus(): number;
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
 * Food flows are computed in
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
   * Starting population for every player type. Sized to what the spawn
   * starter kit's three farms feed — idling at spawn must not starve.
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
   * Combat damage (milli, 0..1000) added to a tile each time it is conquered
   * in an attack on another player (rework-settlement-ecology). Damaged
   * ground refuses plots and urban growth and freezes farm maturation until
   * fully healed; contested corridors accumulate toward 1000 (battle-worn).
   */
  combatTileDamageMilli: number;
  /** Damage healed per tile per tick (milli). Full heal from one hit takes
   *  combatTileDamageMilli / tileDamageHealMilli ticks. */
  tileDamageHealMilli: number;
  /**
   * Tile stability (rework-settlement-ecology): a demand-gated tenure clock.
   * A city tile ages (+1 tick of tenure) only while the city is pushing its
   * housing limit and the tile is fully healed; a farm ages only once settled
   * at its climate ceiling. Tenure feeds consumers through the saturating
   * curve g = tenure/(tenure + tenureHalfTicks) — steep early, plateau late,
   * so age never compounds without bound.
   */
  /** Density-cap multiplier at the tenure plateau: an old core holds up to
   *  this × popPerDensity people per tile (young tiles hold 1×). */
  tenureCapMultMax: number;
  /** Tenure (ticks) at which the curve reaches half its plateau. */
  tenureHalfTicks: number;
  /** The demand gate: city tiles age only while population ≥ this fraction
   *  of total housing (the city is pushing its limit). */
  tenureSaturationRatio: number;
  /** Tenure lost per tick (milli-ticks) on a VACANT tile — depopulation
   *  decays stability slowly (a setback), never resets it (a crater). */
  tenureDecayMilli: number;
  /** Nucleus gravity: urban growth pacing is scaled by
   *  1 + wNucleusTenure·g(core tenure) — old capitals grow faster. */
  wNucleusTenure: number;
  /**
   * Seed awards (rework-settlement-ecology): plots are awarded, never
   * purchased. Farm seeds accrue from PEAK TERRITORY (one per
   * farmSeedTilesPerSeed tiles at the high-water mark); Settlement seeds
   * from PEAK POPULATION on a power-law ladder — the nth settlement at
   * settlementLadderBasePop · n^scalingExponent. Ratchets never re-award.
   */
  /** Measured area↔perimeter exponent k in A ∝ P^k (balance harness,
   *  design.md §6). Verdantia 1.263 / pangea001 1.272, R²≈0.94 — real
   *  borders are ragged, far below the circle bound of 2. */
  scalingExponent: number;
  /** Peak population for the FIRST settlement; the nth costs ·n^k. */
  settlementLadderBasePop: number;
  /** One farm seed per this many peak-territory tiles. */
  farmSeedTilesPerSeed: number;
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
  /** People housed per full city tile — the urban density. City footprint =
   *  foodCapacity / popPerDensity, and maxTroops = base + urbanArea·popPerDensity. */
  popPerDensity: number;
  // ── Demographics (add-urban-core-growth): population is agents with an
  // average lifespan; food modulates births and deaths, and the city footprint
  // and survival follow the LIVING population. ─────────────────────────────
  /** Average lifespan in ticks — baseline death fraction is 1/avgLifespanTicks. */
  avgLifespanTicks: number;
  /** Base births per person per tick at food break-even (≈ 1/avgLifespanTicks
   *  so the population is stable when exactly fed, grows on surplus). */
  baseBirthRate: number;
  /** Max birth-rate multiplier at food surplus (2 → 2× births at ≥200% food). */
  birthSurplusCap: number;
  /** Floor on the fed-ratio in the death calc so full starvation is finite,
   *  not a divide-by-zero (0.05 → at ≤5% food the unfed die within ~1/base). */
  minFedForLife: number;
  /** Suitability weights: fertility, freshwater, shoreline-within-water,
   *  logistics (supply quality to core), congestion (local density). */
  wFood: number;
  wWater: number;
  wShore: number;
  wLogi: number;
  wCong: number;

  // ── Farm maturation (add-urban-core-growth, growth-model.md Part 1) ────
  /**
   * Gompertz base rate: a Farmland's maturity M∈[0,1] advances per tick by
   * farmGrowthRate · M·ln(1/M) · climateSuitability. A well-sited farm ripens
   * over tens of seconds; a marginal one crawls (McMaster & Wilhelm GDD ×
   * AquaCrop Ks × FAO soil, combined by Liebig's min).
   */
  farmGrowthRate: number;
  /**
   * Canopy-decline rate (AquaCrop CDC): when a farm's maturity exceeds what its
   * tile can support, it senesces toward suitability by farmSenesceRate·gap per
   * tick. Distinct from farmGrowthRate — decline does not stall at full
   * maturity the way the Gompertz growth slope does.
   */
  farmSenesceRate: number;
  /** Maturity a freshly-built Farmland starts at (milliunits) so the Gompertz
   *  slope M·ln(1/M) is non-zero and the field can begin ripening. */
  farmSeedMilli: number;
  /**
   * GDD temperature band on the normalised `temperature` layer (byte/255):
   * f_temp is 0 below tempBaseN, ramps to 1 across [tempOptLoN, tempOptHiN],
   * and plateaus then falls to 0 above tempMaxN (heat stress).
   */
  tempBaseN: number;
  tempOptLoN: number;
  tempOptHiN: number;
  tempMaxN: number;
  /**
   * AquaCrop water-stress thresholds on the blended moisture signal
   * (humidityWeight·humidity + (1−humidityWeight)·water, each byte/255):
   * f_water is 0 at/below waterWiltN (wilting), 1 at/above waterFullN, linear
   * between.
   */
  waterWiltN: number;
  waterFullN: number;
  humidityWeight: number;
  /** Milli-food per tick per (maturity · cropN · district) of each Farmland. */
  farmYieldMilli: number;

  // ── Food-shed (add-urban-core-growth, growth-model.md Part 2) ──────────
  /**
   * Soft-decay food-shed radius: a Farmland of maturity M projects
   * potential M·1/(1+(d/foodShedRadius)^foodShedPower) at owned-land step
   * distance d. Same curve family as the military supplyRadius, different
   * source (farms, maturity-weighted). Gates how fast a nearby Settlement
   * grows into a city.
   */
  foodShedRadius: number;
  foodShedPower: number;
  /** Weight of the food-shed potential in urban suitability / carrying K. */
  wFoodShed: number;
  /**
   * Real-world size of one tile, in km per edge (add-urban-core-growth).
   * Default 1 → one tile is 1 km² (a city block / neighbourhood), so a full
   * tile at popPerDensity people is a realistic urban density and a city is a
   * cluster of many tiles (granular enough for localized pushes). Used to
   * report built areas in km² (tiles·tileKm²).
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
  // A young nation — ~1 city tile at popPerDensity, sized near what the starter
  // farms feed so it grows from the start (rather than crashing then recovering).
  startPopulation: 2000,
  populationPerSettlement: 3_000, // legacy plot knob (unused by urban maxTroops)
  baseStorage: 5_000,
  storagePerBarn: 1_500,
  decayNumer: 1,
  decayDenom: 2000,
  capturedPlotRazeChance: 0.5,
  // One combat conquest scars a tile to 40%; at 4/tick it fully heals in
  // 100 ticks (~10 s) — repeated fighting stacks toward a long-lived scar.
  combatTileDamageMilli: 400,
  tileDamageHealMilli: 4,
  // Stability: an old core plateaus at 3× housing; half the plateau after
  // ~2 min (1200 ticks) of demand-gated aging. Vacancy decays 10× slower
  // than accrual; capitals up to 1.5× growth pace at full age.
  tenureCapMultMax: 3,
  tenureHalfTicks: 1200,
  tenureSaturationRatio: 0.9,
  tenureDecayMilli: 100,
  wNucleusTenure: 0.5,
  scalingExponent: 1.26, // measured 2026-07-14 (see design.md §6)
  settlementLadderBasePop: 10_000,
  farmSeedTilesPerSeed: 25,
  settlementCost: 150,
  farmlandCost: 40,
  barnCost: 60,
  costGrowthPerOwned: 0.03,
  adjacencyBonus: 0.1,
  startingFood: 4_000,
  defaultPopulationShare: 0.7,
  supplyRadius: 10,
  supplyDecayPower: 3,
  supplyRefreshTicks: 10,
  // A push far from your settlements bleeds: an out-of-supply attack loses ~5%
  // of its troops/tick, so exploring/expanding beyond your supply reach costs
  // real manpower (build settlements as you push). This attacker-side attrition
  // also curbs the strong from over-running the map — mean leader share ~40%
  // vs ~55%+ without it.
  warSupplyAttrition: 0.05,
  // Pace: each tick the city closes ~this fraction of the gap to its
  // food-supported target size (min one tile), so it grows over seconds, not
  // instantly — bounded growth, not a land-grab.
  urbanGrowthRate: 0.1,
  // People on a full city tile — the URBAN DENSITY. At tileKm=1 that's 1000
  // people/km² (a real town/suburb density), and a city is a cluster of many
  // tiles. Lower it for finer/denser clusters, raise it for coarser.
  popPerDensity: 10000,
  // Demographics: gentle old-age turnover (~6000-tick life), strong births when
  // food-rich (clamped to the food-supported population, so growth approaches
  // that ceiling and holds — never overshoots into mass starvation). Scarcity
  // accelerates deaths (halved food ⇒ halved lifespan) and cuts births.
  // One life ≈ 10 seconds (100 ticks at 10 ticks/s) — high turnover: ~1% of the
  // population dies and is (re)born each tick, so a nation is a constantly
  // churning demographic that lives or dies by its food.
  avgLifespanTicks: 100,
  // High so the population refills quickly toward its food capacity (the
  // headroom clamp prevents overshoot); this keeps up with troops spent
  // expanding territory. Effectively "how fast people fill the food they have".
  // NOTE: because troops are BOTH population and army (vanilla expansion still
  // spends them), a fast rate can fuel snowball — the real fix is the deferred
  // "troops for war only, territory by diffusion" pivot. Tunable in the sweep.
  baseBirthRate: 0.02,
  birthSurplusCap: 2,
  minFedForLife: 0.05,
  wFood: 1.0,
  wWater: 0.8,
  wShore: 0.5,
  wLogi: 1.0,
  wCong: 1.8,
  // Farm maturation: a well-sited farm (suitability≈1) climbs 0→~1 over
  // ~120–200 ticks (Gompertz slope peaks near M=1/e); marginal soil crawls.
  farmGrowthRate: 0.08,
  farmSenesceRate: 0.05,
  farmSeedMilli: 50,
  tempBaseN: 0.15,
  tempOptLoN: 0.45,
  tempOptHiN: 0.75,
  tempMaxN: 0.95,
  waterWiltN: 0.1,
  waterFullN: 0.55,
  humidityWeight: 0.5,
  // Sized so ONE mature farm on good soil feeds roughly ONE city tile
  // (per-farm capacity ≈ popPerDensity): a player who places a handful of
  // farms near a settlement sees it grow into a town, instead of needing the
  // hundreds of farms a bot auto-builds. City size stays food-bounded — this
  // only changes how many farms it takes to reach that bound.
  farmYieldMilli: 100_000,
  // Food-shed: a mature farm feeds cities within ~foodShedRadius tiles; the
  // radius is tighter than military supply so food logistics matter locally.
  foodShedRadius: 12,
  foodShedPower: 3,
  wFoodShed: 1.5,
  tileKm: 20,
};

/**
 * Per-difficulty AI levers (unify-layered-path). The vanilla game scaled
 * bot/nation strength through its maxTroops formula; the layered economy
 * scales three independent knobs instead: raw capacity, how often the AI
 * acts, and how well it chooses. Humans are never scaled.
 */
export interface AiDifficultySettings {
  /** Carrying-capacity multiplier applied in maxTroops (humans always 1). */
  populationMultiplier: number;
  /** Ticks between bot-tribe economy pulses (TribeExecution). */
  tribePulseTicks: number;
  /** Economy build attempts per nation structure pass. */
  nationBuildBudget: number;
  /**
   * Placement precision: the AI picks uniformly among the top-k scored
   * candidates (1 = always the argmax).
   */
  precisionTopK: number;
  /**
   * 0..1 scale on the attack-priority bonus for enemy Farmland/Settlement
   * tiles — how sharply the AI hunts your economy.
   */
  resourceFocus: number;
}

const AI_DIFFICULTY: Record<
  Difficulty,
  Omit<AiDifficultySettings, "populationMultiplier"> & {
    nationPopulationMultiplier: number;
    botPopulationMultiplier: number;
  }
> = {
  [Difficulty.Easy]: {
    nationPopulationMultiplier: 0.5,
    botPopulationMultiplier: 1 / 3,
    tribePulseTicks: 40,
    nationBuildBudget: 1,
    precisionTopK: 4,
    resourceFocus: 0.25,
  },
  [Difficulty.Medium]: {
    nationPopulationMultiplier: 0.75,
    botPopulationMultiplier: 1 / 3,
    tribePulseTicks: 30,
    nationBuildBudget: 2,
    precisionTopK: 3,
    resourceFocus: 0.5,
  },
  [Difficulty.Hard]: {
    nationPopulationMultiplier: 1,
    botPopulationMultiplier: 1 / 3,
    tribePulseTicks: 25,
    nationBuildBudget: 3,
    precisionTopK: 2,
    resourceFocus: 0.75,
  },
  [Difficulty.Impossible]: {
    nationPopulationMultiplier: 1.25,
    botPopulationMultiplier: 1 / 3,
    tribePulseTicks: 20,
    nationBuildBudget: 3,
    precisionTopK: 1,
    resourceFocus: 1,
  },
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
          // Awarded, not purchased (rework-settlement-ecology): placing one
          // consumes a banked Settlement seed (peak-population ladder) and
          // costs no food.
          cost: () => 0n,
          costResource: "food",
          // NOT upgradable: plots multiply, they don't level. An upgradable
          // tribal plot lets buildableUnits hijack a nearby build click into
          // an instant, invisible level-up — the "built but nothing
          // rendered, stats jumped" bug.
        };
        break;
      case UnitType.Farmland:
        info = {
          // Awarded from peak territory; costs no food (see Settlement).
          cost: () => 0n,
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

  food(): FoodConfig {
    return FOOD_DEFAULTS;
  }

  /** Per-difficulty AI levers; humans always get multiplier 1 / argmax. */
  aiDifficulty(type: PlayerType): AiDifficultySettings {
    const d = AI_DIFFICULTY[this._gameConfig.difficulty];
    const populationMultiplier =
      type === PlayerType.Human
        ? 1
        : type === PlayerType.Bot
          ? d.botPopulationMultiplier
          : d.nationPopulationMultiplier;
    return {
      populationMultiplier,
      tribePulseTicks: d.tribePulseTicks,
      nationBuildBudget: d.nationBuildBudget,
      precisionTopK: type === PlayerType.Human ? 1 : d.precisionTopK,
      resourceFocus: d.resourceFocus,
    };
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
    // Carrying capacity is the built urban area — the self-growing density
    // field — not territory (add-urban-core-growth). A bigger city houses
    // more people; conquered-but-unbuilt land grants nothing until it
    // urbanizes. AI capacity scales with difficulty (unify-layered-path);
    // humans are always at multiplier 1.
    const f = this.food();
    // Tenure bonus (rework-settlement-ecology): old city tiles house more
    // people than young ones, so a stable city outgrows its footprint.
    const capacity =
      f.basePopulation +
      player.urbanArea() * f.popPerDensity +
      player.tenureCapacityBonus();
    return capacity * this.aiDifficulty(player.type()).populationMultiplier;
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
