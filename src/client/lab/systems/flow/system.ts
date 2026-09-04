import { defineFieldSystem } from "../../../webgpu/FieldDynamics";

/**
 * The FLOW model, in isolation — LeanFront's economy as a cellular automaton.
 *
 * People are a field: they are born where people already are, die where they
 * stand, and migrate toward food and toward each other. Food is grown by whoever
 * is on the tile, carried toward the hungry, and lost if it is neither eaten nor
 * moved in time. Roads wear in where people walk.
 *
 * This exists as a lab page BEFORE it is wired into a game because the three
 * forces interact, and two failure modes are much easier to see here than inside
 * a full simulation:
 *
 *   - a strong town tether makes people pile into settlements and STARVE rather
 *     than walk to food, because attraction-to-food and attraction-to-people are
 *     competing terms in the same sum;
 *   - road reinforcement can collapse to a single trunk, or never form at all,
 *     depending on the wear/decay ratio.
 *
 * Scale is real, and every rate is derived from it: one tile is 10 km across
 * (100 km^2 = 10,000 hectares) and one tick is one day. So a birth rate is
 * births per person per day, migration of 1 tile/tick is 10 km/day, and the work
 * ceiling falls out of hectares-per-farmer rather than being chosen.
 */
export const flow = defineFieldSystem({
  id: "flow",
  name: "Flow (economy CA)",
  description: "People and food as fluids; roads worn in by traffic.",
  kind: "game",
  defaultMap: "Verdantia",
  defaultView: "flow",

  params: {
    // ── SCALE. One tile is 10 km across (100 km^2 = 10,000 ha) and one tick is
    // one WEEK, so a 10,000-tick game is 192 years. Every rate below is stated
    // PER YEAR and divided by this in the shaders — partly so the numbers are
    // derivable, and partly because per-tick rates are unreadable: a birth rate
    // of 0.00077/week displays as "0.00" on a slider and cannot be tuned.
    ticksPerYear: { value: 52, min: 1, max: 365, step: 1 },
    hectaresPerTile: { value: 10000, min: 100, max: 1000000 },
    /** Pre-modern arable practice. This is the lever a future agricultural
     *  technology pulls, and it sets how much of a tile a village can work. */
    hectaresPerFarmer: { value: 3, min: 0.5, max: 100, step: 0.5 },

    // ── DEMOGRAPHY, per year.
    /** Crude birth rate. Pre-modern is ~0.04 (40 per 1000 per year). */
    birthRateYr: { value: 0.045, min: 0, max: 0.2, step: 0.001 },
    lifespanYears: { value: 40, min: 5, max: 100, step: 1 },
    /**
     * Share of births that land OFF the parents' tile, scattered over the
     * neighbours. A child is not born on top of its parents, and at 10 km a
     * plot this is roughly one standard deviation. Without it a settlement only
     * stacks up and waits for crowding to push someone out, so the whole
     * population sat on the seed tile forever.
     */
    birthSpread: { value: 0.15, min: 0, max: 1, step: 0.05 },
    /**
     * Deaths per year at total starvation. A famine kills over seasons, not
     * weeks — at 6 (dead inside two months) any population that lost its
     * harvest was wiped out before it could react.
     */
    starveRateYr: { value: 2, min: 0, max: 26, step: 0.5 },

    // ── FOOD, in PERSON-YEARS. One unit feeds one person for one year, which
    // makes the yield number directly meaningful instead of arbitrary.
    /**
     * SUSTAINABILITY, in one line:
     *
     *     production / consumption = workforceFraction x farmerFeedsPeople x soil
     *
     * The per-tile terms cancel, so this is the whole condition — and it must
     * clear 1 by enough to cover spoilage, which at a one-year store costs
     * about `foodSpoilYr / 2` of consumption again. Verdantia's soil is ~0.3, so
     * the old defaults gave 0.5 x 8 x 0.3 = 1.2 against a requirement near 1.5
     * and every settlement starved no matter how much food sat nearby. It was
     * never a distribution problem: they could not GROW enough.
     *
     * Now 0.7 x 12 x 0.3 = 2.5 against ~1.13 — a real margin to grow on.
     *
     * People one farmer feeds on FULL soil. Pre-modern practice is 2-3 people
     * per farmer on GOOD land, and map soil is a fraction — typically ~0.3 — so
     * the full-soil figure has to be several times that to land in the right
     * place on real ground.
     */
    farmerFeedsPeople: { value: 12, min: 0, max: 40, step: 0.5 },
    /**
     * BANDWIDTH: food a single link carries per tick, in absolute units — the
     * road's cross-section rather than a fraction of what is sitting there.
     *
     * This is what makes distance cost something. A rich hinterland on a dirt
     * track cannot get its harvest to town before it spoils, so the surplus is
     * lost and the far fields are not worth working. Roads multiply it, and a
     * later transport technology multiplies it again — which is the lever that
     * turns a scattering of self-feeding towns into an empire that can move
     * grain.
     */
    linkCapacity: { value: 40, min: 0, max: 5000, step: 5 },

    /** Fraction of stored food lost per year. Grain keeps months, not years. */
    foodSpoilYr: { value: 0.25, min: 0, max: 1, step: 0.01 },
    /** Years of food in hand that counts as secure. */
    foodYearsTarget: { value: 1, min: 0.1, max: 10, step: 0.1 },

    // ── FARMLAND, per year. A field is PLANTED, ripens toward what the soil
    // carries AND what its people can actually work, and spreads into
    // neighbouring ground.
    /**
     * How fast cultivated EXTENT tracks the labour available — not how fast a
     * crop ripens. An established population already has its ground under the
     * plough, so this is quick (about a month): at a season's pace, people
     * newly arrived on land starved before their fields existed.
     */
    fieldGrowYr: { value: 12, min: 0, max: 52, step: 0.5 },
    /** Abandoned farmland reverts to wild in a couple of years. */
    fieldDecayYr: { value: 0.5, min: 0, max: 5, step: 0.05 },

    // ── MOVEMENT. Capped at one tile per tick either way; `migrationYr` is what
    // fraction of a tile's people may leave in a year.
    migrationYr: { value: 2, min: 0, max: 20, step: 0.1 },
    /**
     * Share of a tile's people who strike out per year regardless of whether
     * the frontier looks better — crowd-avoidance, not wanderlust. Gradient
     * migration alone can never found a second town: the frontier has no food,
     * so everyone who drifts there is pulled straight home.
     */
    pioneerYr: { value: 0.02, min: 0, max: 2, step: 0.005 },
    /**
     * Food's speed relative to people's — and it is NOT 1.
     *
     * Migration is generational; carting a harvest to town takes a week. At
     * parity the food simply never arrived: production comfortably exceeded
     * consumption, the stock piled up on the fields, and the towns starved
     * beside full granaries. At 20 (~77% of a tile's stock may move each tick)
     * the harvest reaches the people who grew it.
     */
    foodFlowRatio: { value: 20, min: 0, max: 60, step: 0.5 },

    // ── The forces. POTENTIAL terms, each normalised to 0..1 so the weights are
    // commensurable — see pop.wesl.
    /**
     * People per tile that counts as comfortably settled.
     *
     * Set by the SCALE, not by taste: a tile is 10,000 ha and a farmer works 3,
     * so working it fully takes ~3,300 farmers — and with their families that is
     * several thousand people per tile. At 10 km/tile the atomic unit of
     * settlement is a small city, not a village, and a 40-person seed simply
     * starves because it can cultivate 1% of the ground it stands on.
     */
    comfortablePop: { value: 5000, min: 1, max: 200000, step: 100 },

    // ── ZONING. Land use is discrete, exclusive and permanent; everything else
    // stays continuous and simply asks what the ground is for.
    /** People on wild ground needed before it counts as a town. */
    urbanThreshold: { value: 25, min: 1, max: 10000, step: 5 },
    /** A town past this share of `comfortablePop` lays out new ground beside it
     *  — the footprint grows first and settlers move into it. */
    /**
     * MUST sit above the seed's share of `comfortablePop`, or a new settlement
     * paves its own neighbours the instant it lands: urban ground is permanent,
     * so no field can ever form there and the town starves on what it built. A
     * 1,200-person seed against a 5,000 comfortable town is 0.24, so 0.4 leaves
     * the settlement having to GROW before it sprawls.
     */
    urbanSpreadAt: { value: 0.4, min: 0.05, max: 2, step: 0.05 },
    /** A town past this share of `comfortablePop` reserves the wild ground
     *  beside it for its own growth, so fields cannot wall it in. */
    urbanReserve: { value: 0.1, min: 0, max: 2, step: 0.05 },
    /** Townspeople next door needed before wild ground is broken as field. */
    labourToBreakGround: { value: 200, min: 1, max: 20000, step: 10 },
    /** Share of a town's people who go out to work. */
    workforceFraction: { value: 0.7, min: 0, max: 1, step: 0.05 },
    wFood: { value: 1, min: 0, max: 5, step: 0.05 },
    /** Pull toward fertile ground nobody farms yet — the term that points OUT
     *  of a settlement. At zero the model never expands. */
    wLand: { value: 2, min: 0, max: 10, step: 0.1 },
    wTown: { value: 0.35, min: 0, max: 3, step: 0.05 },
    wCrowd: { value: 0.6, min: 0, max: 3, step: 0.05 },

    // ── Roads are MOBILITY: they change the rate, never the destination.
    roadBoost: { value: 2, min: 0, max: 10, step: 0.1 },
    roadWearYr: { value: 0.05, min: 0, max: 2, step: 0.01 },
    roadDecayYr: { value: 0.2, min: 0, max: 5, step: 0.01 },

    /** Stirred into the birth draw each tick. */
    tickSeed: { value: 0, min: 0, max: 65535, step: 1 },
  },

  // Land use settles first, then labour walks out to it, then the ground is
  // worked, then the harvest moves, and finally people react to the result.
  phases: [["zone"], ["field"], ["food"], ["pop", "road"]],

  scalars: {
    totalPop: { reduce: "sum", layer: "pop" },
    totalFood: { reduce: "sum", layer: "food" },
    peakPop: { reduce: "max", layer: "pop" },
    // Diagnostics: which stage of the chain is empty?
    totalField: { reduce: "sum", layer: "field" },
    peakZone: { reduce: "max", layer: "zone" },
  },

  // THE ONLY DECISION IS WHERE PEOPLE ARE. There is no farm brush: farmland is
  // not placed, it is what people do with the ground under them, so painting a
  // field only produced one that shrank to whatever the local population could
  // work — or vanished where nobody lived.
  /**
   * A NATION, not a founding party.
   *
   * Sized from the map rather than from taste. At 10 km/tile a tile holds ~1,200
   * people at Roman rural density (12/km^2), so radius 3 (~29 tiles) at 1,200
   * each is ~35,000 people on inherited land. Verdantia has 66,369 land tiles —
   * 6.6 million km^2, a continent, and 80 million people to fill — so fifty such
   * nations start on ~2% of it and grow toward a third of it over a 192-year
   * game. A founding party of forty starves before it can plough 1% of the
   * ground it stands on; that is not a nation at this scale.
   */
  // The original's two seeds. SETTLE puts people down and the ground becomes a
  // town on its own; FARM commits ground to crops, and it spreads outward from
  // there as labour reaches it. Neither places a finished thing — both grow.
  brushes: {
    // ONE TILE each — these are SEEDS, not stamps. You drop a settlement and it
    // becomes a town, throws labour into the ground around it, and grows; you
    // drop a field and it spreads as labour reaches further. A brush that
    // painted a finished region was not a seed, and hid whether growth worked
    // at all.
    settle: { target: "pop", mode: "add", value: 1200, radius: 0 },
    farm: { target: "zone", mode: "set", value: 1, radius: 0 },
    depopulate: { target: "pop", mode: "set", value: 0, radius: 4 },
  },

  views: {
    flow: { source: "views/flow.wesl" },
    people: { layer: "pop", ramp: ["#0b1220", "#f4d58d", "#ffffff"] },
    food: { layer: "food", ramp: ["#0b1220", "#2f7d32", "#b8e986"] },
    roads: { layer: "road", ramp: ["#0b1220", "#8d7f63"] },
    farmland: { layer: "field", ramp: ["#0b1220", "#6b8f3a", "#d9e04a"] },
    zoning: { layer: "zone", ramp: ["#101418", "#6b8f3a", "#d8a24a"] },
  },

  modules: import.meta.glob("./**/*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
});
