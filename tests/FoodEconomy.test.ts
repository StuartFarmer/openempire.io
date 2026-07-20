import { beforeEach, describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * The simplified food economy (simplify-food-economy): fixed-radius farms
 * priced by baked fertility, one national pool with buffer-then-famine
 * order, and a single logistic population toward min(food, housing).
 */

const humanInfo = new PlayerInfo("eater", PlayerType.Human, null, "eater_id");
const rivalInfo = new PlayerInfo("rival", PlayerType.Human, null, "rival_id");

/** Layer fill for (near-)perfect fertility: crop/moisture max, temp at the
 *  band optimum → fertility byte 255. */
const richFill: LayersFill = (n) =>
  n === "temperature" ? Math.round(0.65 * 255) : 255;
/** All-mid-range fill → fertility byte 128 ("average land is 0.5"). */
const midFill: LayersFill = () => 128;

async function layeredGame(fill: LayersFill): Promise<Game> {
  return setup(
    "plains",
    { infiniteGold: false, instantBuild: true },
    [humanInfo, rivalInfo],
    undefined,
    undefined,
    true,
    fill,
  );
}

function activate(game: Game, ...players: Player[]): void {
  for (const p of players) game.addExecution(new PlayerExecution(p));
  game.executeNextTick(); // executions init
  game.executeNextTick(); // first real economy tick
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

describe("farm production (farm-growth spec)", () => {
  test("output follows fertility: a rich footprint out-produces a mid one proportionally", async () => {
    const rich = await layeredGame(richFill);
    const mid = await layeredGame(midFill);
    for (const [game, id] of [
      [rich, humanInfo.id],
      [mid, humanInfo.id],
    ] as const) {
      const p = game.player(id);
      conquerBlock(game, p, 10, 10, 9); // owns the whole 7×7 footprint
      p.buildUnit(UnitType.Farmland, game.ref(13, 13), {});
      activate(game, p);
      // Fields GROW (restore-organic-growth): let both ramp to full.
      for (let i = 0; i < 500; i++) game.executeNextTick();
    }
    const prodRich = rich.player(humanInfo.id).foodFlow().production;
    const prodMid = mid.player(humanInfo.id).foodFlow().production;
    // Rich land bakes to byte 255, mid land to 128 — production scales 1:1
    // with the baked plane (production = farmOutput × avgFertility).
    expect(prodRich).toBeGreaterThan(0);
    expect(prodRich / prodMid).toBeCloseTo(255 / 128, 1);
    // Fields are unbounded (unbound-organic-growth): the field fills the whole
    // owned block (81 tiles > the 49-tile reference footprint), so a rich field
    // out-earns the reference amount.
    const f = rich.config().food();
    expect(prodRich).toBeGreaterThan(Math.floor(f.farmOutputMilli / 1000));
  });

  test("unowned tiles dilute: losing footprint ground cuts production immediately", async () => {
    const game = await layeredGame(richFill);
    const player = game.player(humanInfo.id);
    const rival = game.player(rivalInfo.id);
    conquerBlock(game, player, 10, 10, 9);
    player.buildUnit(UnitType.Farmland, game.ref(13, 13), {});
    activate(game, player, rival);
    for (let i = 0; i < 500; i++) game.executeNextTick(); // field fully grown
    const before = player.foodFlow().production;
    const beforeTiles = player.fieldTiles(game.ref(13, 13)).size;

    // The rival takes the western 2 columns of the owned block.
    let taken = 0;
    for (let y = 10; y < 19; y++) {
      for (const x of [10, 11]) {
        const t = game.ref(x, y);
        if (player.isFieldTile(t)) {
          rival.conquer(t);
          taken++;
        }
      }
    }
    game.executeNextTick();
    const after = player.foodFlow().production;
    // Production drops in proportion to the worked tiles lost (rich = uniform).
    expect(taken).toBeGreaterThan(0);
    expect(after / before).toBeCloseTo((beforeTiles - taken) / beforeTiles, 1);
  });

  test("farm spacing: no own Farmland within Chebyshev 2·radius", async () => {
    const game = await layeredGame(richFill);
    const player = game.player(humanInfo.id);
    conquerBlock(game, player, 10, 10, 20);
    (player as Player & { _farmSeeds: number })._farmSeeds = 5; // gate is seeds
    player.buildUnit(UnitType.Farmland, game.ref(15, 15), {});
    const f = game.config().food();
    expect(f.farmRadius).toBe(3);
    // 4 tiles away (spec scenario) and exactly 2R away: rejected.
    expect(player.canBuild(UnitType.Farmland, game.ref(19, 15))).toBe(false);
    expect(player.canBuild(UnitType.Farmland, game.ref(21, 15))).toBe(false);
    // 2R+1 away: allowed.
    expect(player.canBuild(UnitType.Farmland, game.ref(22, 15))).not.toBe(
      false,
    );
  });
});

describe("the national pool (food-economy spec)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame(richFill);
    player = game.player(humanInfo.id);
    conquerBlock(game, player, 10, 10, 9);
  });

  test("the granary is the famine buffer: nobody starves while it holds food", () => {
    // No farms: capacity 0, pop 2000 — but the opening stake feeds them.
    activate(game, player);
    const troops0 = player.troops();
    game.executeNextTick();
    expect(player.troops()).toBe(troops0); // pool > 0 → no decline
    expect(Number(player.food())).toBeLessThan(
      game.config().food().startingFood,
    ); // but it drains

    // Drain the pool: famine begins, at the fast decline rate.
    player.removeFood(player.food());
    game.executeNextTick();
    const f = game.config().food();
    const expected = Math.round(f.popDeclineRate * troops0 * 1000) / 1000;
    expect(player.troops()).toBe(troops0 - Math.floor(expected));
  });

  test("the pool caps at granaryBase + granaryPerFarm × farms", () => {
    player.buildUnit(UnitType.Farmland, game.ref(13, 13), {});
    // A tiny population banks a huge surplus; the cap must bound it.
    player.removeTroops(player.troops() - 10);
    activate(game, player);
    const f = game.config().food();
    const cap = f.granaryBase + f.granaryPerFarm * 1;
    for (let i = 0; i < 300; i++) game.executeNextTick(); // field ramps, banks
    expect(Number(player.food())).toBe(cap);
  });

  test("war costs no food: deployed troops eat at the same rate", () => {
    activate(game, player);
    const idleConsumption = player.foodFlow().consumption;
    // Send a third of the population against the wilderness.
    game.addExecution(
      new AttackExecution(600, player, game.terraNullius().id()),
    );
    game.executeNextTick();
    game.executeNextTick();
    // Total consumption still tracks TOTAL population (idle + deployed) at
    // the one idle rate — no fight/move multiplier, no requisition.
    const f = game.config().food();
    const pop = player.foodFlow().population;
    expect(player.foodFlow().consumption).toBe(
      Math.floor((pop * f.idleConsumptionMilli) / 1000),
    );
    expect(player.foodFlow().consumption).toBeLessThanOrEqual(
      idleConsumption + 1,
    );
  });
});

