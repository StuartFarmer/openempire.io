import { beforeEach, describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { setDistrictYieldProvider } from "../src/core/execution/utils/FoodEconomy";
import { foodShedField } from "../src/core/execution/utils/FoodShed";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

/**
 * The layered-map economy under the urban-core-growth HYBRID: the player still
 * paints Farmland (food) and Barns (storage), while the CITY sprawls itself
 * from a founded Core as a density field that sets the population cap. Sprawl
 * mechanics proper are in UrbanGrowth.test.ts; here we test the food economy
 * and its coupling to the sprawl (production, population cap, founding,
 * razing, starvation).
 */

const CROP = 200;
const flatLayers = () => CROP;
const humanInfo = new PlayerInfo("eater", PlayerType.Human, null, "eater_id");
const rivalInfo = new PlayerInfo("rival", PlayerType.Human, null, "rival_id");

async function layeredGame(): Promise<Game> {
  return setup(
    "plains",
    { infiniteGold: false, instantBuild: true },
    [humanInfo, rivalInfo],
    undefined,
    undefined,
    true,
    flatLayers,
  );
}

function activate(game: Game, ...players: Player[]): void {
  for (const p of players) game.addExecution(new PlayerExecution(p));
  game.executeNextTick();
}

function conquerBlock(
  game: Game,
  player: Player,
  x0: number,
  y0: number,
  size: number,
): void {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) player.conquer(game.ref(x, y));
  }
}

/** Found a Core and seed sprawl density of `area` tiles around (cx,cy). */
function foundSprawl(
  game: Game,
  player: Player,
  cx: number,
  cy: number,
  size: number,
): void {
  player.setCore(game.ref(cx, cy));
  const half = Math.floor(size / 2);
  for (let y = cy - half; y < cy - half + size; y++) {
    for (let x = cx - half; x < cx - half + size; x++) {
      player.setDensity(game.ref(x, y), game.config().food().popPerDensity);
    }
  }
}

function flow(player: Player): {
  production: number;
  consumption: number;
  starvedTroops: number;
} {
  return (player as Player & { _foodFlow: ReturnType<typeof flow> })._foodFlow;
}

