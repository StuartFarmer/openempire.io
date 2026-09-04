import { beforeEach, describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import {
  assessUrbanRoom,
  committedStaffing,
  deployableTroops,
  effectiveResidents,
  farmDistrictScore,
  farmLaborRelief,
  farmRampTicks,
  farmSteadyYieldMilli,
  fieldRoomYield,
  fieldStaffingNeed,
  hostileBorderDiscount,
  planningHorizonTicks,
  residentsNear,
  scaledWarShare,
} from "../src/core/execution/utils/EconomyModel";
import {
  climateSuitability,
  farmTick,
} from "../src/core/execution/utils/FarmGrowth";
import { foodTick } from "../src/core/execution/utils/FoodEconomy";
import { PlayerFoodShed } from "../src/core/execution/utils/FoodShed";
import { supplyField } from "../src/core/execution/utils/SupplyField";
import { TribalEconomy } from "../src/core/execution/utils/TribalEconomy";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { LayersFill, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

// Coverage-inert shed: empty ranked/tilled sets, so farmTick applies no
// labor judgement — these tests exercise ripening/spread in isolation.
const inertShed = new PlayerFoodShed();
const founderInfo = new PlayerInfo("founder", PlayerType.Human, null, "f_id");
const flat: LayersFill = () => 200;
/** Crop fertility rises with x; climate staves stay flat and generous. */
const cropGradient: LayersFill = (name, x) =>
  name === "crop" ? Math.min(255, x * 2) : 200;
const barren: LayersFill = (name) => (name === "crop" ? 0 : 200);

/** Cut farm yield so no soil can repay a farm's cost within the horizon. */
class RaiseClaim extends TestConfig {
  override food() {
    return { ...super.food(), fieldClaimMilli: 900 };
  }
}

async function layeredGame(
  fill: LayersFill = flat,
  config: typeof TestConfig = TestConfig,
): Promise<Game> {
  return setup(
    "plains", // 100×100 all land
    { infiniteGold: false, instantBuild: true },
    [founderInfo],
    undefined,
    config,
    true,
    fill,
  );
}

function conquerBlock(
  game: Game,
  player: Player,
  x0: number,
  y0: number,
  w: number,
  h = w,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) player.conquer(game.ref(x, y));
  }
}

/** Run queued ConstructionExecutions to completion (instantBuild games). */
function settleExecutions(game: Game, ticks = 3): void {
  for (let i = 0; i < ticks; i++) game.executeNextTick();
}

/** Plots are awarded, not bought (rework-settlement-ecology): give the
 *  planner a seed bank so these tests exercise SITING only. */
function grantSeeds(p: Player, farms = 100, settlements = 100): void {
  const impl = p as Player & { _farmSeeds: number; _settlementSeeds: number };
  impl._farmSeeds = farms;
  impl._settlementSeeds = settlements;
}

