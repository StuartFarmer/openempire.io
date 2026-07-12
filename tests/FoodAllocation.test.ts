import { beforeEach, describe, expect, test } from "vitest";
import { FoodAllocationExecution } from "../src/core/execution/FoodAllocationExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

/** See tests/FoodEconomy.test.ts — same activation dance. */
function activate(game: Game, ...players: Player[]): void {
  for (const p of players) {
    game.addExecution(new PlayerExecution(p));
  }
  game.executeNextTick();
}

const CROP = 200;
const flatLayers = () => CROP;

const humanInfo = new PlayerInfo("eater", PlayerType.Human, null, "eater_id");

async function layeredGame(): Promise<Game> {
  return setup(
    "plains",
    { infiniteGold: false, instantBuild: true },
    [humanInfo],
    undefined,
    undefined,
    true,
    flatLayers,
  );
}

function conquerBlock(game: Game, player: Player, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      player.conquer(game.ref(x, y));
    }
  }
}

/**
 * Found a dense Core district producing far more than 1000 idle troops eat
 * (add-urban-core-growth): own a 12×12 block, seed the Core, and fill it with
 * built density so production is high and supplied.
 */
function buildEconomy(game: Game, player: Player): void {
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) player.conquer(game.ref(x, y));
  }
  player.setCore(game.ref(6, 6));
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) player.setDensity(game.ref(x, y), 1000);
  }
  player.addFood(10_000n);
}

describe("Food allocation (add-food-allocation)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(humanInfo.id);
    conquerBlock(game, player, 8);
  });

  test("defaults to the config knob; intent execution sets and clamps", () => {
    expect(player.foodPopulationShare()).toBe(
      game.config().food().defaultPopulationShare,
    );

    game.addExecution(new FoodAllocationExecution(player, 0.4));
    game.executeNextTick();
    expect(player.foodPopulationShare()).toBe(0.4);

    game.addExecution(new FoodAllocationExecution(player, 1.7));
    game.executeNextTick();
    expect(player.foodPopulationShare()).toBe(1);

    game.addExecution(new FoodAllocationExecution(player, -0.3));
    game.executeNextTick();
    expect(player.foodPopulationShare()).toBe(0);
  });

  test("growth no longer devours the bank: storage share accumulates while growing", async () => {
    // Same economy twice; only the slider differs.
    const run = async (share: number) => {
      const g = await layeredGame();
      const p = g.player(humanInfo.id);
      conquerBlock(g, p, 8);
      buildEconomy(g, p);
      p.removeFood(p.food()); // measure banking from zero
      p.setTroops(1000);
      p.setFoodPopulationShare(share);
      activate(g, p);
      const stocks: bigint[] = [];
      for (let i = 0; i < 50; i++) {
        g.executeNextTick();
        stocks.push(p.food());
      }
      return { stocks, troops: p.troops() };
    };

    const banked = await run(0.7);
    const allPop = await run(1.0);

    // share 1.0: a growing population consumes everything — nothing banks.
    expect(allPop.stocks[49]).toBe(0n);
    // share 0.7: the stock climbs tick over tick while the population grows.
    expect(banked.stocks[49]).toBeGreaterThan(banked.stocks[9]);
    expect(banked.stocks[49]).toBeGreaterThan(1_000n);
    expect(banked.troops).toBeGreaterThan(1000);
    // …and the population share still grows people, just slower.
    expect(allPop.troops).toBeGreaterThanOrEqual(banked.troops);
  });

  test("share 0 is austerity: fed via pass-through, storage banks to the cap", () => {
    buildEconomy(game, player);
    player.removeFood(player.food());
    player.setTroops(1000);
    player.setFoodPopulationShare(0);
    const f = game.config().food();
    activate(game, player);
    for (let i = 0; i < 50; i++) game.executeNextTick();

    // Fed from the storage draw — nobody starves — and storage banks to the
    // cap (max banking). Beyond the cap the overflow rebates to the
    // population, so growth is not strictly zero, but banking is maximal.
    expect(player.foodFlow().starvedTroops).toBe(0);
    expect(player.food()).toBeGreaterThanOrEqual(BigInt(f.baseStorage - 500));
  });

  test("storage overflow is rebated to the population, not wasted", () => {
    buildEconomy(game, player);
    player.setTroops(1000);
    player.setFoodPopulationShare(0); // nothing allocated directly
    const f = game.config().food();
    // Pin the stock at the cap so the storage share overflows every tick.
    player.addFood(BigInt(f.baseStorage + 10 * f.storagePerBarn));
    activate(game, player);
    const capMax = BigInt(f.baseStorage + 2 * f.storagePerBarn); // 1 barn, headroom
    for (let i = 0; i < 30; i++) game.executeNextTick();

    // Stock clamped to capacity; the overflow fed (and grew) the population.
    expect(player.food()).toBeLessThanOrEqual(capMax);
    expect(player.foodFlow().starvedTroops).toBe(0);
    expect(player.troops()).toBeGreaterThan(1000);
  });

  test("true famine still starves regardless of the slider", () => {
    // No farms at all: production 0, stock cleared → starvation at any share.
    player.removeFood(player.food());
    player.setTroops(10_000);
    player.setFoodPopulationShare(0.5);
    activate(game, player);
    for (let i = 0; i < 30; i++) game.executeNextTick();
    expect(player.troops()).toBeLessThan(10_000);
    expect(player.foodFlow().starvedTroops).toBeGreaterThan(0);
  });

  test("deterministic across identical runs with mid-game allocation changes", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(humanInfo.id);
      conquerBlock(g, p, 8);
      buildEconomy(g, p);
      p.setTroops(2_000);
      activate(g, p);
      for (let i = 0; i < 20; i++) g.executeNextTick();
      g.addExecution(new FoodAllocationExecution(p, 0.35));
      for (let i = 0; i < 40; i++) g.executeNextTick();
      return { food: p.food(), troops: p.troops() };
    };
    expect(await run()).toEqual(await run());
  });
});