describe("Urban economy (add-urban-core-growth)", () => {
  let game: Game;
  let player: Player;
  let rival: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(humanInfo.id);
    rival = game.player(rivalInfo.id);
  });

  test("food comes from painted Farmland, not from the city sprawl", () => {
    // A dense sprawl with NO farms produces nothing; painting Farmland does.
    conquerBlock(game, player, 0, 0, 20);
    player.setTroops(0);
    foundSprawl(game, player, 10, 10, 4);
    player.addFood(10_000n);
    activate(game, player);
    game.executeNextTick();
    expect(flow(player).production).toBe(0); // sprawl alone → no food

    // Mature farms (maturity is exercised in FarmGrowth.test.ts) so the yield
    // clears the display-food floor. Production keys off the shed's TILLED
    // set (§1b), which refreshes on the supply cadence — tick past it.
    player.buildUnit(UnitType.Farmland, game.ref(15, 10), {});
    player.buildUnit(UnitType.Farmland, game.ref(16, 10), {});
    player.setFarmMaturity(game.ref(15, 10), 1000);
    player.setFarmMaturity(game.ref(16, 10), 1000);
    const period = game.config().food().supplyRefreshTicks + 1;
    for (let i = 0; i < period; i++) game.executeNextTick();
    expect(flow(player).production).toBeGreaterThan(0);
  });

  test("storage is grown from stable farmland, never built (4.3)", () => {
    conquerBlock(game, player, 0, 0, 12);
    player.setTroops(0);
    const f = game.config().food();

    // The camp stock clamps to baseStorage — there is nothing to build
    // past it (the Barn is gone; plotSpawn refuses it outright).
    player.addFood(BigInt(f.baseStorage * 2));
    activate(game, player);
    game.executeNextTick();
    expect(player.food()).toBeLessThanOrEqual(BigInt(f.baseStorage));
    expect(player.canBuild(UnitType.Barn, game.ref(1, 1))).toBe(false);

    // A mature field on TENURE-ZERO ground banks nothing: its granary
    // capacity is grown from stability, and it has none yet.
    const nucleus = game.ref(1, 1);
    player.buildUnit(UnitType.Farmland, nucleus, {});
    player.setFarmMaturity(nucleus, 1000);
    player.setFoodPopulationShare(0); // bank everything
    const stocks = (
      player as Player & { _fieldStockMilli: Map<number, number> }
    )._fieldStockMilli;
    for (let i = 0; i < 15; i++) game.executeNextTick();
    expect(stocks.get(nucleus) ?? 0).toBe(0);

    // Deep tenure on the same tile → the district granary fills.
    game.setTileTenure(nucleus, 10_000_000); // plateau
    for (let i = 0; i < 15; i++) game.executeNextTick();
    expect(stocks.get(nucleus) ?? 0).toBeGreaterThan(0);
  });

  test("population cap scales with the built urban sprawl", () => {
    const f = game.config().food();
    conquerBlock(game, player, 0, 0, 10);
    player.setCore(game.ref(5, 5));
    player.setDensity(game.ref(5, 5), game.config().food().popPerDensity);
    expect(game.config().maxTroops(player)).toBe(
      f.basePopulation + 1 * f.popPerDensity,
    );

    let n = 1;
    for (const [x, y] of [
      [4, 5],
      [6, 5],
      [5, 4],
      [5, 6],
    ]) {
      player.setDensity(game.ref(x, y), game.config().food().popPerDensity);
      n++;
    }
    expect(game.config().maxTroops(player)).toBe(
      f.basePopulation + n * f.popPerDensity,
    );
  });

  test("spawning founds a Core, seeds sprawl, and paints starter Farmland", async () => {
    const g = await setup(
      "plains",
      { instantBuild: true },
      [humanInfo],
      undefined,
      undefined,
      false, // keep the spawn phase — SpawnExecution drives it
      flatLayers,
    );
    const p = g.player(humanInfo.id);
    const f = g.config().food();
    g.addExecution(new SpawnExecution("core_game", p.info(), g.ref(20, 20)));
    g.executeNextTick();
    g.executeNextTick();

    expect(p.core()).not.toBeNull();
    expect(p.density(p.core()!)).toBeGreaterThan(0);
    expect(p.units(UnitType.Farmland).length).toBeGreaterThan(0); // starter kit
    expect(p.food()).toBe(BigInt(f.startingFood)); // founding is free

    // Idle: the starter nucleus is a village seed — the field SPREADS
    // (§1b) while the population grows toward what it carries, so a lone
    // spawn kit becomes a fed 1-tile village. The ramp is the spread, so
    // give it time (the old 3-farm kit fed instantly; the pair does not).
    for (let i = 0; i < 400; i++) g.executeNextTick();
    expect(p.isAlive()).toBe(true);
    expect(p.urbanArea()).toBeGreaterThanOrEqual(1);
  });

  test("a farm-fed population grows and its city sprawls with it", () => {
    conquerBlock(game, player, 0, 0, 30);
    player.setCore(game.ref(15, 15));
    player.setDensity(game.ref(15, 15), game.config().food().popPerDensity);
    // Feed it heavily: two mature farm belts → a big food surplus → births →
    // the population grows, and the city footprint tracks it.
    for (let y = 5; y <= 6; y++)
      for (let x = 3; x < 28; x++) {
        const t = game.ref(x, y);
        player.buildUnit(UnitType.Farmland, t, {});
        player.setFarmMaturity(t, 1000);
      }
    player.setTroops(2000); // a starting population (not zero — that would die out)
    player.addFood(20_000n);
    activate(game, player);
    const popBefore = player.troops();
    const areaBefore = player.urbanArea();
    for (let i = 0; i < 200; i++) game.executeNextTick();
    expect(player.troops()).toBeGreaterThan(popBefore); // surplus → births
    expect(player.urbanArea()).toBeGreaterThan(areaBefore); // city grew with them
  });

  test("war razing: capturing a district clears its sprawl density", () => {
    conquerBlock(game, rival, 37, 37, 6); // rival owns the district
    foundSprawl(game, rival, 40, 40, 6);
    const rivalPeak = rival.urbanArea();
    expect(rivalPeak).toBeGreaterThan(1);

    conquerBlock(game, player, 37, 37, 6);
    expect(rival.urbanArea()).toBeLessThan(rivalPeak);
    let captorDensity = 0;
    for (const [, d] of player.densityEntries()) captorDensity += d;
    expect(captorDensity).toBe(0); // captor gets raw, unbuilt land
  });

  test("troops deployed in attacks starve too — no famine shelter", () => {
    conquerBlock(game, player, 0, 0, 8);
    conquerBlock(game, rival, 40, 40, 8);
    player.setCore(game.ref(4, 4));
    rival.setCore(game.ref(44, 44));
    player.setTroops(20_000);
    rival.setTroops(20_000);
    player.removeFood(player.food());
    rival.removeFood(rival.food());
    activate(game, player, rival);

    game.addExecution(new AttackExecution(18_000, rival, null));
    for (let i = 0; i < 200; i++) game.executeNextTick();

    const rivalTotal =
      rival.troops() +
      rival.outgoingAttacks().reduce((a, at) => a + at.troops(), 0);
    expect(player.troops()).toBeLessThan(20_000);
    expect(rivalTotal).toBeLessThan(20_000);
  });

  /**
   * A nation whose population sits at HALF its farm capacity (so births offset
   * old-age deaths, but there is no big surplus to spare) commits a wave that
   * expands into open land — keeping a large deployed cohort in the field whose
   * fight-consumption (×40/troop) alone exceeds total production. Runs `ticks`
   * ticks, tracking the LOW-WATER civilian idle pool (the pre-fix requisition
   * zeroed civilian food and cratered idle within ~10 ticks, before the wave
   * decayed and the survivors regrew — so the collapse only shows at the dip).
   */
  function deployWaveAtCeiling(
    fraction: number,
    ticks: number,
  ): { idleAtDeploy: number; minIdle: number; wave: number; deployed: number } {
    conquerBlock(game, player, 0, 0, 20);
    player.setCore(game.ref(9, 12));
    for (let y = 3; y <= 5; y++)
      for (let x = 2; x < 18; x++) {
        const t = game.ref(x, y);
        player.buildUnit(UnitType.Farmland, t, {});
        player.setFarmMaturity(t, 1000);
      }
    player.setTroops(500);
    player.removeFood(player.food());
    activate(game, player);
    for (let i = 0; i < 40; i++) game.executeNextTick(); // production settles
    const capacity = player.foodFlow().capacity;
    player.setTroops(Math.floor(capacity / 2)); // half the ceiling
    for (let i = 0; i < 8; i++) game.executeNextTick();
    const peaceIdle = player.troops();

    const wave = Math.floor(peaceIdle * fraction);
    game.addExecution(
      new AttackExecution(wave, player, game.terraNullius().id()),
    );
    game.executeNextTick(); // the attack pulls the wave out of the idle pool
    const idleAtDeploy = player.troops();
    let minIdle = idleAtDeploy;
    for (let i = 0; i < ticks; i++) {
      game.executeNextTick();
      minIdle = Math.min(minIdle, player.troops());
    }
    const deployed = player
      .outgoingAttacks()
      .reduce((a, at) => a + at.troops(), 0);
    return { idleAtDeploy, minIdle, wave, deployed };
  }

  test("deploying a large army does not starve the civilians (civilians-eat-before-war)", () => {
    const r = deployWaveAtCeiling(0.7, 30);
    // Civilians keep eating their district production: the idle pool never
    // craters (pre-fix it fell ~75% within ~10 ticks).
    expect(r.minIdle).toBeGreaterThan(r.idleAtDeploy * 0.6);
  });

  test("an over-deployed army thins itself, not the nation (civilians-eat-before-war)", () => {
    const r = deployWaveAtCeiling(0.7, 30);
    // The deployed cohort spent itself in the field…
    expect(r.deployed).toBeLessThan(r.wave);
    // …while the civilian idle pool held throughout.
    expect(r.minIdle).toBeGreaterThan(r.idleAtDeploy * 0.6);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(humanInfo.id);
      conquerBlock(g, p, 0, 0, 20);
      foundSprawl(g, p, 10, 10, 2);
      for (let x = 2; x < 18; x++)
        p.buildUnit(UnitType.Farmland, g.ref(x, 2), {});
      p.setTroops(500);
      p.addFood(1_234n);
      activate(g, p);
      for (let i = 0; i < 60; i++) g.executeNextTick();
      return { food: p.food(), troops: p.troops(), area: p.urbanArea() };
    };
    expect(await run()).toEqual(await run());
  });

  test("a fed population grows toward its food capacity and holds there", () => {
    conquerBlock(game, player, 0, 0, 20);
    player.setCore(game.ref(10, 10));
    for (let x = 2; x < 14; x++) {
      player.buildUnit(UnitType.Farmland, game.ref(x, 2), {});
      player.setFarmMaturity(game.ref(x, 2), 1000);
    }
    player.setTroops(500);
    player.addFood(50_000n);
    activate(game, player);
    const start = player.troops();
    for (let i = 0; i < 300; i++) game.executeNextTick();
    // Births on the food surplus grew the population…
    expect(player.troops()).toBeGreaterThan(start);
    // …but never past what the farms feed (the headroom clamp).
    expect(player.troops()).toBeLessThanOrEqual(
      player.foodFlow().capacity + 50,
    );
  });

  test("a nation whose population starves to nothing is eliminated", async () => {
    class ShortLife extends TestConfig {
      override food() {
        return { ...super.food(), avgLifespanTicks: 80 };
      }
    }
    const g = await setup(
      "plains",
      { instantBuild: true },
      [humanInfo],
      undefined,
      ShortLife,
      true,
      flatLayers,
    );
    const p = g.player(humanInfo.id);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) p.conquer(g.ref(x, y));
    p.setCore(g.ref(4, 4));
    p.setSpawnTile(g.ref(4, 4));
    p.setTroops(400);
    p.removeFood(p.food()); // no stock, no farms → total, permanent starvation
    g.addExecution(new PlayerExecution(p));
    expect(p.isAlive()).toBe(true);

    for (let i = 0; i < 400; i++) g.executeNextTick();
    // The population dies out and the nation is gone — even though it never lost
    // a battle; its land reverts to neutral.
    expect(p.isAlive()).toBe(false);
  });
});

