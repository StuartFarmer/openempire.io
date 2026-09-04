import { describe, expect, test } from "vitest";
import { farmTick } from "../src/core/execution/utils/FarmGrowth";
import { foodShedField } from "../src/core/execution/utils/FoodShed";
import { supplyField } from "../src/core/execution/utils/SupplyField";
import { growUrbanArea } from "../src/core/execution/utils/UrbanGrowth";
import {
  Game,
  LandUse,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

/**
 * Persistent land-use zoning (LandUse): once a tile is BUILT it keeps its zone
 * forever. Death clears the live population / crop but never the zone — dead
 * city ground stays reserved for the city and dead field ground for the farm,
 * so a starved-out tile regrows as its own type and the two automata never
 * poach each other's ground. This is the fix for a fast-growing farm paving
 * over razed city tiles and locking the city out of its own valley.
 */

const info = new PlayerInfo("zoner", PlayerType.Human, null, "zoner_id");
const good: LayersFill = (n) => (n === "temperature" ? 153 : 255);

/** Broad food-shed so one mature farm feeds the whole region — isolates the
 *  zoning invariant from the food-shed gate (mirrors UrbanGrowth.test.ts). */
class Fed extends TestConfig {
  override food() {
    return {
      ...super.food(),
      foodShedRadius: 500,
      foodShedPower: 3,
      wFoodShed: 2,
    };
  }
}

async function game(): Promise<[Game, Player]> {
  const g = await setup(
    "plains",
    { instantBuild: true },
    [info],
    undefined,
    Fed,
    true,
    good,
  );
  const p = g.player(info.id);
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 30; x++) p.conquer(g.ref(x, y));
  return [g, p];
}

function setPopulation(p: Player, people: number): void {
  p.setTroops(people); // rural labor pool (idle-based)
  (p as Player & { _foodFlow: { population: number } })._foodFlow.population =
    people;
}

/** Force a shed refresh (it normally recomputes only on cadence). */
function refreshShed(g: Game, p: Player) {
  const s = foodShedField(g, p);
  s.lastCalcTick = -1;
  return foodShedField(g, p);
}

describe("landUseEntries", () => {
  test("enumerates exactly the ZONED tiles, not the territory", async () => {
    const [g, p] = await game();
    // 900 tiles conquered, two of them zoned. A consumer that wants zoned
    // ground must be able to walk the zones rather than filter the territory —
    // the economy uploader did the latter and spent 68 ms a tick on it.
    const city = g.ref(3, 3);
    const field = g.ref(4, 4);
    p.setDensity(city, g.config().food().popPerDensity);
    p.setFarmMaturity(field, g.config().food().fieldClaimMilli);

    const entries = Array.from(p.landUseEntries());
    expect(entries.length).toBe(2);
    expect(new Map(entries).get(city)).toBe(LandUse.Urban);
    expect(new Map(entries).get(field)).toBe(LandUse.Field);
    expect(p.tiles().size).toBeGreaterThan(entries.length * 100);
  });

  test("agrees with landUse() tile by tile", async () => {
    const [g, p] = await game();
    p.setDensity(g.ref(1, 1), g.config().food().popPerDensity);
    p.setFarmMaturity(g.ref(2, 2), g.config().food().fieldClaimMilli);
    for (const [tile, use] of p.landUseEntries()) {
      expect(p.landUse(tile)).toBe(use);
    }
  });

  test("is empty on untouched ground", async () => {
    const [, p] = await game();
    expect(Array.from(p.landUseEntries())).toEqual([]);
  });
});

