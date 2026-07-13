import { beforeEach, describe, expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  probeDistance,
  supplyField,
  supplyQuality,
  supplyQualityFromDistance,
} from "../src/core/execution/utils/SupplyField";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
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
    "plains", // 100×100, all land
    { infiniteGold: false, instantBuild: true },
    [humanInfo],
    undefined,
    undefined,
    true,
    flatLayers,
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
    for (let x = x0; x < x0 + w; x++) {
      player.conquer(game.ref(x, y));
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

describe("Supply field (add-supply-lines)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(humanInfo.id);
  });

  test("quality curve: 1 at the node, 0.5 at the radius, ~0 far out", () => {
    const f = game.config().food();
    expect(supplyQualityFromDistance(0, f)).toBe(1);
    expect(supplyQualityFromDistance(f.supplyRadius, f)).toBeCloseTo(0.5, 10);
    // Smooth and monotone — no cliff edge around the radius.
    for (let d = 1; d <= f.supplyRadius * 3; d++) {
      expect(supplyQualityFromDistance(d, f)).toBeLessThan(
        supplyQualityFromDistance(d - 1, f),
      );
    }
    expect(supplyQualityFromDistance(f.supplyRadius * 3, f)).toBeLessThan(0.05);
    expect(supplyQualityFromDistance(Infinity, f)).toBe(0);
  });

  test("field measures owned-land steps from Settlements and Barns", () => {
    conquerBlock(game, player, 0, 0, 40, 6);
    player.addFood(10_000n);
    player.buildUnit(UnitType.Settlement, game.ref(2, 2), {});
    const s = supplyField(game, player);

    expect(s.dist.get(game.ref(2, 2))).toBe(0);
    expect(s.dist.get(game.ref(7, 2))).toBe(5);
    expect(s.dist.get(game.ref(2 + 10, 2 + 3))).toBe(13); // Manhattan
    // Tiles the player does not own are not in the field.
    expect(s.dist.has(game.ref(50, 50))).toBe(false);
    expect(supplyQuality(game, s, game.ref(50, 50))).toBe(0);
  });

  test("supply flows only through owned land — pockets read ~0", () => {
    // Home block with the node, plus a disconnected pocket across a gap of
    // unowned land. Straight-line distance is short; owned-path distance
    // does not exist.
    conquerBlock(game, player, 0, 0, 10);
    conquerBlock(game, player, 14, 0, 10);
    player.addFood(10_000n);
    player.buildUnit(UnitType.Settlement, game.ref(9, 5), {});
    const s = supplyField(game, player);

    expect(s.dist.has(game.ref(14, 5))).toBe(false);
    expect(supplyQuality(game, s, game.ref(14, 5))).toBe(0);
    // …and probing cannot reconnect it either.
    expect(probeDistance(game, player, s, game.ref(14, 5))).toBe(Infinity);
  });

  test("building a node refreshes the field immediately", () => {
    conquerBlock(game, player, 0, 0, 40, 6);
    player.addFood(10_000n);
    player.buildUnit(UnitType.Settlement, game.ref(2, 2), {});
    const before = supplyField(game, player);
    const farTile = game.ref(38, 2);
    const beforeDist = before.dist.get(farTile)!;

    // Same tick, no cadence wait: painting a Barn lights up its district.
    player.buildUnit(UnitType.Barn, game.ref(36, 2), {});
    const after = supplyField(game, player);
    expect(after.dist.get(farTile)).toBe(2);
    expect(after.dist.get(farTile)!).toBeLessThan(beforeDist);
  });

  test("probeDistance reconnects tiles conquered after the last refresh", () => {
    conquerBlock(game, player, 0, 0, 20, 4);
    player.addFood(10_000n);
    player.buildUnit(UnitType.Settlement, game.ref(0, 1), {});
    const s = supplyField(game, player);
    expect(s.dist.get(game.ref(19, 1))).toBe(19);

    // Conquer 3 more steps of corridor — absent from the stale field, but
    // the probe walks back to it: field edge (19) + steps.
    for (const x of [20, 21, 22]) player.conquer(game.ref(x, 1));
    expect(s.dist.has(game.ref(22, 1))).toBe(false);
    expect(probeDistance(game, player, s, game.ref(22, 1))).toBe(22);
    // Enemy/unowned tiles never probe back in.
    expect(probeDistance(game, player, s, game.ref(60, 60))).toBe(Infinity);
  });
});

