/**
 * FoodConfig — the food-economy knob set, its defaults, and the tuning-panel
 * key allowlist. Lives in a dependency-free leaf module so Schemas.ts can
 * import the allowlist without a Config.ts ↔ Schemas.ts cycle.
 */
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
  /** The CAMP stock cap (display food) — the aspatial stake a young nation
   *  eats while its first field ramps (task 4.2/4.3). District storage is
   *  grown from stable farmland (fieldTileStorageMilli), never built. */
  baseStorage: number;
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
   * Front cohesion (front-line-troops): the fraction of each front tile's
   * troops that is shared with its front-adjacent neighbours each tick. An
   * attack's troops live ON its front tiles, so without any sharing a stretch
   * that runs dry stays dry forever and a breakthrough cannot be reinforced.
   * 0 = a perfectly rigid front (each stretch fights alone); higher = the
   * force re-averages faster, and at 1 it collapses back toward the old
   * single-pool behaviour where position did not matter.
   */
  frontSeepFraction: number;
  /**
   * The front width (in tiles) at which a commitment fights exactly as it did
   * before front-line-troops. Combat compares the defender's WHOLE army
   * against the attacker's force, so feeding it a single tile's force would
   * pin every engagement at the cost ceiling and nothing would ever advance.
   * The tile's force is therefore scaled by this width: an attack spread over
   * exactly `frontReferenceWidth` tiles behaves identically to the old global
   * pool, a narrower one fights proportionally stronger per tile, a wider one
   * proportionally weaker. Lower = concentration is rewarded harder.
   */
  frontReferenceWidth: number;
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
   * purchased — one ladder, paired awards. The nth crossing of the PEAK
   * POPULATION ladder settlementLadderBasePop · n^scalingExponent banks a
   * founding pair (one Settlement seed + one farm seed). The ratchet never
   * re-awards; territory awards nothing (conquest buys room to spread).
   */
  /** Measured area↔perimeter exponent k in A ∝ P^k (balance harness,
   *  design.md §6). Verdantia 1.263 / pangea001 1.272, R²≈0.94 — real
   *  borders are ragged, far below the circle bound of 2. */
  scalingExponent: number;
  /** Peak population for the FIRST founding pair; the nth costs
   *  ·n^(k·taper). */
  settlementLadderBasePop: number;
  /** Ladder taper (>1): steepens the founding ladder past constant frontier
   *  effort so awards THIN OUT with size — big nations capture plots by
   *  conquest instead of founding them (playtest 2026-07-15). */
  settlementLadderTaper: number;
  /**
   * Labor coverage (rework-settlement-ecology §1b): a field's shed-cell pool
   * TILLS its claimed tiles at this many farmers each, best tiles first
   * (maturity rank). Covered tiles produce and age tenure; uncovered tiles
   * lie fallow and senesce toward reversion. The nucleus tile is always
   * staffed (bootstrap guard) — labor gates tilling, never growth rate,
   * and no separate yield multiplier exists.
   */
  farmersPerFieldTile: number;
  /** The opening camp stock (display food): what the young nation eats
   *  while its kit field ramps. Plots cost nothing — seeds are awarded. */
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
  /**
   * AI war restraint (rework-settlement-ecology task 10.6): the share of
   * the LIVING population an AI may have deployed at once (attacks +
   * boats). Troops ARE people — the idle pool is the farmers and parents
   * the nation rebuilds from — so the vanilla maxTroops-based reserves
   * (housing, not headcount) let a young bot dump its whole demography
   * into one push and never recover.
   *
   * This is an ABSOLUTE cap and is never suspended — not while under attack,
   * not for boats, not for any difficulty. It used to be lifted to Infinity
   * the moment a player had an incoming attack, which meant ATTACKING an AI
   * switched off its own safety limit: it would stack attack after attack
   * until its population was gone and then collapse. Troops are people, so
   * "fight with everything" is not a survival response, it is suicide.
   */
  maxWarShare: number;

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
  /** Milli-food per tick per (maturity · cropN) of each TILLED field tile
   *  (§1b) — yield is Σ over tilled tiles; the field's growth IS the
   *  production curve, so no district bonus and no labor multiplier. */
  fieldTileYieldMilli: number;

  // ── Field growth — the farm CA (rework-settlement-ecology §1b) ─────────
  /**
   * Local storage (rework-settlement-ecology task 4.3, replaces Barns): a
   * field's granary capacity is Σ over its TILLED tiles of
   * fieldTileStorageMilli · g(tenure) — storage is GROWN from stable
   * farmland, so an old district holds deep reserves and a fresh conquest
   * holds none. Local surplus banks here; local shortfall draws here first.
   */
  fieldTileStorageMilli: number;
  /**
   * Establishment (maturity milli) at/above which a spreading tile becomes a
   * CLAIMED field tile. Below it a tile is wild for precedence — either
   * automaton may take it — and a fallow tile senescing under the threshold
   * reverts to wild and loses its claim. Claimed tiles are also the SPREAD
   * SOURCES: a fresh nucleus ripens past the threshold before it seeds its
   * neighbors.
   */
  fieldClaimMilli: number;
  /**
   * Plot growth (revised 2026-07-15): a field grows one 1×1 tilled plot at
   * a time (every structure is single-tile; claimed tiles render with the
   * Farmland plot's tilled-soil pattern). Each nucleus accrues credit equal
   * to its field's summed TILLED maturity (milli) per tick — capped at
   * fieldPatchDriveCapMilli so big fields don't machine-gun plots — and at
   * fieldPatchCostMilli places ONE plot on a weighted-random frontier
   * tile, IF the field's residents have spare hands for one more tile.
   */
  fieldPatchCostMilli: number;
  fieldPatchDriveCapMilli: number;
  /** Water weight in the patch-anchor lottery: block weight = Σ suitability
   *  · (1 + wFieldWater·(waterN + wShore·shore)) — patches favor the river
   *  without racing along it. */
  wFieldWater: number;

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
export const FOOD_DEFAULTS: FoodConfig = {
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
  decayNumer: 1,
  decayDenom: 2000,
  capturedPlotRazeChance: 0.5,
  // One combat conquest scars a tile to 40%; at 4/tick it fully heals in
  // 100 ticks (~10 s) — repeated fighting stacks toward a long-lived scar.
  combatTileDamageMilli: 400,
  tileDamageHealMilli: 4,
  // Front cohesion: a tenth of each front tile's force shifts toward its
  // neighbours per tick — enough that a stalled stretch recovers over a few
  // seconds, slow enough that where you commit still decides what happens.
  frontSeepFraction: 0.1,
  frontReferenceWidth: 16,
  // Stability: an old core plateaus at 3× housing; half the plateau after
  // ~2 min (1200 ticks) of demand-gated aging. Vacancy decays 10× slower
  // than accrual; capitals up to 1.5× growth pace at full age.
  tenureCapMultMax: 3,
  tenureHalfTicks: 1200,
  tenureSaturationRatio: 0.9,
  tenureDecayMilli: 100,
  wNucleusTenure: 0.5,
  scalingExponent: 1.26, // measured 2026-07-14 (see design.md §6)
  // The first rung must sit INSIDE the spawn kit's reach: one kit field at
  // 200 farmers/tile is a ~10-tile village whose war-torn capacity tops out
  // near 4–9k (GrowthProbe 2026-07-15) — at the old 10k first rung no bot
  // nation ever banked a pair and the whole seed economy stayed inert.
  settlementLadderBasePop: 4_000,
  settlementLadderTaper: 2, // n^(1.26·2): pair 2 at ~23k, pair 3 at ~64k
  // 200 farmers till one tile: the spawn village (~2000 people) sustains a
  // ~10-tile field — small tidy plots; growth needs people (playtest:
  // fields took far too much space at 50).
  farmersPerFieldTile: 200,
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
  // At 0.35 a pop-5k bot fields ≤1750 across all fronts — real pushes,
  // while the majority stays home farming and breeding the next push.
  maxWarShare: 0.2,
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
  // Per TILLED TILE: one mature tile on good soil feeds ~2000 people, so a
  // small grown field (~5 tiles) feeds roughly one city tile (popPerDensity)
  // — the field's spread is the production ramp. The spawn nucleus alone
  // holds the start population at break-even: the opening arc (hold, then
  // grow as the field spreads) replaces the old 3-farm kit.
  fieldTileYieldMilli: 20_000,
  // Per tilled tile at the tenure plateau: ~500 food. A stable ~20-tile
  // district holds a real war chest (~10k food, ≈ two old Barns' worth);
  // young or captured fields hold nothing.
  fieldTileStorageMilli: 500_000,
  // Field CA: a spreading tile is claimed once establishment reaches 30% —
  // late enough that a passing front doesn't land-grab, early enough that a
  // ripening frontier locks in before the city CA wants the same ground.
  fieldClaimMilli: 300,
  // A lone ripe nucleus (≈1000 credit/tick) readies its first plot in
  // ~50 ticks (~5 s); the drive cap holds mature fields to one plot per
  // ~17 ticks — plots pop one by one at a readable cadence (playtest
  // 2026-07-15: the old per-tile diffusion flooded a circle in seconds).
  fieldPatchCostMilli: 50_000,
  fieldPatchDriveCapMilli: 3_000,
  wFieldWater: 0.8,
  // Food-shed: a mature farm feeds cities within ~foodShedRadius tiles.
  // Swept 2026-07-15: 18 (with fieldSpreadRateMilli 12) — wider reach means
  // fewer people stranded beyond every shed (the starving camp cohort).
  foodShedRadius: 18,
  foodShedPower: 3,
  wFoodShed: 1.5,
  tileKm: 20,
};

/**
 * Every FoodConfig knob is a non-negative number — the allowlist for the
 * in-game tuning panel's `tune_food_config` intent (add-sim-tuning-panel).
 */
export const FOOD_TUNABLE_KEYS = Object.keys(FOOD_DEFAULTS) as [
  keyof FoodConfig,
  ...(keyof FoodConfig)[],
];