describe("land-use zoning survives death (LandUse)", () => {
  test("a razed city tile keeps its Urban zone", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.setDensity(t, g.config().food().popPerDensity);
    expect(p.landUse(t)).toBe(LandUse.Urban);
    p.setDensity(t, 0); // the population starves out
    expect(p.density(t)).toBe(0);
    expect(p.landUse(t)).toBe(LandUse.Urban); // ground still reserved for the city
  });

  test("a senesced field tile keeps its Field zone", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.setFarmMaturity(t, g.config().food().fieldClaimMilli);
    expect(p.landUse(t)).toBe(LandUse.Field);
    p.setFarmMaturity(t, 0); // the crop dies back
    expect(p.farmMaturity(t)).toBe(0);
    // Once a field, always a field (rework-persistent-tiles-and-burn): the
    // zone is the authority, so a senesced tile is STILL a field tile — it
    // regrows in place rather than reverting to wild.
    expect(p.isFieldTile(t)).toBe(true);
    expect(p.landUse(t)).toBe(LandUse.Field); // the zone persists
  });

  test("sub-claim establishment that dies back is never zoned", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    // Below the claim line — an establishing plot, not yet a built field.
    p.setFarmMaturity(t, g.config().food().fieldClaimMilli - 1);
    expect(p.landUse(t)).toBeUndefined();
    p.setFarmMaturity(t, 0);
    expect(p.landUse(t)).toBeUndefined();
  });

  test("losing the tile (relinquish) clears the zone", async () => {
    const [g, p] = await game();
    const t = g.ref(5, 5);
    p.setDensity(t, g.config().food().popPerDensity);
    expect(p.landUse(t)).toBe(LandUse.Urban);
    p.relinquish(t); // the tile reverts to raw wild
    expect(p.landUse(t)).toBeUndefined();
  });
});

describe("the automata never poach each other's ground", () => {
  test("the farm CA never tills a razed city tile", async () => {
    const [g, p] = await game();
    const f = g.config().food();

    // BOXED: a mature farm nucleus ringed on all four sides by city RUINS
    // (Urban-zoned, density 0). The reported bug is the farm paving these in.
    const nucleus = g.ref(10, 10);
    p.buildUnit(UnitType.Farmland, nucleus, {});
    p.setFarmMaturity(nucleus, 1000);
    const ring = [g.ref(11, 10), g.ref(9, 10), g.ref(10, 11), g.ref(10, 9)];
    for (const t of ring) {
      p.setDensity(t, f.popPerDensity); // a city tile...
      p.setDensity(t, 0); // ...that starved out
    }
    for (const t of ring) expect(p.landUse(t)).toBe(LandUse.Urban);

    // CONTROL: a second identical farm on OPEN wild land, to prove the economy
    // is live and actively expanding (so the ring is blocked by the zone, not
    // by a dead farm).
    const open = g.ref(20, 20);
    p.buildUnit(UnitType.Farmland, open, {});
    p.setFarmMaturity(open, 1000);

    setPopulation(p, 100_000); // ample rural labor + credit to expand
    for (let i = 0; i < 250; i++) farmTick(g, p, refreshShed(g, p));

    // The ring is never cultivated — it stays the city's reserved ground.
    for (const t of ring) {
      expect(p.farmMaturity(t)).toBe(0);
      expect(p.landUse(t)).toBe(LandUse.Urban);
    }
    // ...while the open farm spread into its wild neighbours.
    const openSpread = [
      g.ref(21, 20),
      g.ref(19, 20),
      g.ref(20, 21),
      g.ref(20, 19),
    ].some((t) => p.farmMaturity(t) > 0);
    expect(openSpread).toBe(true);
  });

  test("the city CA never urbanizes a senesced field tile", async () => {
    const [g, p] = await game();
    const f = g.config().food();

    // BOXED: a core ringed by senesced field tiles (Field-zoned, maturity 0).
    // The persistent Field zone — which is now the authority for isFieldTile —
    // keeps the city from paving them; the field regrows there instead.
    const core = g.ref(15, 15);
    p.setCore(core);
    p.setDensity(core, f.popPerDensity);
    const ring = [g.ref(16, 15), g.ref(14, 15), g.ref(15, 16), g.ref(15, 14)];
    for (const t of ring) {
      p.setFarmMaturity(t, f.fieldClaimMilli); // a claimed field tile...
      p.setFarmMaturity(t, 0); // ...whose crop senesced away
    }
    for (const t of ring) {
      expect(p.landUse(t)).toBe(LandUse.Field);
      expect(p.isFieldTile(t)).toBe(true); // once a field, always a field
    }
    // A mature farm feeds the region (broad shed) so growth is unblocked.
    const farm = g.ref(20, 20);
    p.buildUnit(UnitType.Farmland, farm, {});
    p.setFarmMaturity(farm, 1000);

    setPopulation(p, 3_000_000); // target far above the ring
    for (let i = 0; i < 100; i++) growUrbanArea(g, p, supplyField(g, p));

    // Boxed in by reserved field ground on every side: only the core stands.
    expect(p.urbanArea()).toBe(1);
    for (const t of ring) expect(p.density(t)).toBe(0);
  });

  test("an unringed core sprawls freely (control for the boxed city)", async () => {
    const [g, p] = await game();
    const f = g.config().food();
    const core = g.ref(15, 15);
    p.setCore(core);
    p.setDensity(core, f.popPerDensity);
    const farm = g.ref(20, 20);
    p.buildUnit(UnitType.Farmland, farm, {});
    p.setFarmMaturity(farm, 1000);
    setPopulation(p, 3_000_000);
    for (let i = 0; i < 100; i++) growUrbanArea(g, p, supplyField(g, p));
    expect(p.urbanArea()).toBeGreaterThan(1); // grows when not boxed by fields
  });
});