describe("EconomyModel — pure math (add-greedy-economy-planner)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(founderInfo.id);
  });

  test("closed-form ramp matches the sim's iterated farmTick", () => {
    conquerBlock(game, player, 10, 10, 20);
    const t = game.ref(15, 15);
    const suit = climateSuitability(game, t);
    expect(suit).toBeGreaterThan(0.5);

    // Ripen a real farm with the sim's own tick and count how long it takes
    // to settle at its suitability asymptote.
    player.buildUnit(UnitType.Farmland, t, {});
    const targetMilli = Math.floor(Math.min(suit, 0.95) * 1000);
    let iterated = 0;
    while (player.farmMaturity(t) < targetMilli && iterated < 1000) {
      farmTick(game, player, inertShed);
      iterated++;
    }
    expect(iterated).toBeLessThan(1000);

    // The Gompertz closed form predicts the discrete iteration's tick count
    // (Euler discretization error stays well within 30%).
    const predicted = farmRampTicks(game.config().food(), suit);
    expect(Math.abs(iterated - predicted)).toBeLessThanOrEqual(
      Math.max(8, predicted * 0.3),
    );
  });

  test("model-predicted steady yield matches realized sim production", () => {
    conquerBlock(game, player, 10, 10, 20);
    const t = game.ref(15, 15);
    player.buildUnit(UnitType.Farmland, t, {});
    const predictedMilli = farmSteadyYieldMilli(game, player, t);
    expect(predictedMilli).toBeGreaterThan(0);

    // Run the real food tick until the farm has fully settled, then compare
    // the sim's realized production to the prediction. foodTick advances
    // maturity itself; 300 ticks is far past the ramp.
    for (let i = 0; i < 300; i++) foodTick(game, player);
    const realized = player.foodFlow().production; // display units
    const predicted = Math.floor(predictedMilli / 1000);
    // Within rounding: maturity is stored in milli, so the realized yield can
    // differ by the sub-milli remainder only.
    expect(Math.abs(realized - predicted)).toBeLessThanOrEqual(1);
  });

  test("room yield orders by the field a site can grow", async () => {
    const g = await layeredGame(cropGradient);
    const p = g.player(founderInfo.id);
    // Tall enough that every scout window below sits fully inside owned
    // land — otherwise ownership edges, not the plot, decide the room.
    conquerBlock(g, p, 10, 38, 80, 14);

    // Fertility: richer surroundings score higher, everything else equal.
    const poor = fieldRoomYield(g, p, g.ref(20, 45)).yieldMilli;
    const rich = fieldRoomYield(g, p, g.ref(80, 45)).yieldMilli;
    expect(rich).toBeGreaterThan(poor);

    // A nucleus prefers OPEN ground: a site whose scout window overlaps an
    // existing plot loses that ground from its room (fields grow, §1b —
    // planting beside your own farm wastes spreadable land).
    p.buildUnit(UnitType.Farmland, g.ref(60, 44), {});
    const adjacent = fieldRoomYield(g, p, g.ref(60, 45)).yieldMilli;
    const isolated = fieldRoomYield(g, p, g.ref(60, 48)).yieldMilli;
    expect(adjacent).toBeLessThan(isolated);
  });

  test("dead ground scores zero — a nucleus that can't claim is worthless", async () => {
    const g = await layeredGame(barren);
    const p = g.player(founderInfo.id);
    conquerBlock(g, p, 10, 10, 20);
    expect(fieldRoomYield(g, p, g.ref(15, 15)).yieldMilli).toBe(0);
    // Even with a whole town's labor on hand, no room means no field.
    expect(farmDistrictScore(g, p, g.ref(15, 15), 100_000)).toBe(0);
  });

  test("a knob re-tune flips the optimum with no planner changes", async () => {
    // Same tile, same layers: viable at the default claim threshold…
    conquerBlock(game, player, 10, 10, 20);
    expect(
      fieldRoomYield(game, player, game.ref(15, 15)).yieldMilli,
    ).toBeGreaterThan(0);

    // …dead when the claim threshold is raised past the ground's ceiling
    // (maturity settles AT suitability, so the nucleus could never claim).
    const g = await layeredGame(flat, RaiseClaim);
    const p = g.player(founderInfo.id);
    conquerBlock(g, p, 10, 10, 20);
    expect(fieldRoomYield(g, p, g.ref(15, 15)).yieldMilli).toBe(0);
  });

  test("labor caps the district: a town in reach beats the empty frontier", () => {
    const f = game.config().food();
    conquerBlock(game, player, 10, 40, 40, 10);
    // A town: one full city tile near the near site, nothing near the far.
    player.setDensity(game.ref(15, 45), f.popPerDensity);
    const near = game.ref(18, 45);
    const far = game.ref(40, 45);

    expect(residentsNear(game, player, near)).toBeGreaterThan(0);
    expect(residentsNear(game, player, far)).toBe(0);

    const nearScore = farmDistrictScore(
      game,
      player,
      near,
      residentsNear(game, player, near),
    );
    const farScore = farmDistrictScore(
      game,
      player,
      far,
      residentsNear(game, player, far),
    );
    expect(nearScore).toBeGreaterThan(0);
    expect(farScore).toBe(0); // nobody to till it — the coverage gate

    // PAIRED labor (D-DP2): the town the seed founds is the labor stake,
    // so the same frontier site prices its full room.
    expect(
      farmDistrictScore(game, player, far, f.popPerDensity),
    ).toBeGreaterThan(0);
  });

  test("a rival border discounts a seed site; the interior does not", async () => {
    const enemyInfo = new PlayerInfo("rival", PlayerType.Human, null, "e_id");
    const g = await setup(
      "plains",
      { infiniteGold: false, instantBuild: true },
      [founderInfo, enemyInfo],
      undefined,
      TestConfig,
      true,
      flat,
    );
    const p = g.player(founderInfo.id);
    const enemy = g.player(enemyInfo.id);
    conquerBlock(g, p, 10, 10, 20);
    conquerBlock(g, enemy, 32, 10, 10, 20); // adjacent front at x = 32

    const frontier = g.ref(29, 15); // 3 tiles from rival ground
    const interior = g.ref(12, 15); // no rival in scan reach
    expect(hostileBorderDiscount(g, p, frontier)).toBeLessThan(1);
    expect(hostileBorderDiscount(g, p, interior)).toBe(1);
    // Wilderness never discounts — expansion room is where districts belong.
    expect(hostileBorderDiscount(g, p, g.ref(10, 25))).toBe(1);
  });

  test("labor relief is the marginal field a town's people unlock", () => {
    conquerBlock(game, player, 10, 10, 20);
    const t = game.ref(15, 15);
    player.buildUnit(UnitType.Farmland, t, {});

    // Nobody lives near the farm: a town's worth of residents unlocks the
    // whole room, so the relief equals the fully-staffed district score.
    const empty = new PlayerFoodShed();
    const relief = farmLaborRelief(game, player, empty, t);
    expect(relief).toBeGreaterThan(0);
    expect(relief).toBe(
      farmDistrictScore(game, player, t, game.config().food().popPerDensity),
    );

    // A fully-staffed (room-bound) field wants no town: zero marginal.
    const staffed = new PlayerFoodShed();
    staffed.peopleByFarm.set(t, 1_000_000);
    expect(farmLaborRelief(game, player, staffed, t)).toBe(0);
  });

  test("committed staffing dedupes the pool: a site by a worked field has no free hands", () => {
    const f = game.config().food();
    conquerBlock(game, player, 10, 10, 30);
    // A worked farm: its cell holds exactly its own staffing need.
    const farmTile = game.ref(20, 20);
    player.buildUnit(UnitType.Farmland, farmTile, {});
    const shed = new PlayerFoodShed();
    shed.peopleByFarm.set(farmTile, 2 * f.farmersPerFieldTile);
    // 1 acre (the nucleus) + 1 expansion slot, capped at the cell's people.
    const committed = committedStaffing(game, player, shed);
    expect(committed.get(farmTile)).toBe(2 * f.farmersPerFieldTile);

    // A town lives beside the farm; every hand it houses is spoken for.
    player.setDensity(game.ref(21, 21), 2 * f.farmersPerFieldTile);
    const nearSite = game.ref(23, 20);
    expect(residentsNear(game, player, nearSite)).toBeGreaterThan(0);
    expect(effectiveResidents(game, player, nearSite, committed)).toBe(
      Math.max(
        0,
        residentsNear(game, player, nearSite) - committed.get(farmTile)!,
      ),
    );

    // Out of the farm's labor window, nothing is subtracted.
    player.setDensity(game.ref(38, 38), 1000);
    const farSite = game.ref(37, 37);
    expect(effectiveResidents(game, player, farSite, committed)).toBe(
      residentsNear(game, player, farSite),
    );
  });

  test("the attack reserve is the tilled set's staffing", () => {
    const f = game.config().food();
    const shed = new PlayerFoodShed();
    expect(fieldStaffingNeed(game, player, shed)).toBe(0);
    shed.tilled.add(game.ref(1, 1));
    shed.tilled.add(game.ref(2, 2));
    shed.tilled.add(game.ref(3, 3));
    expect(fieldStaffingNeed(game, player, shed)).toBe(
      3 * f.farmersPerFieldTile,
    );
  });

  test("war share bounds total deployment by the LIVING population (10.6)", () => {
    const f = game.config().food();
    player.setTroops(5000);
    // Nothing deployed: the full share is available — and it is a share of
    // the population, not of the housing-based maxTroops. The share itself
    // is food-runway scaled (rework-ai-war-strategy D8), so compare against
    // the scaled share, not the raw maxWarShare.
    expect(deployableTroops(game, player)).toBe(
      Math.floor(5000 * scaledWarShare(f, player)),
    );
    // Deployment in flight counts against the share.
    game.addExecution(new AttackExecution(1000, player, null));
    game.executeNextTick(); // attack becomes an outgoing deployment
    const idle = player.troops();
    const deployed = player
      .outgoingAttacks()
      .reduce((a, at) => a + at.troops(), 0);
    expect(deployed).toBeGreaterThan(0);
    expect(deployableTroops(game, player)).toBe(
      Math.max(
        0,
        Math.floor((idle + deployed) * scaledWarShare(f, player)) - deployed,
      ),
    );
  });

  test("horizon and ramp are derived and self-consistent", () => {
    const f = game.config().food();
    // The horizon is twice the slowest ramp, so even a perfect tile spends
    // half the horizon mature — the best soil can never price negative on
    // ramp time alone.
    expect(planningHorizonTicks(f)).toBe(Math.round(2 * farmRampTicks(f, 1)));
    expect(farmRampTicks(f, 0.9)).toBeLessThan(farmRampTicks(f, 0.95));
    // At/below the seed maturity there is nothing to ramp.
    expect(farmRampTicks(f, f.farmSeedMilli / 1000)).toBe(0);
  });
});