describe("Baked layered fixture", () => {
  test("tribalsmall loads its layers.bin through setup()", async () => {
    const game = await setup("tribalsmall", {}, [humanInfo]);
    const crops = new Set<number>();
    const water = new Set<number>();
    let maxWater = 0;
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 64; x += 4) {
        crops.add(game.layer("crop", game.ref(x, y)));
        const w = game.layer("water", game.ref(x, y));
        water.add(w);
        maxWater = Math.max(maxWater, w);
      }
    }
    expect(crops.size).toBeGreaterThan(1);
    expect(water.size).toBeGreaterThan(1);
    expect(maxWater).toBeGreaterThan(0);
  });
});

/**
 * order-independent-economy-accumulation, requirement "Food stock is
 * deterministic integer state": a total accumulated over a SET of tiles is a
 * function of the set, not of the order it is traversed in.
 *
 * `foodTick` used to sum each tile's yield and storage capacity as floats and
 * floor at the end. Float addition is not associative, so a district's total
 * depended on the order `shed.tilled` happened to yield — an artifact of Set
 * insertion, i.e. of the BFS. Rounding each tile's contribution to integer
 * milli first makes the sum associative, so any producer (including a GPU
 * atomic add completing in arbitrary order) reaches the same total.
 *
 * The tilled set is BUILT here rather than grown: this is a property of the
 * accumulation, and a naturally grown field in a 20x20 fixture is six nuclei —
 * far too few varied terms to say anything. Varied maturity and varied tenure
 * give varied fractional yield and capacity terms, which is what the property
 * is about.
 *
 * HONEST LIMIT: this does not detect the specific float version it replaced.
 * That was checked — reverting `foodTick` to float accumulators and end-rounding
 * leaves this test green, because at these magnitudes 60 doubles summed in
 * either direction agree, and the reported figure is floored by 1000 anyway, so
 * a few milli of per-term rounding never surfaces. The change's observable
 * justification is the FRONTIER ORDER (see LandUseZoning.test.ts); the
 * accumulation's justification is the invariant — integer, associative,
 * reproducible by a parallel reducer. This test guards that invariant against
 * future regression (a cell-keyed Map, a float accumulator over wider
 * magnitudes), which is a real job, but it is not a witness to the old bug.
 */