/**
 * order-independent-economy-accumulation, requirement "Suitability-driven
 * spatial growth": the candidate pool is placed in a canonical order before each
 * draw, so placement is a function of the field's CONTENTS, not of how the
 * field was built.
 *
 * `weightedPick` walks its pool accumulating weight until it passes the random
 * draw, so the pool's ORDER decides which tile comes out. The frontier inherited
 * its order from the supply field's `Map`, which inherited it from the BFS
 * insertion sequence — so the city depended on the shape of a hash table.
 *
 * This is the regression test for the divergence that found it: a game A/B'd
 * against an externally computed supply field with bit-identical VALUES still
 * diverged, and re-inserting that field in the simulation's own BFS order took
 * the run from 36/71 matching hashes to 71/71
 * (`.claude/skills/run-openfront/supply-injection-check.mjs`). Here the same
 * experiment runs in-process: identical distances, opposite insertion order.
 */
describe("placement depends on the field, not on how it was built", () => {
  async function grow(reverseSupplyOrder: boolean): Promise<number[]> {
    const [g, p] = await game();
    const f = g.config().food();
    const core = g.ref(15, 15);
    p.setCore(core);
    p.setDensity(core, f.popPerDensity);
    const farm = g.ref(20, 20);
    p.buildUnit(UnitType.Farmland, farm, {});
    p.setFarmMaturity(farm, 1000);
    setPopulation(p, 3_000_000);
    refreshShed(g, p);

    const supply = supplyField(g, p);
    if (reverseSupplyOrder) {
      // Same keys, same distances, opposite insertion order. Nothing about the
      // FIELD changes — only the order a consumer iterating it would see.
      const entries = Array.from(supply.dist.entries()).reverse();
      supply.dist.clear();
      for (const [t, d] of entries) supply.dist.set(t, d);
    }
    for (let i = 0; i < 40; i++) growUrbanArea(g, p, supply);

    const placed: number[] = [];
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        const t = g.ref(x, y);
        if (p.density(t) > 0) placed.push(t);
      }
    }
    return placed;
  }

  test("the same suitability field in a different order grows the same city", async () => {
    const forward = await grow(false);
    const reversed = await grow(true);
    expect(forward.length).toBeGreaterThan(10); // a real city, not just the core
    expect(reversed).toEqual(forward);
  });
});