describe("Supply-gated farming (add-urban-core-growth)", () => {
  test("a distant farm out-produces nothing — quality gates yield", async () => {
    // Two identical strips; the only difference is how far the farm sits from
    // the Core (the supply source). flatLayers → identical fertility.
    const run = async (farmX: number) => {
      const g = await layeredGame();
      const p = g.player(humanInfo.id);
      conquerBlock(g, p, 0, 0, 95, 4);
      p.addFood(10_000n);
      p.setTroops(0);
      p.setCore(g.ref(1, 1));
      p.buildUnit(UnitType.Farmland, g.ref(farmX, 1), {});
      activate(g, p);
      g.executeNextTick();
      return flow(p).production;
    };
    const near = await run(2);
    const far = await run(90); // ~3× radius out — quality ~0.04
    expect(near).toBeGreaterThan(0);
    expect(far).toBeLessThan(near / 2);
  });
});

describe("Supply attrition in war", () => {
  test("an overextended front bleeds troops; a supplied one does not", async () => {
    const game = await layeredGame();
    const player = game.player(humanInfo.id);
    const f = game.config().food();
    conquerBlock(game, player, 0, 0, 95, 4);
    player.buildUnit(UnitType.Settlement, game.ref(1, 1), {});
    player.setTroops(0);
    // A standing attack whose front we position by hand (no execution — the
    // conquer loop would move it every tick). Sized so the starting stake
    // feeds it for the whole test — food must not confound the attrition.
    const attack = player.createAttack(
      game.terraNullius(),
      1_000,
      null,
      new Set<number>(),
    );
    activate(game, player);

    attack.setFrontTile(game.ref(2, 1)); // beside the settlement
    for (let i = 0; i < 20; i++) game.executeNextTick();
    // Fully supplied: no attrition, and the army eats the plain war rate.
    expect(attack.troops()).toBe(1_000);
    const warBase = (1_000 * f.fightConsumptionMilli) / 1000;
    expect(flow(player).consumption).toBeGreaterThanOrEqual(warBase * 0.95);
    expect(flow(player).consumption).toBeLessThanOrEqual(warBase * 1.05);

    attack.setFrontTile(game.ref(94, 1)); // ~3× radius down the corridor
    const before = attack.troops();
    game.executeNextTick();
    // Quality ~0.04 out there → ≈ troops × attrition die this tick.
    const expected = Math.floor(before * 0.96 * f.warSupplyAttrition);
    expect(before - attack.troops()).toBeGreaterThanOrEqual(expected - 1);
    expect(before - attack.troops()).toBeLessThanOrEqual(expected + 1);
    // Sustained: the army keeps shrinking even though food never ran out.
    for (let i = 0; i < 50; i++) game.executeNextTick();
    expect(attack.troops()).toBeLessThan(before * 0.85);
    expect(player.foodFlow().starvedTroops).toBe(0);
    expect(player.food()).toBeGreaterThan(0n);
  });

  test("no front yet (or a cut-off beachhead) pays full attrition", async () => {
    const game = await layeredGame();
    const player = game.player(humanInfo.id);
    const f = game.config().food();
    conquerBlock(game, player, 0, 0, 10);
    player.addFood(50_000n);
    player.buildUnit(UnitType.Settlement, game.ref(5, 5), {});
    player.setTroops(0);
    const attack = player.createAttack(
      game.terraNullius(),
      10_000,
      null,
      new Set<number>(),
    );
    activate(game, player);
    game.executeNextTick();

    // frontTile null → quality 0 → full attrition on the first tick.
    expect(attack.troops()).toBe(
      10_000 - Math.floor(10_000 * f.warSupplyAttrition),
    );
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(humanInfo.id);
      conquerBlock(g, p, 0, 0, 40, 6);
      p.addFood(20_000n);
      p.buildUnit(UnitType.Settlement, g.ref(2, 2), {});
      p.buildUnit(UnitType.Barn, g.ref(20, 2), {});
      for (const x of [3, 4, 5, 21, 22]) {
        p.buildUnit(UnitType.Farmland, g.ref(x, 3), {});
      }
      p.setTroops(2_000);
      const attack = p.createAttack(
        g.terraNullius(),
        1_500,
        null,
        new Set<number>(),
      );
      attack.setFrontTile(g.ref(39, 5));
      activate(g, p);
      for (let i = 0; i < 60; i++) g.executeNextTick();
      return { food: p.food(), troops: p.troops(), atk: attack.troops() };
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  });
});
