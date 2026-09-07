import {
  defineFieldSystem,
  type FieldSystem,
} from "../../../../webgpu/FieldDynamics";

// The economy's DISTANCE FIELDS on the GPU: the food shed (nearest farm + step
// distance, per rework-settlement-ecology) and the military supply field (steps
// to the nearest Settlement/Core, per add-supply-lines). Both are the same
// multi-source flood over owned land, and both are gated by an `owner` plane so
// ONE dispatch computes every player's field at once — which is what makes this
// cheaper than the CPU rather than 40× worse.
//
// Verified against the real CPU implementations (tests/perf/balance/ShedReference.ts
// dumps them; .claude/skills/run-openfront/shed-gpu-diff.mjs diffs them):
//   - supply: 19,789/19,789 tiles EXACT — the flood carries no source id, so
//     its fixpoint is unique and there is nothing to disagree about.
//   - shed: identical reachability and identical step distance on every tile;
//     cell assignment differs only where two farms tie at the same distance
//     (the CPU resolves by BFS queue order, this by lowest source ref — see
//     openspec/changes/order-independent-shed-tiebreak).
//
// Cost: one dispatch, all players, 12.9 ms at 2048×1024 — flat in territory and
// in player count, against ~29 ms/tick of CPU at that scale.

/**
 * Dense slots for the per-CELL accumulators.
 *
 * These were indexed by CELL TILE REF, which makes them grid-sized: 2M entries
 * x 4 bytes = 8 MB each, 32 MB across the four, so reading the "small
 * aggregates" back would have cost MORE than the flood planes that killed
 * Level A. A district is a farm nucleus, and nuclei are units the CPU owns, so
 * a sparse tile->slot map is cheap to build and turns every aggregate readback
 * into O(districts) instead of O(map).
 *
 * The cap is a hard ceiling: `cellSlot` leaves overflow districts unmapped and
 * the passes skip them, so exceeding it loses accumulation for those districts
 * rather than corrupting others. The uploader logs when it happens.
 *
 * MEASURED, not guessed (tests/perf/balance/DistrictCount.ts, spqr 2048x1024,
 * 40 bots): 314 districts at tick 2000, 482 at 5000, 617 at tick 9000 — the
 * point at which the map is fully claimed and the count can no longer grow.
 * Peak per player was 41. So 16384 is ~26x the worst case a real game reaches
 * on the largest map, and the readback it implies is 256 KB.
 */
export const MAX_CELLS = 16384;

/**
 * Districts the REGION ADJACENCY matrix can represent, and why it is smaller
 * than `MAX_CELLS`.
 *
 * The matrix is `REGION_SLOTS^2` bits and is cleared by a grid pass, so it
 * cannot be larger than the smallest shipped map: pangea001 at 256x256 =
 * 65,536 tiles. 1024 slots is 32,768 words and fits; 2048 would need 131,072
 * and would not.
 *
 * Against the measured peak of 617 districts at full conquest that is 1.66x
 * headroom, thinner than the 26x `MAX_CELLS` carries — so saturation is
 * REPORTED rather than silent, and a district beyond the cap becomes its own
 * region (degraded, not corrupted). If it ever needs lifting: adjacency only
 * links districts of the SAME player, and per-player counts peak at 41.
 */
export const REGION_SLOTS = 1024;
/** REGION_SLOTS / 32 — u32 words per row. */
export const REGION_WORDS = 32;

/** Flood cutoff in radii, matching CUTOFF_RADII in both CPU implementations. */
export const CUTOFF_RADII = 3;

export interface EconomyFieldCutoffs {
  /** ceil(foodShedRadius × CUTOFF_RADII) — the shed's step cutoff. */
  shed: number;
  /** ceil(supplyRadius × CUTOFF_RADII) — the supply field's step cutoff. */
  supply: number;
}

/** The `Config.food()` knobs the passes bake in. Same substitution story as the
 *  cutoffs: they are simulation config, but a WGSL `const` is compile-time, so
 *  the system is built for a config and rebuilt when it changes. */