describe("district totals are order-independent (integer accumulation)", () => {
  const growingClimate = (n: string) => (n === "temperature" ? 153 : 255);

  async function districtTotals(reverseTilled: boolean): Promise<{
    production: number;
    capacity: number;
    tiles: number;
  }> {
    const game = await setup(
      "plains",
      { infiniteGold: false, instantBuild: true },
      [humanInfo],
      undefined,
      undefined,
      true,
      growingClimate,
    );
    const player = game.player(humanInfo.id);
    conquerBlock(game, player, 0, 0, 20);
    player.buildUnit(UnitType.Farmland, game.ref(10, 10), {});
    player.setFarmMaturity(game.ref(10, 10), 1000);
    player.setTroops(4000);
    activate(game, player);
    const period = game.config().food().supplyRefreshTicks;
    for (let i = 0; i < period * 2; i++) game.executeNextTick();

    // Force a fresh flood, then hand the next tick a large, varied tilled set.
    // The next tick is inside the cadence, so nothing recomputes over it.
    const shed = foodShedField(game, player) as unknown as {
      lastCalcTick: number;
      tilled: Set<number>;
      tiles: number[];
      cellIndexAt(t: number): number;
    };
    shed.lastCalcTick = -1;
    foodShedField(game, player);

    const covered = shed.tiles.filter((t) => shed.cellIndexAt(t) >= 0);
    expect(covered.length).toBeGreaterThan(40);
    const chosen = covered.slice(0, 60);
    chosen.forEach((t, i) => {
      // Maturity and tenure both vary per tile, so every term carries a
      // different fractional part.
      player.setFarmMaturity(t, 137 + ((i * 97) % 800));
      game.setTileTenure(t, 3_000 + ((i * 7919) % 90_000));
    });
    shed.tilled.clear();
    const order = reverseTilled ? chosen.slice().reverse() : chosen;
    for (const t of order) shed.tilled.add(t);

    game.executeNextTick();
    const f = flow(player) as unknown as {
      production: number;
      capacity: number;
    };
    return {
      production: f.production,
      capacity: f.capacity,
      tiles: chosen.length,
    };
  }

  test("production and capacity totals do not depend on the traversal order", async () => {
    const forward = await districtTotals(false);
    const reversed = await districtTotals(true);
    expect(forward.tiles).toBe(60);
    expect(forward.production).toBeGreaterThan(0);
    expect(forward.capacity).toBeGreaterThan(0);
    expect(reversed.production).toBe(forward.production);
    expect(reversed.capacity).toBe(forward.capacity);
  });
});

