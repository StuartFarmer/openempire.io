/**
 * KnobHelp — plain-language descriptions for the food-economy tuning knobs
 * shown in the #shell climate popover's "game mechanics" section. Each entry
 * says what the knob controls and, crucially, how raising or lowering it bends
 * the game — so the hover box beside a knob teaches the mechanic, not just its
 * name. Keyed by FoodConfig key; any key without an entry falls back to just
 * its default value in the tooltip.
 */
import type { FoodConfig } from "../../core/configuration/FoodConfig";

export interface KnobHelp {
  /** One-line "what this is / what it affects". */
  affects: string;
  /** What raising the knob does to play. */
  up: string;
  /** What lowering the knob does to play. */
  down: string;
}

export const KNOB_HELP: Partial<Record<keyof FoodConfig, KnobHelp>> = {
  // ── Consumption ──────────────────────────────────────────────────────
  idleConsumptionMilli: {
    affects: "Food each resting person eats per tick — your baseline upkeep.",
    up: "Everyone eats more; harder to bank surplus, lower sustainable population.",
    down: "Cheaper to feed; the same farms support a larger nation.",
  },
  moveConsumptionMilli: {
    affects: "Food a troop eats per tick while crossing water in a boat.",
    up: "Naval invasions cost more food; long amphibious campaigns bleed the chest.",
    down: "Cheap sea-borne troops; overseas expansion is nearly free.",
  },
  fightConsumptionMilli: {
    affects: "Food a troop eats per tick while in an active attack.",
    up: "Sustained wars drain food fast — favors short, decisive strikes.",
    down: "Armies can stay in the fight indefinitely at little cost.",
  },

  // ── Raw-land / legacy farm output ────────────────────────────────────
  landHarvestMilli: {
    affects:
      "Free food from raw, unfarmed land (default 0 — food comes from fields only).",
    up: "Territory alone feeds you — a land-grab economy where holding ground pays.",
    down: "At 0, empty land is worthless; you must build and grow farms to eat.",
  },
  landHarvestExponent: {
    affects:
      "How steeply raw-land harvest scales with fertility (only if land harvest > 0).",
    up: "Fertile land pays disproportionately; marginal land is nearly worthless.",
    down: "Flatter reward — poor land is almost as good as rich land.",
  },
  farmProductionMilli: {
    affects: "Legacy per-crop output of a Farmland structure.",
    up: "Farms yield more food per crop byte.",
    down: "Farms yield less; food is scarcer.",
  },

  // ── Population caps / start ──────────────────────────────────────────
  basePopulation: {
    affects: "Population-cap floor for a nation with no settlements.",
    up: "Even city-less nations stay sizable.",
    down: "Without cities a nation is tiny and fragile.",
  },
  startPopulation: {
    affects: "Population every player begins with.",
    up: "Bigger opening workforce and army; stronger early game.",
    down: "Fragile start — few troops, easy to overrun early.",
  },
  populationPerSettlement: {
    affects: "Legacy per-settlement cap (unused by the urban troop cap).",
    up: "No effect in the current urban model.",
    down: "No effect in the current urban model.",
  },

  // ── Storage & decay ──────────────────────────────────────────────────
  baseStorage: {
    affects: "Camp food-stock cap before districts grow real granaries.",
    up: "Bigger early buffer against shortfall — survive lean spells.",
    down: "Little buffer; a young nation must farm continuously or starve.",
  },
  decayNumer: {
    affects: "Numerator of stored-food rot per tick (with decayDenom).",
    up: "Food rots faster; you can't stockpile, war chests must be spent soon.",
    down: "Food keeps longer; hoarding a reserve becomes viable.",
  },
  decayDenom: {
    affects: "Denominator of stored-food rot per tick (with decayNumer).",
    up: "Slower decay; reserves last, stockpiling pays off.",
    down: "Faster decay; grain rots and campaigns need live farm income.",
  },
  startingFood: {
    affects: "Opening camp food — what you eat while the first field ramps.",
    up: "Longer runway before farms must carry you.",
    down: "Race to get farms online or starve out of the gate.",
  },
  fieldTileStorageMilli: {
    affects: "Granary capacity grown per stable, tilled field tile.",
    up: "Mature districts hold deep war chests; old land funds long wars.",
    down: "Little local storage; nations live hand-to-mouth.",
  },

  // ── Conquest / damage ────────────────────────────────────────────────
  capturedPlotRazeChance: {
    affects: "Chance a conquered plot is razed instead of captured intact.",
    up: "Conquest yields scorched land — no turnkey economy from blitzing.",
    down: "Capturing enemy land grabs their working farms whole.",
  },
  combatTileDamageMilli: {
    affects: "Battle damage added to a tile each time it is conquered.",
    up: "War scars land heavily; contested corridors stay barren and frozen.",
    down: "Fighting leaves little lasting damage; land bounces back.",
  },
  tileDamageHealMilli: {
    affects: "Battle damage a tile heals back per tick.",
    up: "Scars heal fast; land recovers soon after the front moves on.",
    down: "Scars linger; fought-over ground stays useless for a long time.",
  },

  // ── Front / combat shape ─────────────────────────────────────────────
  frontSeepFraction: {
    affects:
      "Fraction of a front tile's troops shared to neighbours each tick.",
    up: "Force re-averages fast; position matters less (toward one global pool).",
    down: "Rigid fronts — each stretch fights alone and can't be reinforced.",
  },
  frontReferenceWidth: {
    affects: "Front width at which an attack fights like the old global pool.",
    up: "Wider fronts needed for full strength; concentration matters less.",
    down: "Concentration rewarded harder; narrow attacks punch above their weight.",
  },

  // ── Tenure / city stability ──────────────────────────────────────────
  tenureCapMultMax: {
    affects: "Density multiplier an old, stable city core reaches at plateau.",
    up: "Aged cores become megacities, holding far more people per tile.",
    down: "Age gives little density bonus; cities stay thin.",
  },
  tenureHalfTicks: {
    affects: "Ticks of demand-gated aging to reach half the stability plateau.",
    up: "Cities take much longer to mature into dense cores.",
    down: "Cities mature into dense cores quickly.",
  },
  tenureSaturationRatio: {
    affects:
      "Housing-fill fraction a city must hit before it ages (gains tenure).",
    up: "Only fully-packed cities gain stability.",
    down: "Cities mature even when only partly full.",
  },
  tenureDecayMilli: {
    affects: "Tenure lost per tick on a vacant tile (a setback, not a reset).",
    up: "Depopulation erodes a city's maturity faster.",
    down: "Cities keep their hard-won stability through setbacks.",
  },
  wNucleusTenure: {
    affects: "How much an aged capital core speeds its own urban growth.",
    up: "Old capitals snowball — they grow far faster than young cities.",
    down: "Capitals grow like any other city, no age bonus.",
  },

  // ── Settlement founding ladder ───────────────────────────────────────
  scalingExponent: {
    affects: "Area↔perimeter exponent shaping the founding-award ladder.",
    up: "Ladder rungs climb faster with size; awards thin out sooner.",
    down: "Awards keep coming as you grow.",
  },
  settlementLadderBasePop: {
    affects: "Peak population needed to earn your first settlement+farm pair.",
    up: "Harder to earn a new settlement; expansion is slow.",
    down: "Settlements founded easily; nations spread fast.",
  },
  settlementLadderTaper: {
    affects: "How fast founding awards thin out as a nation grows.",
    up: "Big nations must conquer for land instead of founding it.",
    down: "Even huge nations keep founding fresh settlements.",
  },

  // ── Farming labor & fields ───────────────────────────────────────────
  farmersPerFieldTile: {
    affects: "People needed to till one field tile.",
    up: "Fields need far more workers; small tidy plots, growth needs population.",
    down: "A sparse population can till sprawling fields.",
  },
  fieldTileYieldMilli: {
    affects: "Food per tick from one tilled tile (maturity × crop).",
    up: "Each tile feeds far more; small fields sustain whole cities.",
    down: "You need sprawling fields to feed anyone.",
  },
  fieldClaimMilli: {
    affects: "Maturity at which a spreading field tile is claimed as owned.",
    up: "Tiles claimed late; a passing front won't land-grab farmland.",
    down: "Tiles claimed early; ripening fields lock in ground fast.",
  },
  fieldPatchCostMilli: {
    affects: "Growth credit needed to place one new field plot.",
    up: "Fields expand slowly, one plot at a time.",
    down: "Fields spread quickly across the countryside.",
  },
  fieldPatchDriveCapMilli: {
    affects: "Cap on the per-tick expansion credit a field can accrue.",
    up: "Big fields expand faster.",
    down: "Even huge fields add plots slowly, at a readable cadence.",
  },
  wFieldWater: {
    affects: "How strongly field expansion favors tiles near water.",
    up: "Fields hug rivers and lakes.",
    down: "Fields spread evenly regardless of water.",
  },

  // ── Farm maturation & climate ────────────────────────────────────────
  farmGrowthRate: {
    affects: "Base rate a Farmland ripens from seed toward full maturity.",
    up: "Farms mature fast; food comes online quickly.",
    down: "Slow ramp; a long, lean opening arc before farms pay off.",
  },
  farmSenesceRate: {
    affects: "How fast an over-mature farm declines to what its tile supports.",
    up: "Marginal farms shed excess maturity fast.",
    down: "Farms hold their peak yield longer.",
  },
  farmSeedMilli: {
    affects: "Maturity a freshly-built farm starts at.",
    up: "Farms start closer to ripe; faster first yield.",
    down: "Farms start near zero and must ripen from scratch.",
  },
  tempBaseN: {
    affects: "Coldest temperature at which crops begin to grow (normalized).",
    up: "Cold land becomes unfarmable; the growable band narrows.",
    down: "Crops tolerate colder ground; more land is farmable.",
  },
  tempOptLoN: {
    affects: "Lower edge of the ideal crop-temperature band.",
    up: "Ideal band shrinks from the cool side; cooler land underperforms.",
    down: "Cooler land counts as ideal; wider comfort zone.",
  },
  tempOptHiN: {
    affects: "Upper edge of the ideal crop-temperature band.",
    up: "Warmer land counts as ideal; wider comfort zone.",
    down: "Ideal band shrinks from the warm side; hot land underperforms.",
  },
  tempMaxN: {
    affects:
      "Hottest temperature crops tolerate before heat stress kills yield.",
    up: "Crops survive hotter ground; tropics stay productive.",
    down: "Heat stress bites sooner; hot land becomes unfarmable.",
  },
  waterWiltN: {
    affects: "Moisture level below which crops wilt and yield nothing.",
    up: "Crops need more moisture; dry land goes barren.",
    down: "Crops tolerate drought; arid land stays farmable.",
  },
  waterFullN: {
    affects: "Moisture level needed for full crop yield.",
    up: "More water required to hit full yield; dry-ish land underperforms.",
    down: "Modest moisture reaches full yield; water rarely limits crops.",
  },
  humidityWeight: {
    affects: "Blend of rainfall vs surface water in the crop moisture signal.",
    up: "Rainfall dominates; river/lake proximity matters less.",
    down: "Freshwater proximity dominates; farms cluster on water.",
  },

  // ── Supply lines & war logistics ─────────────────────────────────────
  supplyRadius: {
    affects:
      "Distance from a settlement at which supply quality falls to half.",
    up: "Logistics reach far; armies stay supplied deep in the field.",
    down: "Tight supply; you must build settlements to project power.",
  },
  supplyDecayPower: {
    affects: "How sharply supply quality falls off with distance.",
    up: "A supply cliff — strong near settlements, useless just beyond.",
    down: "Gentle falloff; supply fades gradually with distance.",
  },
  supplyRefreshTicks: {
    affects: "How often the supply map is recomputed (staleness bound).",
    up: "Supply updates less often; slightly staler logistics.",
    down: "Supply recomputes more often; fresher, more responsive.",
  },
  warSupplyAttrition: {
    affects: "Troops lost per tick by an attack that is out of supply.",
    up: "Pushing beyond your reach bleeds armies fast; curbs snowballing.",
    down: "Armies can range far from home with no attrition.",
  },
  maxWarShare: {
    affects: "Max share of its living population an AI will deploy at once.",
    up: "AIs commit more people to war — aggressive but fragile.",
    down: "AIs keep more people home farming; cautious, resilient.",
  },

  // ── Urban growth ─────────────────────────────────────────────────────
  urbanGrowthRate: {
    affects:
      "Fraction of the gap to a city's food-supported size closed per tick.",
    up: "Cities race toward their carrying capacity.",
    down: "Slow, bounded city growth.",
  },
  popPerDensity: {
    affects: "People housed on one full city tile — the urban density.",
    up: "Coarser, denser cities (fewer tiles); higher troop cap per area.",
    down: "Finer, sprawling clusters spread over more tiles.",
  },
  wFood: {
    affects: "How strongly cities prefer to grow toward fertile land.",
    up: "Cities crowd onto the best farmland.",
    down: "Fertility matters less to where cities grow.",
  },
  wWater: {
    affects: "How strongly cities prefer to grow toward freshwater.",
    up: "Cities hug rivers and lakes.",
    down: "Freshwater matters less to city placement.",
  },
  wShore: {
    affects: "How strongly cities prefer coastline.",
    up: "Cities favor the coast.",
    down: "Coast matters less; inland grows just as readily.",
  },
  wLogi: {
    affects: "How strongly cities prefer land well-supplied from the core.",
    up: "Cities grow toward the well-connected heartland.",
    down: "Logistics matters less; cities sprawl to the frontier.",
  },
  wCong: {
    affects: "Penalty on growing where local density is already high.",
    up: "Cities spread out to avoid crowding.",
    down: "Cities pile up densely on the best spots.",
  },

  // ── Demographics ─────────────────────────────────────────────────────
  avgLifespanTicks: {
    affects: "Average lifespan; sets the baseline death rate (1/lifespan).",
    up: "Slower turnover; populations are stabler but refill losses slowly.",
    down: "High churn; fast rebound but a fragile, volatile demography.",
  },
  baseBirthRate: {
    affects: "Births per person per tick when exactly fed (break-even).",
    up: "Populations refill fast toward food capacity — fuels expansion.",
    down: "Slow regrowth; every loss of people stings.",
  },
  birthSurplusCap: {
    affects: "Maximum birth-rate multiplier when food is abundant.",
    up: "Food-rich nations boom even harder.",
    down: "Surplus food gives little birth boost.",
  },
  minFedForLife: {
    affects: "Floor on the fed-ratio in the death calc (bounds starvation).",
    up: "Starvation kills faster and harder.",
    down: "Starving populations linger longer before dying off.",
  },

  // ── Food-shed ────────────────────────────────────────────────────────
  foodShedRadius: {
    affects: "How far a mature farm can feed nearby cities.",
    up: "Farms feed distant cities; fewer people stranded beyond a shed.",
    down: "Cities must sit close to farmland to grow.",
  },
  foodShedPower: {
    affects: "How sharply a farm's feeding potential falls off with distance.",
    up: "A sharp cliff — fed near the farm, nothing just past it.",
    down: "Gentle falloff; farms feed a broad area.",
  },
  wFoodShed: {
    affects: "Weight of nearby-farm food in a city's carrying capacity.",
    up: "Cities grow harder toward well-fed areas.",
    down: "Food proximity matters less to how big a city gets.",
  },
  tileKm: {
    affects: "Real-world size of one tile (km per edge) — reporting/scale.",
    up: "Each tile represents more land; reported areas grow.",
    down: "Finer scale; each tile is a smaller patch of ground.",
  },
};