export interface EconomyFieldKnobs {
  // Farm ripening (FarmGrowth).
  fieldClaimMilli: number;
  farmSeedMilli: number;
  farmGrowthRate: number;
  farmSenesceRate: number;
  humidityWeight: number;
  tempBaseN: number;
  tempOptLoN: number;
  tempOptHiN: number;
  tempMaxN: number;
  waterWiltN: number;
  waterFullN: number;
  fieldTileStorageMilli: number;
  fieldTileYieldMilli: number;
  tenureHalfTicks: number;
  /** Advances the placement draw's randomness each tick. */
  tickSeed: number;
  wFood: number;
  wWater: number;
  wShore: number;
  wFieldWater: number;
  wLogi: number;
  wCong: number;
  supplyRadius: number;
  supplyDecayPower: number;
  popPerDensity: number;
  foodShedRadius: number;
  foodShedPower: number;
  wFoodShed: number;
  fieldPatchCostMilli: number;
  fieldPatchDriveCapMilli: number;
  farmersPerFieldTile: number;
}

const MODULES = import.meta.glob("./**/*.wesl", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * The cutoffs are simulation config (`foodShedRadius`, `supplyRadius`), but a
 * flood's step limit is a WGSL constant and its pass count is a compile-time
 * `iterate` — neither can read a uniform without also making the iteration
 * count dynamic, which the derivation grammar does not express. So the system
 * is BUILT for a given config: the pass sources get their `CUTOFF` substituted
 * and `iterate` is set to match. Config changes rarely (game start, or a live
 * knob edit), so rebuilding then is cheap. A silent substitution failure would
 * truncate a flood, so it throws instead.
 */
function withCutoff(source: string, cutoff: number): string {
  const pattern = /const CUTOFF: u32 = \d+u;/;
  if (!pattern.test(source)) {
    throw new Error("economy field pass has no CUTOFF constant to substitute");
  }
  return source.replace(pattern, `const CUTOFF: u32 = ${cutoff}u;`);
}

/** Substitute `__NAME__` placeholders with float literals. Throws on any left
 *  unfilled — an unsubstituted placeholder is a WGSL syntax error at best and a
 *  silently wrong constant at worst. */
/** Tokens that must land as WGSL INTEGER literals — they are compared against
 *  i32 accumulators, and `50000.000000` is a type error there. */
const INT_TOKENS = new Set([
  "__FIELD_PATCH_COST_MILLI__",
  "__FIELD_PATCH_DRIVE_CAP_MILLI__",
  "__FARMERS_PER_FIELD_TILE__",
]);

function withKnobs(source: string, knobs: EconomyFieldKnobs): string {
  const subs: Record<string, number> = {
    __W_FOOD__: knobs.wFood,
    __W_WATER__: knobs.wWater,
    __W_SHORE__: knobs.wShore,
    __W_FIELD_WATER__: knobs.wFieldWater,
    __W_LOGI__: knobs.wLogi,
    __W_CONG__: knobs.wCong,
    __SUPPLY_RADIUS__: knobs.supplyRadius,
    __SUPPLY_DECAY_POWER__: knobs.supplyDecayPower,
    __POP_PER_DENSITY__: knobs.popPerDensity,
    __FOOD_SHED_RADIUS__: knobs.foodShedRadius,
    __FOOD_SHED_POWER__: knobs.foodShedPower,
    __W_FOOD_SHED__: knobs.wFoodShed,
    __FIELD_PATCH_COST_MILLI__: knobs.fieldPatchCostMilli,
    __FIELD_PATCH_DRIVE_CAP_MILLI__: knobs.fieldPatchDriveCapMilli,
    __FARMERS_PER_FIELD_TILE__: knobs.farmersPerFieldTile,
    __FIELD_CLAIM_MILLI__: knobs.fieldClaimMilli,
    __FARM_SEED_MILLI__: knobs.farmSeedMilli,
    __FARM_GROWTH_RATE__: knobs.farmGrowthRate,
    __FARM_SENESCE_RATE__: knobs.farmSenesceRate,
    __HUMIDITY_WEIGHT__: knobs.humidityWeight,
    __TEMP_BASE_N__: knobs.tempBaseN,
    __TEMP_OPT_LO_N__: knobs.tempOptLoN,
    __TEMP_OPT_HI_N__: knobs.tempOptHiN,
    __TEMP_MAX_N__: knobs.tempMaxN,
    __WATER_WILT_N__: knobs.waterWiltN,
    __WATER_FULL_N__: knobs.waterFullN,
    __FIELD_TILE_STORAGE_MILLI__: knobs.fieldTileStorageMilli,
    __FIELD_TILE_YIELD_MILLI__: knobs.fieldTileYieldMilli,
    __TENURE_HALF_MILLI__: knobs.tenureHalfTicks * 1000,
    __TICK_SEED__: knobs.tickSeed,
  };
  let out = source;
  for (const [token, value] of Object.entries(subs)) {
    // A WGSL float literal needs a decimal point; `18` would be an integer.
    // `__TICK_SEED__` is a u32 literal; the rest are f32 and need a decimal
    // point (WGSL would read `18` as an integer).
    out = out
      .split(token)
      .join(
        token === "__TICK_SEED__"
          ? `${value >>> 0}u`
          : INT_TOKENS.has(token)
            ? `${Math.round(value)}`
            : value.toFixed(6),
      );
  }
  const leftover = out.match(/__[A-Z_]+__/);
  if (leftover !== null) {
    throw new Error(`economy field pass has no value for ${leftover[0]}`);
  }
  return out;
}

/** Build the economy's field system for a given set of flood cutoffs. */
export function economyFields(
  cutoffs: EconomyFieldCutoffs,
  knobs: EconomyFieldKnobs,
): FieldSystem {
  const modules: Record<string, string> = {};
  for (const [path, source] of Object.entries(MODULES)) {
    const withC = path.includes("shed_step")
      ? withCutoff(source, cutoffs.shed)
      : path.includes("supply_step")
        ? withCutoff(source, cutoffs.supply)
        : source;
    modules[path] = withC.includes("__") ? withKnobs(withC, knobs) : withC;
  }
  return defineFieldSystem({
    id: "economy-fields",
    name: "Economy distance fields",
    description: "Food-shed and military-supply floods, all players at once.",
    kind: "study",
    defaultMap: "Verdantia",
    defaultView: "probe",

    derive: {
      typeImports: "",
      fields: {
        // Uploaded per refresh from the live game.
        owner: { type: "u32" },
        farmMaturity: { type: "f32" },
        supplyNode: { type: "u32" },
        // Static map planes (uploaded once) + the sim's per-tile density.
        crop: { type: "f32" },
        water: { type: "f32" },
        shore: { type: "f32" },
        density: { type: "f32" },
        plotFarm: { type: "u32" },
        temperature: { type: "f32" },
        humidity: { type: "f32" },
        /** damage | fieldZone<<1 | nucleus<<2 | fallow<<3 | tilled<<4 |
         *  urbanZone<<5 | plot<<6 — packed because WebGPU allows only 8
         *  storage buffers per shader stage. */
        farmFlags: { type: "u32" },
        /** Readable because `farm_tenure` WRITES it: the aging pass is the one
         *  place the GPU advances a plane the CPU uploaded, so verifying it
         *  means reading the plane back. */
        tenure: { type: "f32", readable: true },
        /** District accumulators, indexed by CELL TILE (unique across players).
         *  Integer milli so atomicAdd is order-independent and therefore exact. */
        prodAccum: { type: "i32", count: MAX_CELLS, readable: true },
        capAccum: { type: "i32", count: MAX_CELLS, readable: true },
        /** Per-player winning key and the tile that holds it — the placement
         *  draw's whole output, 2 KB read back instead of a territory scan. */
        pickKey: { type: "u32", count: 256, readable: true },
        pickTile: { type: "u32", count: 256, readable: true },
        // Ping-ponged flood state; the readable planes are what the sim wants.
        shedDist: { type: "u32", pingPong: true, readable: true },
        shedCell: { type: "u32", pingPong: true, readable: true },
        supplyDist: { type: "u32", pingPong: true, readable: true },
        // First CONSUMER output: read by the placement step on the GPU, and by
        // the diff rig on the CPU (which is why it is readable).
        suitability: { type: "f32", readable: true },
        // Zero-congestion variant, for the room count (see room_count.wesl).
        suitZero: { type: "f32" },
        /** The food shed's reach at each tile (srcMaturity x decay), and the
         *  city draw's ACTUAL weight — base suitability times the shed gate.
         *  `suitability` above is only the base term, so weighting a draw by it
         *  samples the right pool with the wrong probabilities, which is what
         *  `urban_pick` has been doing. */
        potential: { type: "f32" },
        cityWeight: { type: "f32", readable: true },
        // Per-player accumulator: an ITERATION over the field collapsed into a
        // reduction. 256 slots, read back whole — ~1 KB, not a 200k-entry Map.
        roomCount: { type: "u32", count: 256, readable: true },
        /** The crop CA's state: milli-maturity per tile, advanced each tick. */
        maturity: { type: "f32", pingPong: true, readable: true },
        /** The patch frontier's weight, materialised so the race pass fits in
         *  eight storage buffers (see farm_patch_weight.wesl). */
        patchWeight: { type: "f32" },
        /** Field expansion's draw, indexed by CELL TILE like the district
         *  accumulators — every district places its own patch, so this cannot
         *  be a 256-slot per-player array. */
        patchKey: { type: "u32", count: MAX_CELLS, readable: true },
        patchTile: { type: "u32", count: MAX_CELLS, readable: true },
        /** Tile -> dense district slot, or NO_SLOT. Uploaded per refresh from
         *  the farm nuclei, which the CPU owns (they are units). */
        cellSlot: { type: "u32" },
        /** The patch phase's two per-district reductions: summed maturity (the
         *  credit stream's per-tick drive) and the field's tile count (the
         *  labor gate's acreage). Integer, so the sums are order-independent. */
        driveAccum: { type: "i32", count: MAX_CELLS, readable: true },
        acreAccum: { type: "i32", count: MAX_CELLS, readable: true },
        /** The labour ledger's acreage (`EconomyModel.committedStaffing`) —
         *  CLAIMED tiles per district, a different predicate from `acreAccum`
         *  above and read by a different consumer. See farm_acres.wesl. */
        acresAccum: { type: "i32", count: MAX_CELLS, readable: true },
        /** The patch phase's per-district ledger. CREDIT is mirrored on the CPU
         *  keyed by nucleus tile and re-uploaded each refresh, because slots are
         *  renumbered in ascending tile order whenever the farm set changes and
         *  a persistent GPU-only array would hand one district's savings to
         *  another. RESIDENTS is the shed's labour pooling, which stays a
         *  per-player quantity under D1. */
        slotCredit: { type: "i32", count: MAX_CELLS, readable: true },
        slotResidents: { type: "i32", count: MAX_CELLS, readable: true },
        /** THE SHED'S DERIVATION, moved off the host (change design D1). The
         *  flood was ported long ago and `recompute` still derived from it on
         *  the CPU, which is the only reason a 535k-entry scatter was ever
         *  needed. These four are what it produced.
         *
         *  `claimAccum` — the cell's FIELD: non-nucleus covered tiles that are
         *  claimed crop or persistent Field zone. A THIRD acreage count, and
         *  deliberately not folded into the other two: `acreAccum` counts what
         *  drives expansion, `acresAccum` what a district has committed, this
         *  what its labour need is measured against. */
        claimAccum: { type: "i32", count: MAX_CELLS, readable: true },
        /** Raw labour pooled from the cell's inhabited tiles, before the
         *  spillover caps it. Intermediate: nothing outside the pipeline reads
         *  it, which is why it is not `slotResidents`. */
        poolAccum: { type: "i32", count: MAX_CELLS, readable: true },
        /** `peopleByFarm` — residents per cell, UNCAPPED, snapshot before the
         *  spillover. This is who EATS there, and it is the one of the two that
         *  crosses back: four sim consumers read it. */
        slotPeople: { type: "i32", count: MAX_CELLS, readable: true },
        /** `laborByFarm` — the post-spillover staffing pool. Read by the
         *  coverage cut-off and by nothing outside `FoodShed.ts`, so it never
         *  has to cross a seam at all. */
        slotLabor: { type: "i32", count: MAX_CELLS, readable: true },
        /** Slot -> nucleus tile, the inverse of `cellSlot`. The per-slot and
         *  per-player passes need to know whose district a slot is, and the
         *  owner plane is indexed by tile. */
        slotTile: { type: "u32", count: MAX_CELLS },
        /** How many slots are live this refresh, so the per-player spillover
         *  walks ~600 entries rather than all 16,384. */
        slotCount: { type: "u32", count: 1 },
        /** Per-player scalars the pooling needs and the device should not
         *  derive: `min(idlePop, housing) / housing`, and the rural cohort's
         *  equal split plus its division remainder. All three are O(1) on the
         *  host — computing them here would mean reducing a farm count only to
         *  divide by it. */
        playerOcc: { type: "f32", count: 256 },
        playerRural: { type: "i32", count: 256 },
        playerRuralRem: { type: "i32", count: 256 },
        /** The slot of the player's `farms[0]`, which takes the rural
         *  remainder. Lowest slot index = lowest tile ref (parent D4). */
        playerFirstSlot: { type: "u32", count: 256 },
        /** REGION ADJACENCY as a bit matrix: `REGION_SLOTS^2` bits, so what
         *  crosses back is a function of how many DISTRICTS exist rather than
         *  of the total length of every Voronoi seam on the board. See
         *  shed_region.wesl for why the cap is 1024 and not MAX_CELLS. */
        /** COVERAGE per tile: ranked / tilled / escalate. The GPU's answer to
         *  `shed.ranked` and `shed.tilled`, which the uploader currently sends
         *  IN as farmFlags bits — after the cutover this is where they come
         *  from. Readable because the seam diff compares it per tile. */
        coverFlags: { type: "u32", readable: true },
        regionAdj: {
          type: "u32",
          count: REGION_SLOTS * REGION_WORDS,
          readable: true,
        },
        /** The crop plane as a COMPACTED list — see maturity_compact.wesl.
         *  Sized for the worst case, read back only as far as the counter, so
         *  what crosses is proportional to how much crop exists. */
        cropCount: { type: "u32", count: 1, readable: true },
        /** The shed flood, compacted the same way — see shed_compact.wesl. */
        shedCount: { type: "u32", count: 1, readable: true },
        shedTileList: { type: "u32", count: 2097152, readable: true },
        shedDistList: { type: "u32", count: 2097152, readable: true },
        shedCellList: { type: "u32", count: 2097152, readable: true },
        cropTile: { type: "u32", count: 2097152, readable: true },
        cropVal: { type: "f32", count: 2097152, readable: true },
        /** Scaffolding: which branch the patch gate took, per district.
         *  0 no drive, 1 drive, 2 saving, 3 labour-blocked, 4 no tile, 5 placed. */
        patchReason: { type: "u32", count: MAX_CELLS, readable: true },
        /** Per-player and per-district PRNG SEEDS for the placement draws.
         *  The CPU hashes them (`simpleHash("urban:<player id>:<tick>")`) and
         *  uploads them, because the player id is a string the GPU never sees;
         *  the GPU owns the stream, not the seed. Both are O(entities) to
         *  build, which is nothing beside the O(territory) work they drive. */
        playerSeed: { type: "u32", count: 256 },
        slotSeed: { type: "u32", count: MAX_CELLS },
        /** Scaffolding (task 5.3): the first draws of the first seeds, for the
         *  generator-parity check. */
        randOut: { type: "f32", count: 512, readable: true },
      },
      // TIERS. `runDerive(frame)` runs everything; `runDerive(frame, "consumers")`
      // runs every pass EXCEPT the two floods and the potential field they
      // feed. That split exists because the floods are the pipeline's cost —
      // 84 of its ~101 grid dispatches, since the shed iterates
      // ceil(18x3)=54 times and supply ceil(10x3)=30 — while their output
      // changes slowly. The CPU refreshes them every `supplyRefreshTicks` and
      // reads them stale in between; under D9 the GPU is not obliged to, so
      // this is a cost/quality dial rather than a fidelity requirement, and
      // task 1.14 settles it by measurement.
      //
      // Everything else must run EVERY tick — including the resets, which are
      // what keep the reductions from accumulating across the whole game.
      steps: [
        // FIRST, always: the reductions are atomicAdd targets and the draw slots
        // are atomicMin targets. A zeroed buffer makes the former accumulate
        // across every tick of the game and the latter never move at all.
        {
          pass: "reset_cells",
          tiers: ["consumers"],
          binds: [
            "prodAccum:array<i32, 16384>!",
            "capAccum:array<i32, 16384>!",
            "driveAccum:array<i32, 16384>!",
            "acreAccum:array<i32, 16384>!",
            "acresAccum:array<i32, 16384>!",
            "patchKey:array<u32, 16384>!",
            "patchTile:array<u32, 16384>!",
            "cropCount:array<u32, 1>!",
            "shedCount:array<u32, 1>!",
          ],
        },
        {
          pass: "reset_players",
          tiers: ["consumers"],
          binds: [
            "pickKey:array<u32, 256>!",
            "pickTile:array<u32, 256>!",
            "roomCount:array<u32, 256>!",
          ],
        },
        {
          pass: "shed_init",
          binds: ["farmMaturity", "shedDist.write", "shedCell.write"],
          advances: ["shedDist", "shedCell"],
        },
        {
          pass: "shed_step",
          binds: [
            "owner",
            "shedDist.read",
            "shedCell.read",
            "shedDist.write",
            "shedCell.write",
          ],
          advances: ["shedDist", "shedCell"],
          iterate: cutoffs.shed,
        },
        {
          pass: "supply_init",
          binds: ["supplyNode", "supplyDist.write"],
          advances: ["supplyDist"],
        },
        {
          pass: "supply_step",
          binds: ["owner", "supplyDist.read", "supplyDist.write"],
          advances: ["supplyDist"],
          iterate: cutoffs.supply,
        },
        // THE SHED'S DERIVATION (design D1), immediately after the flood that
        // feeds it and before every consumer of coverage or labour. The order
        // inside is load-bearing and mirrors `FoodShed.recompute`:
        //   claims -> pool -> rural (+ the peopleByFarm snapshot) -> spill.
        // `shed_rural` must take the snapshot BEFORE `shed_spill` caps the
        // pools, because feeding is by residence and tilling is by staffing —
        // taking it after would collapse the two into one quantity and starve
        // every dense core.
        {
          pass: "reset_shed",
          tiers: ["consumers"],
          binds: [
            "claimAccum:array<i32, 16384>!",
            "poolAccum:array<i32, 16384>!",
            "regionAdj:array<u32, 32768>!",
          ],
        },
        {
          pass: "shed_claims",
          tiers: ["consumers"],
          binds: [
            "owner",
            "farmFlags",
            "maturity.read",
            "shedCell.read",
            "cellSlot",
            "claimAccum:array<atomic<i32>, 16384>!",
          ],
        },
        {
          pass: "shed_region",
          tiers: ["consumers"],
          binds: [
            "owner",
            "shedCell.read",
            "cellSlot",
            "regionAdj:array<atomic<u32>, 32768>!",
          ],
        },
        {
          pass: "shed_pool",
          tiers: ["consumers"],
          binds: [
            "owner",
            "density",
            "shedCell.read",
            "cellSlot",
            "playerOcc",
            "poolAccum:array<atomic<i32>, 16384>!",
          ],
        },
        {
          pass: "shed_rural",
          tiers: ["consumers"],
          binds: [
            "slotTile",
            "owner",
            "poolAccum:array<i32, 16384>!",
            // ANNOTATED, and they have to be: the bind grammar's default
            // element type is `spec.type === "u32" ? "u32" : "f32"`, so an i32
            // buffer left unannotated binds as f32 and the shader reads
            // people-counts as floats. It fails as a type error here; it would
            // fail silently if the arithmetic happened to typecheck.
            "playerRural:array<i32, 256>",
            "playerRuralRem:array<i32, 256>",
            "playerFirstSlot",
            "slotPeople:array<i32, 16384>!",
          ],
        },
        {
          pass: "shed_spill",
          tiers: ["consumers"],
          binds: [
            "slotTile",
            "owner",
            "poolAccum:array<i32, 16384>",
            "claimAccum:array<i32, 16384>",
            "slotLabor:array<i32, 16384>!",
            "slotCount",
          ],
        },
        // AFTER `shed_spill`, because the cut-off reads the POST-spillover pool,
        // and after `shed_claims`, because it compares against that count.
        {
          pass: "shed_cover",
          tiers: ["consumers"],
          binds: [
            "owner",
            "farmFlags",
            "maturity.read",
            "shedCell.read",
            "cellSlot",
            "slotLabor:array<i32, 16384>",
            "claimAccum:array<i32, 16384>",
            "coverFlags!",
          ],
        },
        // Consumes the flood output in place — no readback between them.
        {
          pass: "suitability",
          tiers: ["consumers"],
          binds: [
            "owner",
            "crop",
            "water",
            "shore",
            "density",
            "supplyDist.read",
            "suitability!",
            "suitZero!",
          ],
        },
        {
          pass: "shed_potential",
          binds: [
            "farmMaturity",
            "shedCell.read",
            "shedDist.read",
            "potential!",
          ],
        },
        {
          pass: "city_weight",
          tiers: ["consumers"],
          binds: [
            "density",
            "farmFlags",
            "maturity.read",
            "suitability",
            "potential",
            "supplyDist.read",
            "cityWeight!",
          ],
        },
        {
          pass: "farm_ripen",
          tiers: ["consumers"],
          binds: [
            "owner",
            "crop",
            "water",
            "temperature",
            "humidity",
            "farmFlags",
            "maturity.read",
            "maturity.write",
          ],
          advances: ["maturity"],
        },
        {
          pass: "farm_credit",
          tiers: ["consumers"],
          binds: [
            "owner",
            "farmFlags",
            "maturity.read",
            "shedCell.read",
            "cellSlot",
            "driveAccum:array<atomic<i32>, 16384>!",
            "acreAccum:array<atomic<i32>, 16384>!",
          ],
        },
        {
          pass: "farm_patch_weight",
          tiers: ["consumers"],
          binds: [
            "crop",
            "water",
            "temperature",
            "humidity",
            "shore",
            "patchWeight!",
          ],
        },
        {
          pass: "farm_patch",
          tiers: ["consumers"],
          binds: [
            "owner",
            "density",
            "farmFlags",
            "maturity.read",
            "shedCell.read",
            "patchWeight",
            "cellSlot",
            "patchKey:array<atomic<u32>, 16384>!",
          ],
        },
        {
          pass: "farm_patch_claim",
          tiers: ["consumers"],
          binds: [
            "owner",
            "density",
            "farmFlags",
            "maturity.read",
            "shedCell.read",
            "patchWeight",
            "cellSlot",
            "patchKey:array<atomic<u32>, 16384>!",
            "patchTile:array<atomic<u32>, 16384>!",
          ],
        },
        // The patch WRITE, after the draw named a winner and before anything
        // reads maturity again (D3).
        {
          pass: "farm_patch_apply",
          tiers: ["consumers"],
          binds: [
            "driveAccum:array<i32, 16384>",
            "acreAccum:array<i32, 16384>",
            "slotCredit:array<i32, 16384>!",
            "slotResidents:array<i32, 16384>",
            "patchTile:array<u32, 16384>",
            "maturity.read!",
            "patchReason:array<u32, 16384>!",
          ],
        },
        // LAST reader of maturity, and it has to stay that way. Its consumer
        // (`committedStaffing`, called by the AI build planner on its own
        // cadence) reads the CPU's END-OF-TICK maturity map — which includes
        // the plot the patch phase just placed at exactly the claim threshold.
        // Since a fresh plot senesces back below the threshold on the very next
        // ripen, running this pass any earlier counts a systematically
        // different set: measured on verdantia at tick 3102, post-ripen
        // maturity peaks at 62 milli against a claim of 300, so an early
        // position makes the histogram identically zero.
        {
          pass: "farm_acres",
          tiers: ["consumers"],
          binds: [
            "owner",
            "maturity.read",
            "shedCell.read",
            "cellSlot",
            "acresAccum:array<atomic<i32>, 16384>!",
          ],
        },
        {
          pass: "district_yield",
          tiers: ["consumers"],
          binds: [
            "owner",
            "crop",
            "farmFlags",
            "tenure",
            "maturity.read",
            "shedCell.read",
            "cellSlot",
            "prodAccum:array<atomic<i32>, 16384>!",
            "capAccum:array<atomic<i32>, 16384>!",
          ],
        },
        // AFTER the ledger, deliberately: on the CPU `tenureTick` runs after
        // `foodTick`, so the ledger's capacity term reads the tenure this tick
        // has NOT yet advanced. Moving this pass earlier would quietly age
        // every district one tick before it was harvested.
        {
          pass: "farm_tenure",
          tiers: ["consumers"],
          binds: [
            "owner",
            "crop",
            "water",
            "temperature",
            "humidity",
            "farmFlags",
            "maturity.read",
            "tenure!",
          ],
        },
        // The race weights by `cityWeight`, not `suitability`: the latter is
        // only the base term, and racing on it sampled a different pool with
        // different probabilities than the CPU's draw. `cityWeight` also
        // carries the whole eligibility predicate, so these two need nothing
        // else.
        {
          pass: "urban_pick",
          tiers: ["consumers"],
          binds: ["owner", "cityWeight", "pickKey:array<atomic<u32>, 256>!"],
        },
        {
          pass: "urban_claim",
          tiers: ["consumers"],
          binds: [
            "owner",
            "cityWeight",
            "pickKey:array<atomic<u32>, 256>!",
            "pickTile:array<atomic<u32>, 256>!",
          ],
        },
        // LAST of all: every writer of maturity has run, so this is the plane
        // the CPU's own `farmTick` would have produced.
        {
          pass: "shed_compact",
          binds: [
            "owner",
            "shedDist.read",
            "shedCell.read",
            "shedCount:array<atomic<u32>, 1>!",
            "shedTileList:array<u32, 2097152>!",
            "shedDistList:array<u32, 2097152>!",
            "shedCellList:array<u32, 2097152>!",
          ],
        },
        {
          pass: "maturity_compact",
          binds: [
            "owner",
            "maturity.read",
            "cropCount:array<atomic<u32>, 1>!",
            "cropTile:array<u32, 2097152>!",
            "cropVal:array<f32, 2097152>!",
          ],
        },
        {
          pass: "rand_probe",
          tiers: ["consumers"],
          binds: ["playerSeed", "randOut!"],
        },
        {
          pass: "room_count",
          tiers: ["consumers"],
          binds: [
            "owner",
            "density",
            "plotFarm",
            "suitZero",
            "supplyDist.read",
            "roomCount:array<atomic<u32>, 256>!",
          ],
        },
      ],
    },

    views: {
      probe: { layer: "probe", ramp: ["#101418", "#7ad0ff"] },
    },

    modules,
  });
}
