import { beforeEach, describe, expect, test } from "vitest";
import {
  assessUrbanRoom,
  farmRampTicks,
  farmScore,
  farmSteadyYieldMilli,
  planningHorizonTicks,
  wantsBarnInsurance,
} from "../src/core/execution/utils/EconomyModel";
import {
  climateSuitability,
  farmTick,
} from "../src/core/execution/utils/FarmGrowth";
import { foodTick } from "../src/core/execution/utils/FoodEconomy";
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

const founderInfo = new PlayerInfo("founder", PlayerType.Human, null, "f_id");
const flat: LayersFill = () => 200;
/** Crop fertility rises with x; climate staves stay flat and generous. */
const cropGradient: LayersFill = (name, x) =>
  name === "crop" ? Math.min(255, x * 2) : 200;
const barren: LayersFill = (name) => (name === "crop" ? 0 : 200);

/** Cut farm yield so no soil can repay a farm's cost within the horizon. */
class CutYield extends TestConfig {
  override food() {
    return { ...super.food(), farmYieldMilli: 500 };
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
      farmTick(game, player);
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

  test("farm score orders by fertility and by district adjacency", async () => {
    const g = await layeredGame(cropGradient);
    const p = g.player(founderInfo.id);
    conquerBlock(g, p, 10, 40, 80, 10);
    const cost = 40_000; // milli, flat for comparison

    // Fertility: richer soil scores higher, everything else equal.
    const poor = farmScore(g, p, g.ref(20, 45), cost);
    const rich = farmScore(g, p, g.ref(80, 45), cost);
    expect(rich).toBeGreaterThan(poor);

    // District: a tile adjacent to an existing farm outscores the identical
    // tile in isolation (same x ⇒ same fertility and climate).
    p.buildUnit(UnitType.Farmland, g.ref(60, 44), {});
    const adjacent = farmScore(g, p, g.ref(60, 45), cost);
    const isolated = farmScore(g, p, g.ref(60, 48), cost);
    expect(adjacent).toBeGreaterThan(isolated);
  });

  test("barren soil scores negative — no fixed fertility floor needed", async () => {
    const g = await layeredGame(barren);
    const p = g.player(founderInfo.id);
    conquerBlock(g, p, 10, 10, 20);
    expect(farmScore(g, p, g.ref(15, 15), 40_000)).toBeLessThan(0);
  });

  test("a knob re-tune flips the optimum with no planner changes", async () => {
    // Same tile, same layers: profitable at default farmYieldMilli…
    conquerBlock(game, player, 10, 10, 20);
    expect(farmScore(game, player, game.ref(15, 15), 40_000)).toBeGreaterThan(
      0,
    );

    // …unprofitable when the yield knob is cut.
    const g = await layeredGame(flat, CutYield);
    const p = g.player(founderInfo.id);
    conquerBlock(g, p, 10, 10, 20);
    expect(farmScore(g, p, g.ref(15, 15), 40_000)).toBeLessThan(0);
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

    const economy = new TribalEconomy(new PseudoRandom(42), game, player);
    // Settle each pulse's construction before the next so sampling sees the
    // built plots (and canBuild filters occupied tiles).
    for (let i = 0; i < 5; i++) {
      expect(economy.tryBuild(1)).toBe(1);
      settleExecutions(game);
    }
    expect(player.units(UnitType.Farmland).length).toBe(5);
  });

  test("builds nothing when no action can repay its cost", async () => {
    const game = await layeredGame(barren);
    const player = game.player(founderInfo.id);
    conquerBlock(game, player, 10, 10, 30);
    player.addFood(2_000n); // affordable but worthless — and below the barn
    // accrual threshold, so insurance isn't wanted either

    const economy = new TribalEconomy(new PseudoRandom(42), game, player);
    expect(economy.tryBuild(5)).toBe(0);
    settleExecutions(game);
    expect(player.units(UnitType.Farmland).length).toBe(0);
    expect(player.units(UnitType.Barn).length).toBe(0);
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

  test("barn is insurance: built only when growth has nothing to offer", async () => {
    const game = await layeredGame(barren); // no farm can repay its cost
    const player = game.player(founderInfo.id);
    const f = game.config().food();
    conquerBlock(game, player, 10, 10, 30);

    // A large fed population with stock accruing at the base cap — one
    // generation of consumption far exceeds baseStorage.
    (
      player as Player & { _foodFlow: { population: number } }
    )._foodFlow.population = 50_000;
    player.addFood(BigInt(f.baseStorage)); // ≥ accrual fraction of the cap

    const economy = new TribalEconomy(new PseudoRandom(11), game, player);
    expect(wantsBarnInsurance(game, player)).toBe(true);
    expect(economy.tryBuild(1)).toBe(1);
    settleExecutions(game);
    expect(player.units(UnitType.Barn).length).toBe(1);
    expect(player.units(UnitType.Farmland).length).toBe(0);
  });

  test("deterministic: same state and seed choose the same builds", async () => {
    const runs: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const game = await layeredGame(cropGradient);
      const player = game.player(founderInfo.id);
      conquerBlock(game, player, 10, 10, 40);
      player.addFood(100_000n);
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
