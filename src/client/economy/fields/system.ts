import {
  defineFieldSystem,
  type FieldSystem,
} from "../../webgpu/FieldDynamics";

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
      .join(token === "__TICK_SEED__" ? `${value >>> 0}u` : value.toFixed(6));
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
        tenure: { type: "f32" },
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
      },
      steps: [
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
        // Consumes the flood output in place — no readback between them.
        {
          pass: "suitability",
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
          pass: "farm_ripen",
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
        {
          pass: "district_yield",
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
        {
          pass: "urban_pick",
          binds: [
            "owner",
            "density",
            "farmFlags",
            "suitability",
            "pickKey:array<atomic<u32>, 256>!",
          ],
        },
        {
          pass: "urban_claim",
          binds: [
            "owner",
            "density",
            "farmFlags",
            "suitability",
            "pickKey:array<atomic<u32>, 256>!",
            "pickTile:array<atomic<u32>, 256>!",
          ],
        },
        {
          pass: "room_count",
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
