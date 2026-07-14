import { beforeEach, describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
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
    // clears the display-food floor.
    player.buildUnit(UnitType.Farmland, game.ref(15, 10), {});
    player.buildUnit(UnitType.Farmland, game.ref(16, 10), {});
    player.setFarmMaturity(game.ref(15, 10), 1000);
    player.setFarmMaturity(game.ref(16, 10), 1000);
    game.executeNextTick();
    expect(flow(player).production).toBeGreaterThan(0);
  });

  test("Barn raises storage; Farmland raises production", () => {
    conquerBlock(game, player, 0, 0, 12);
    foundSprawl(game, player, 6, 6, 2);
    player.setTroops(0);
    const f = game.config().food();

    // Overfill without barns → clamps to base storage.
    player.addFood(BigInt(f.baseStorage + f.storagePerBarn));
    activate(game, player);
    game.executeNextTick();
    expect(player.food()).toBeLessThanOrEqual(BigInt(f.baseStorage));

    player.addFood(5_000n);
    player.buildUnit(UnitType.Barn, game.ref(1, 1), {});
    player.addFood(BigInt(f.baseStorage + f.storagePerBarn));
    game.executeNextTick();
    expect(player.food()).toBeGreaterThan(BigInt(f.baseStorage));
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

    // Idle: the starter kit is a small farm village — it survives without
    // dying. Under the food bound (~5 farms per city tile) three starter farms
    // hold a 1-tile village; growth into a city needs more farms (tested next).
    for (let i = 0; i < 200; i++) g.executeNextTick();
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
