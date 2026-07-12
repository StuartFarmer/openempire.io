import { beforeEach, describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

/**
 * The layered-map economy under the urban-core-growth model: the city is a
 * self-growing density field founded from a Core (no plots). Growth mechanics
 * proper are covered in UrbanGrowth.test.ts; here we test the food economy and
 * integration (spawn founding, population cap, razing, starvation, updates).
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

/** Adds PlayerExecution (which runs the urban tick) and inits with one tick. */
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

/** Found a Core at (cx,cy) and build a dense district of the given size. */
function buildCity(
  game: Game,
  player: Player,
  cx: number,
  cy: number,
  size: number,
): void {
  const half = Math.floor(size / 2);
  conquerBlock(game, player, cx - half, cy - half, size);
  player.setCore(game.ref(cx, cy));
  for (let y = cy - half; y < cy - half + size; y++) {
    for (let x = cx - half; x < cx - half + size; x++) {
      player.setDensity(game.ref(x, y), 1000);
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

  test("food economy activates only on layered maps", async () => {
    expect(game.hasLayers()).toBe(true);
    expect(player.hasFoodEconomy()).toBe(true);

    const classic = await setup("plains", {}, [humanInfo]);
    expect(classic.hasLayers()).toBe(false);
    expect(classic.player(humanInfo.id).hasFoodEconomy()).toBe(false);
  });

  test("spawning founds a Core and seeds the density field, no plots", async () => {
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
    expect(p.urbanArea()).toBeGreaterThan(0);
    // The founding is free: the opening stake is intact.
    expect(p.food()).toBe(BigInt(f.startingFood));
    // Idle from here: the young city feeds its start population without dying.
    for (let i = 0; i < 200; i++) g.executeNextTick();
    expect(p.isAlive()).toBe(true);
    expect(p.foodFlow().starvedTroops).toBe(0);
  });

  test("production comes from the density field, not from raw land", () => {
    // Own a large block but build only a small district: only built tiles
    // produce; the surrounding owned-but-unbuilt land contributes nothing.
    conquerBlock(game, player, 0, 0, 20);
    player.setTroops(0);
    player.setCore(game.ref(10, 10));
    activate(game, player);
    game.executeNextTick();
    expect(flow(player).production).toBe(0); // core seed alone rounds to ~0

    for (let y = 8; y < 13; y++) {
      for (let x = 8; x < 13; x++) player.setDensity(game.ref(x, y), 1000);
    }
    game.executeNextTick();
    expect(flow(player).production).toBeGreaterThan(0);
  });

  test("population cap scales with built urban area", () => {
    const f = game.config().food();
    conquerBlock(game, player, 0, 0, 10);
    player.setCore(game.ref(5, 5));
    // Base cap with only the core (area ≈ 1).
    player.setDensity(game.ref(5, 5), 1000);
    const base = game.config().maxTroops(player);
    expect(base).toBe(f.basePopulation + 1 * f.popPerDensity);

    // Build 8 more full tiles → area 9 → cap rises by 8·popPerDensity.
    let n = 1;
    for (const [x, y] of [
      [4, 5],
      [6, 5],
      [5, 4],
      [5, 6],
      [4, 4],
      [6, 6],
      [4, 6],
      [6, 4],
    ]) {
      player.setDensity(game.ref(x, y), 1000);
      n++;
    }
    expect(game.config().maxTroops(player)).toBe(
      f.basePopulation + n * f.popPerDensity,
    );
  });

  test("food fields flow through player updates on layered games only", async () => {
    buildCity(game, player, 10, 10, 6);
    player.setTroops(500);
    player.addFood(777n);
    activate(game, player);
    game.executeNextTick();

    type UpdateSource = Player & {
      toUpdate(): {
        food?: number;
        foodProduction?: number;
        urbanArea?: number;
      } | null;
    };
    (player as Player & { lastSentUpdate?: unknown }).lastSentUpdate =
      undefined;
    const update = (player as UpdateSource).toUpdate();
    expect(update).not.toBeNull();
    expect(update!.food).toBeTypeOf("number");
    expect(update!.foodProduction).toBeGreaterThan(0);
    expect(update!.urbanArea).toBeGreaterThan(0);

    const classic = await setup("plains", {}, [humanInfo]);
    const cp = classic.player(humanInfo.id);
    const classicUpdate = (cp as UpdateSource).toUpdate();
    expect(classicUpdate!.food).toBeUndefined();
    expect(classicUpdate!.urbanArea).toBeUndefined();
  });

  test("stored food decays over time", async () => {
    const barren = await setup(
      "plains",
      { instantBuild: true },
      [humanInfo],
      undefined,
      undefined,
      true,
      () => 0, // no fertility → no production
    );
    const p = barren.player(humanInfo.id);
    p.conquer(barren.ref(0, 0));
    p.setCore(barren.ref(0, 0));
    activate(barren, p);
    p.setTroops(0);
    p.removeFood(p.food());
    p.addFood(3_000n);
    barren.executeNextTick();
    const f = barren.config().food();
    const expectedMilli =
      3_000_000n - (3_000_000n * BigInt(f.decayNumer)) / BigInt(f.decayDenom);
    expect(p.food()).toBe(expectedMilli / 1000n);
  });

  test("surplus above the storage cap is lost (rebated, capped)", () => {
    buildCity(game, player, 10, 10, 4);
    activate(game, player);
    player.setTroops(0);
    const f = game.config().food();
    player.addFood(BigInt(f.baseStorage + 25_000));
    game.executeNextTick();
    expect(player.food()).toBeLessThanOrEqual(BigInt(f.baseStorage));
  });

  test("war razing: capturing a district clears its density", () => {
    buildCity(game, rival, 40, 40, 6);
    const rivalPeak = rival.urbanArea();
    expect(rivalPeak).toBeGreaterThan(1);

    // Player conquers the whole district — the loser's density is razed and
    // the captor receives raw, unbuilt land.
    conquerBlock(game, player, 37, 37, 6);
    expect(rival.urbanArea()).toBeLessThan(rivalPeak);
    let captorDensity = 0;
    for (const [, d] of player.densityEntries()) captorDensity += d;
    expect(captorDensity).toBe(0);
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
    // Both starve (no production); deployment does not shield the army.
    expect(player.troops()).toBeLessThan(20_000);
    expect(rivalTotal).toBeLessThan(20_000);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(humanInfo.id);
      buildCity(g, p, 30, 30, 8);
      p.setTroops(2000);
      p.addFood(1_234n);
      activate(g, p);
      for (let i = 0; i < 50; i++) g.executeNextTick();
      return { food: p.food(), troops: p.troops(), area: p.urbanArea() };
    };
    expect(await run()).toEqual(await run());
  });
});

describe("Baked layered fixture", () => {
  test("tribalsmall loads its layers.bin through setup()", async () => {
    const game = await setup("tribalsmall", {}, [humanInfo]);
    expect(game.hasLayers()).toBe(true);
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
    // The freshwater plane (add-urban-core-growth) is baked and varied.
    expect(water.size).toBeGreaterThan(1);
    expect(maxWater).toBeGreaterThan(0);
  });
});