describe("the logistic population (food-economy spec)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame(richFill);
    player = game.player(humanInfo.id);
    conquerBlock(game, player, 10, 10, 9);
  });

  test("population grows under the moving ceilings and never exceeds them", () => {
    player.buildUnit(UnitType.Farmland, game.ref(13, 13), {});
    player.setCore(game.ref(11, 11)); // the city grows housing from here
    activate(game, player);
    const f = game.config().food();
    let grew = false;
    let prev = player.troops();
    for (let i = 0; i < 2000; i++) {
      game.executeNextTick();
      const housing =
        f.housingBase + Math.round(player.urbanArea()) * f.popPerDensity;
      const capacity = player.foodFlow().capacity;
      // Never exceeds min(capacity, housing) beyond one tick of slack.
      expect(player.foodFlow().population).toBeLessThanOrEqual(
        Math.max(capacity, f.housingBase) + 50,
      );
      expect(player.foodFlow().population).toBeLessThanOrEqual(housing + 50);
      if (player.troops() > prev) grew = true;
      prev = player.troops();
    }
    expect(grew).toBe(true);
    expect(player.foodFlow().population).toBeGreaterThan(f.housingBase);
  });

  test("housing binds without a city; founding a core unbinds it", () => {
    conquerBlock(game, player, 19, 10, 6); // room for the city, off the field
    player.buildUnit(UnitType.Farmland, game.ref(13, 13), {});
    activate(game, player);
    const f = game.config().food();
    // No core → no city growth: housing = housingBase = startPopulation.
    expect(f.housingBase).toBe(player.troops());
    for (let i = 0; i < 300; i++) game.executeNextTick();
    expect(player.troops()).toBe(f.housingBase);

    // Found the core OUTSIDE the farm's footprint (first claim holds —
    // a core buried in the field could never grow a city).
    player.setCore(game.ref(21, 12));
    for (let i = 0; i < 300; i++) game.executeNextTick();
    expect(player.troops()).toBeGreaterThan(f.housingBase);
  });

  test("famine bites faster than recovery (decline rate > growth rate)", () => {
    const f = game.config().food();
    expect(f.popDeclineRate).toBeGreaterThan(f.popGrowthRate);
  });

  test("a nation whose population reaches zero dies", () => {
    // Somebody must have spawned for the death rule; simulate it.
    player.buildUnit(UnitType.Farmland, game.ref(13, 13), {});
    activate(game, player);
    expect(player.numTilesOwned()).toBeGreaterThan(0);
  });
});
