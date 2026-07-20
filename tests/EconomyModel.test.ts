import { beforeEach, describe, expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  farmSiteScoreMilli,
  housingBound,
} from "../src/core/execution/utils/EconomyModel";
import { TribalEconomy } from "../src/core/execution/utils/TribalEconomy";
import {
  Difficulty,
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { LayersFill, setup } from "./util/Setup";

/**
 * The two-rule bot economy (simplify-food-economy, economy-planner spec):
 * buy a farm on the best visible footprint when affordable; buy a
 * settlement when housing-bound.
 */

const botInfo = new PlayerInfo("bot", PlayerType.Bot, null, "bot_id");

/** West half is poor soil (60), east half rich (220); climate uniform. */
const splitFill: LayersFill = (n, x) =>
  n === "crop" ? (x < 50 ? 60 : 220) : n === "temperature" ? 166 : 255;

async function splitGame(): Promise<Game> {
  return setup(
    "plains",
    { instantBuild: true, difficulty: Difficulty.Impossible },
    [botInfo],
    undefined,
    undefined,
    true,
    splitFill,
  );
}

function conquerBlock(
  game: Game,
  player: Player,
  x0: number,
  y0: number,
  w: number,
  h: number,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) player.conquer(game.ref(x, y));
  }
}

describe("farm site scoring", () => {
  test("richer footprints score higher — bots farm the good land", async () => {
    const game = await splitGame();
    const bot = game.player(botInfo.id);
    conquerBlock(game, bot, 30, 30, 45, 20); // spans the soil split at x=50
    const west = farmSiteScoreMilli(game, bot, game.ref(35, 35));
    const east = farmSiteScoreMilli(game, bot, game.ref(70, 35));
    expect(east).toBeGreaterThan(west);
    expect(west).toBeGreaterThan(0);
  });
});

describe("housing bound", () => {
  test("true only when population presses the ceiling", async () => {
    const game = await splitGame();
    const bot = game.player(botInfo.id);
    conquerBlock(game, bot, 30, 30, 10, 10);
    game.addExecution(new PlayerExecution(bot));
    game.executeNextTick();
    game.executeNextTick();
    const housing = game.config().maxTroops(bot);
    const pop = bot.foodFlow().population;
    expect(housingBound(game, bot)).toBe(pop >= housing * 0.9);
    // Removing most of the population unbinds it.
    bot.removeTroops(bot.troops() - 10);
    game.executeNextTick();
    expect(housingBound(game, bot)).toBe(false);
  });
});

describe("TribalEconomy — the two rules", () => {
  let game: Game;
  let bot: Player;

  beforeEach(async () => {
    game = await splitGame();
    bot = game.player(botInfo.id);
    conquerBlock(game, bot, 30, 30, 45, 20);
    game.addExecution(new PlayerExecution(bot));
    game.executeNextTick();
    game.executeNextTick();
  });

  test("buys a farm on the fertile side when affordable", () => {
    // Not housing-bound (rule 1 must not fire): shrink the population.
    bot.removeTroops(bot.troops() - 100);
    game.executeNextTick();
    (bot as Player & { _farmSeeds: number })._farmSeeds = 2;
    const econ = new TribalEconomy(new PseudoRandom(7), game, bot);
    const placed = econ.tryBuild(1);
    expect(placed).toBe(1);
    for (let i = 0; i < 3; i++) game.executeNextTick(); // construction lands
    const farms = bot.units(UnitType.Farmland);
    expect(farms.length).toBeGreaterThan(0);
    // The sampled argmax lands east of the soil split (the rich side).
    const newest = farms[farms.length - 1];
    expect(game.x(newest.tile())).toBeGreaterThan(50);
  });

  test("no seeds, nothing places", () => {
    const econ = new TribalEconomy(new PseudoRandom(7), game, bot);
    expect(econ.tryBuild(1)).toBe(0);
  });

  test("housing binds (capacity above housing) → places the settlement seed", () => {
    // A grown farm on the rich side lifts food capacity far above bot
    // housing, so housing is the binding ceiling and the seed goes there.
    bot.buildUnit(UnitType.Farmland, game.ref(70, 35), {});
    for (let i = 0; i < 120; i++) game.executeNextTick(); // field ramps
    expect(bot.foodFlow().capacity).toBeGreaterThan(
      game.config().maxTroops(bot),
    );
    (bot as Player & { _settlementSeeds: number })._settlementSeeds = 2;
    const econ = new TribalEconomy(new PseudoRandom(7), game, bot);
    expect(econ.tryBuild(1)).toBe(1);
    for (let i = 0; i < 3; i++) game.executeNextTick();
    expect(bot.units(UnitType.Settlement).length).toBeGreaterThan(0);
  });
});