/**
 * The district-yield seam (`setDistrictYieldProvider`).
 *
 * `src/core` may not import client code, so a compute-shader ledger cannot be a
 * branch inside `foodTick` — it has to be something the outside offers. What
 * this pins is the CONTRACT the sim depends on: a provider that declines must
 * leave the simulation exactly as it was, so a provider that is not ready (or
 * is wrong) degrades instead of corrupting the game.
 */
describe("district yield can be supplied from outside", () => {
  test("a declining provider leaves production identical", async () => {
    const run = async (install: boolean): Promise<number> => {
      const game = await layeredGame();
      const player = game.player(humanInfo.id);
      conquerBlock(game, player, 0, 0, 20);
      player.buildUnit(UnitType.Farmland, game.ref(10, 10), {});
      player.setFarmMaturity(game.ref(10, 10), 1000);
      player.setTroops(3000);
      if (install) {
        setDistrictYieldProvider({
          fill: () => null, // always declines
        });
      }
      activate(game, player);
      const period = game.config().food().supplyRefreshTicks;
      for (let i = 0; i < period * 3; i++) game.executeNextTick();
      setDistrictYieldProvider(null);
      return flow(player).production;
    };
    const without = await run(false);
    const declining = await run(true);
    expect(without).toBeGreaterThan(0);
    expect(declining).toBe(without);
  });

  test("a supplying provider's totals reach the economy", async () => {
    const game = await layeredGame();
    const player = game.player(humanInfo.id);
    conquerBlock(game, player, 0, 0, 20);
    player.buildUnit(UnitType.Farmland, game.ref(10, 10), {});
    player.setFarmMaturity(game.ref(10, 10), 1000);
    player.setTroops(3000);
    activate(game, player);
    const period = game.config().food().supplyRefreshTicks;
    for (let i = 0; i < period * 3; i++) game.executeNextTick();
    const cpuProduction = flow(player).production;

    // Serve DOUBLE the yield for every cell; the reported production must
    // follow the provider, not the tilled tiles.
    setDistrictYieldProvider({
      fill: (mg, p, shed, prodByIdx, capByIdx) => {
        let total = 0;
        for (let i = 0; i < shed.farms.length; i++) {
          prodByIdx[i] = 2_000_000;
          capByIdx[i] = 1_000_000;
          total += 2_000_000;
        }
        return total;
      },
    });
    game.executeNextTick();
    setDistrictYieldProvider(null);
    expect(flow(player).production).not.toBe(cpuProduction);
    expect(flow(player).production).toBeGreaterThan(0);
  });
});