describe("TribalEconomy — greedy planner policy", () => {
  test("plants farms on fertile land at the model's preferred sites", async () => {
    const game = await layeredGame();
    const player = game.player(founderInfo.id);
    conquerBlock(game, player, 10, 10, 30);
    player.addFood(100_000n);

    grantSeeds(player);
    const economy = new TribalEconomy(new PseudoRandom(42), game, player);
    // Settle each pulse's construction before the next so sampling sees the
    // built plots (and canBuild filters occupied tiles).
    for (let i = 0; i < 5; i++) {
      expect(economy.tryBuild(1)).toBe(1);
      settleExecutions(game);
    }
    expect(player.units(UnitType.Farmland).length).toBe(5);
  });

  test("banked seeds stay banked when every site is dead ground", async () => {
    const game = await layeredGame(barren);
    const player = game.player(founderInfo.id);
    conquerBlock(game, player, 10, 10, 30);

    grantSeeds(player);
    const economy = new TribalEconomy(new PseudoRandom(42), game, player);
    expect(economy.tryBuild(5)).toBe(0);
    settleExecutions(game);
    expect(player.units(UnitType.Farmland).length).toBe(0);
  });

  test("founds a settlement when the city outgrows its placeable room", async () => {
    const game = await layeredGame();
    const player = game.player(founderInfo.id);
    const f = game.config().food();

    // Home block with the founded core: the supply field covers only this.
    conquerBlock(game, player, 5, 5, 10);
    player.setCore(game.ref(10, 10));
    // A disconnected far block with an unserved farm belt — no owned path, so
    // the supply BFS cannot reach it: pure new room for a settlement.
    conquerBlock(game, player, 70, 70, 20);
    for (let i = 0; i < 3; i++) {
      player.buildUnit(UnitType.Farmland, game.ref(75 + i * 3, 75), {});
    }
    // Food capacity far above what the home block can house.
    (
      player as Player & { _foodFlow: { capacity: number } }
    )._foodFlow.capacity = f.popPerDensity * 500;
    player.addFood(100_000n);

    const supply = supplyField(game, player);
    const room = assessUrbanRoom(game, player, supply);
    expect(room.deficit).toBeGreaterThan(0);

    grantSeeds(player);
    const economy = new TribalEconomy(new PseudoRandom(7), game, player);
    expect(economy.tryBuild(1)).toBe(1);
    settleExecutions(game);
    const settlements = player.units(UnitType.Settlement);
    expect(settlements.length).toBe(1);
    // Sited where the room is: in the unserved far block, not the home block.
    const s = settlements[0].tile();
    expect(game.x(s)).toBeGreaterThanOrEqual(60);
    expect(game.y(s)).toBeGreaterThanOrEqual(60);
  });

  test("a banked pair founds a district — no room starvation required", async () => {
    const game = await layeredGame();
    const player = game.player(founderInfo.id);

    // Fertile owned land, nobody housed anywhere: a lone farm seed would
    // price zero (no labor), and the old deficit trigger never fires.
    conquerBlock(game, player, 10, 10, 30);
    const supply = supplyField(game, player);
    expect(assessUrbanRoom(game, player, supply).deficit).toBe(0);

    grantSeeds(player, 1, 1); // exactly one founding pair
    const economy = new TribalEconomy(new PseudoRandom(11), game, player);
    expect(economy.tryBuild(1)).toBe(1);
    settleExecutions(game);

    // The pair placed TOGETHER: town + field, farm in the standoff collar.
    const settlements = player.units(UnitType.Settlement);
    const farms = player.units(UnitType.Farmland);
    expect(settlements.length).toBe(1);
    expect(farms.length).toBe(1);
    const s = settlements[0].tile();
    const t = farms[0].tile();
    const dist = Math.max(
      Math.abs(game.x(s) - game.x(t)),
      Math.abs(game.y(s) - game.y(t)),
    );
    expect(dist).toBeGreaterThanOrEqual(2);
    expect(dist).toBeLessThanOrEqual(4);
    expect(player.farmSeeds()).toBe(0);
    expect(player.settlementSeeds()).toBe(0);
  });

  test("a lone settlement seed staffs a labor-starved field", async () => {
    const game = await layeredGame();
    const player = game.player(founderInfo.id);
    const f = game.config().food();

    conquerBlock(game, player, 10, 10, 30);
    // An existing farm with spreadable room and NOBODY in labor reach —
    // its field is capped at zero coverage until a town arrives.
    const farmTile = game.ref(25, 25);
    player.buildUnit(UnitType.Farmland, farmTile, {});

    grantSeeds(player, 0, 1); // settlement seed only — no pair possible
    const supply = supplyField(game, player);
    expect(assessUrbanRoom(game, player, supply).deficit).toBe(0);

    const economy = new TribalEconomy(new PseudoRandom(5), game, player);
    expect(economy.tryBuild(1)).toBe(1);
    settleExecutions(game);

    const settlements = player.units(UnitType.Settlement);
    expect(settlements.length).toBe(1);
    // Founded inside the starved farm's food-shed — labor relief, not room.
    const s = settlements[0].tile();
    const dist = Math.max(
      Math.abs(game.x(s) - game.x(farmTile)),
      Math.abs(game.y(s) - game.y(farmTile)),
    );
    expect(dist).toBeLessThanOrEqual(f.foodShedRadius);
    expect(player.units(UnitType.Farmland).length).toBe(1); // no farm seed spent
  });

  test("deterministic: same state and seed choose the same builds", async () => {
    const runs: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const game = await layeredGame(cropGradient);
      const player = game.player(founderInfo.id);
      conquerBlock(game, player, 10, 10, 40);
      player.addFood(100_000n);
      grantSeeds(player);
      const economy = new TribalEconomy(new PseudoRandom(123), game, player);
      economy.tryBuild(4);
      settleExecutions(game);
      runs.push(
        player
          .units(UnitType.Farmland)
          .map((u) => `${game.x(u.tile())},${game.y(u.tile())}`)
          .sort(),
      );
    }
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[0].length).toBeGreaterThan(0);
  });
});
