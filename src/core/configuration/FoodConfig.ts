/**
 * FoodConfig — the simplified economy's knob set (simplify-food-economy).
 * Lives in a dependency-free leaf module so Schemas.ts can import the
 * tuning-panel allowlist without a Config.ts ↔ Schemas.ts cycle.
 *
 * Every knob answers exactly one player-visible question (design.md D7).
 * Food flows are integer milliunits (1000 milli = 1 displayed food).
 */
export interface FoodConfig {
  // ── Fertility (tile-fertility spec) ────────────────────────────────────
  /** Optimal farming temperature on the normalized temperature plane —
   *  tempFit peaks at 1 here and falls off linearly. */
  fertilityTempOptN: number;
  /** Half-width of the temperature band: tempFit is 0 at |t − opt| ≥ width.
   *  Defaults chosen so tempFit(0.5) = 0.5 (the 0.5-at-average calibration). */
  fertilityTempWidthN: number;
  /** Multiplier on fertility at the point of farm production: 2 means a
   *  tile produces double what its baked fertility says. THE knob for how
   *  much terrain quality matters. */
  fertilityBonus: number;

  // ── Farms (farm-growth spec) ───────────────────────────────────────────
  /** Chebyshev radius of a Farmland's worked footprint (3 → 7×7 tiles).
   *  Also sets the spacing rule: no own farm within 2·radius. */
  farmRadius: number;
  /** Milli-food per tick of a farm whose whole footprint is owned land at
   *  fertility 1 (before fertilityBonus). */
  farmOutputMilli: number;

  // ── The seed ladder (restore-organic-growth, seed-ladder spec) ─────────
  /** Peak population that banks the FIRST founding pair (one Settlement
   *  seed + one Farmland seed). Rung n sits at base × growth^(n−1). */
  seedLadderBase: number;
  /** Rung multiplier: 2 → every next pair needs double the people. */
  seedLadderGrowth: number;

  // ── Granary (food-economy spec) ────────────────────────────────────────
  /** Food-stock cap with zero farms. */
  granaryBase: number;
  /** Extra cap per completed Farmland. */
  granaryPerFarm: number;

  // ── Population (food-economy spec) ─────────────────────────────────────
  /** Milli-food one person eats per tick (deployed troops eat the same). */
  idleConsumptionMilli: number;
  /** Logistic growth rate below target: Δ = rate·pop·(1 − pop/target). */
  popGrowthRate: number;
  /** Linear decline rate above target with an empty granary:
   *  Δ = −rate·(pop − target). Must exceed popGrowthRate — famine bites
   *  faster than recovery. */
  popDeclineRate: number;
  /** Population ceiling with zero city tiles. */
  housingBase: number;
  /** Farm-field growth pace: fraction of the remaining field grown per
   *  tick (min one tile per full pulse) — the production ramp
   *  (restore-organic-growth, farm-growth spec). */
  fieldGrowthRate: number;

  // ── The opening ────────────────────────────────────────────────────────
  /** Starting population for every player type. */
  startPopulation: number;
  /** The opening food stock (display units). */
  startingFood: number;

  // ── War (tribal-buildings + combat-terrain specs) ──────────────────────
  /** Chance a structure on conquered territory is razed instead of
   *  captured. Land itself is always immediately usable. */
  capturedPlotRazeChance: number;
  /** Base per-tile attacker-loss magnitude (vanilla plains ≈ 80,
   *  mountain ≈ 120; 90 sits between). */
  baseCombatMag: number;
  /** Base conquest speed (vanilla plains 16.5, mountain 25 — lower is
   *  faster; 18 sits near plains). */
  baseCombatSpeed: number;
  /** Slope strength: cost ×(1 + kSlope·climb), climb = uphill magnitude
   *  delta vs the attacker's adjacent owned tiles, normalized /31. */
  kSlope: number;
  /** Wetness strength: cost ×(1 + kWet·wetness), wetness = mean of the
   *  humidity and water planes. Dry land is a highway, rainforest a
   *  quagmire. */
  kWet: number;

  // ── City growth (restore-organic-growth, city-growth spec) ─────────────
  /** People housed per city tile: housing = housingBase + cityTiles ×
   *  popPerDensity. The city you see IS the troop ceiling. */
  popPerDensity: number;
  /** City growth pace: fraction of the current footprint added (or
   *  removed) per tick while demand-gated, min one tile
   *  (0 freezes city dynamics — inert test configs). */
  urbanGrowthRate: number;
}

// Baseline defaults (simplify-food-economy): swept via tests/perf/balance
// before retuning — see balance-notes.md in the change.
export const FOOD_DEFAULTS: FoodConfig = {
  // tempFit(0.5) = 1 − |0.5−0.65|/0.3 = 0.5 → all-mid inputs bake to 0.5.
  fertilityTempOptN: 0.65,
  fertilityTempWidthN: 0.3,
  fertilityBonus: 1,
  farmRadius: 3,
  // A perfect 49-tile farm yields 200 food/tick (feeds 20k); average land
  // (fertility 0.5) yields 100/tick — feeds 10k, five times the start pop.
  farmOutputMilli: 200_000,
  // Pairs at 4k, 8k, 16k, 32k… — "every next town costs double the people".
  seedLadderBase: 4_000,
  seedLadderGrowth: 2,
  granaryBase: 5_000,
  granaryPerFarm: 2_500,
  idleConsumptionMilli: 10,
  // War-era demography (swept 2026-07-20): fast enough that growth beats
  // per-tile conquest losses — at 0.005 no nation ever reached the first
  // ladder rung. Famine still bites 2.5× faster than recovery.
  popGrowthRate: 0.02,
  popDeclineRate: 0.05,
  housingBase: 2_000,
  // A field grows ~2% of its remaining tiles per tick: a 7×7 field fills in
  // roughly 20–30 s — watchable, not instant.
  fieldGrowthRate: 0.02,
  startPopulation: 2_000,
  startingFood: 4_000,
  capturedPlotRazeChance: 0.5,
  // With the continuous terrain factor averaging ~1.75 on generated maps,
  // 50/12 lands the EFFECTIVE cost near vanilla's 80–120 band (swept
  // 2026-07-20; 90/18 doubled vanilla and froze all expansion).
  baseCombatMag: 50,
  baseCombatSpeed: 12,
  kSlope: 1,
  kWet: 0.5,
  // 1000 people per painted tile: a 20k-person nation reads as ~20 tiles.
  popPerDensity: 1_000,
  urbanGrowthRate: 0.1,
};

/**
 * Every FoodConfig knob is a non-negative number — the allowlist for the
 * in-game tuning panel's `tune_food_config` intent (add-sim-tuning-panel).
 */
export const FOOD_TUNABLE_KEYS = Object.keys(FOOD_DEFAULTS) as [
  keyof FoodConfig,
  ...(keyof FoodConfig)[],
];
