import { expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  paintedResources,
  paintedState,
  tickPaintedEconomy,
} from "../src/core/execution/utils/PaintedEconomy";
import {
  applyStateUpdate,
  diffPlayerUpdate,
} from "../src/core/game/GameUpdateUtils";
import { PlayerImpl } from "../src/core/game/PlayerImpl";
import { PlayerState } from "../src/core/game/PlayerState";
import { paintedFixture } from "./util/PaintedSetup";

test("baseline recovers without farms or troops, once per tick", async () => {
  const { game, player } = await paintedFixture(true);
  player.removeFoodMilli(player.foodMilli());
  player.setTroops(0);
  game.addExecution(new PlayerExecution(player));
  game.executeNextTick();
  expect(player.foodMilli()).toBe(5000n);
  tickPaintedEconomy(game, player);
  const after = player.foodMilli();
  tickPaintedEconomy(game, player);
  expect(player.foodMilli()).toBe(after);
  for (let i = 0; i < 1000; i++) game.executeNextTick();
  expect(player.foodMilli()).toBeGreaterThanOrEqual(2_000_000n);
  expect(player.troops()).toBe(0);
  expect(player.isAlive()).toBe(true);
  expect(paintedResources(game, player).troopCapacity).toBe(0);
});

test("bootstrap recruits into idle troops but counts committed passengers", async () => {
  const { game, player } = await paintedFixture(true);
  paintedState(player).cities = 1;
  player.setTroops(0);
  game.executeNextTick();
  // 0.0003 * 10000 is just below 3 in binary floating point; the remainder
  // stays in credit rather than being discarded or rounded into free troops.
  expect(player.troops()).toBe(2);
  expect(paintedState(player).troopCredit).toBeCloseTo(1);
  player.setTroops(9000);
  paintedState(player).pendingLandingTroops = 1000;
  game.executeNextTick();
  expect(player.troops()).toBe(9000);
  expect(paintedResources(game, player)).toMatchObject({
    deployedTroops: 1000,
    totalTroops: 10000,
    troopCapacity: 10000,
    troopGain: 0,
  });
  expect(game.config().maxTroops(player)).toBe(10000);
  player.setTroops(15000);
  game.executeNextTick();
  expect(player.troops()).toBe(15000);
});

test("food debits use exact milli-food and ignore inherited local stores", async () => {
  const { player } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(1001n);
  expect(player.removeFoodMilli(1n)).toBe(1n);
  expect(player.foodMilli()).toBe(1000n);
  expect(player.removeFoodMilli(2000n)).toBe(1000n);
  expect(player.removeFoodMilli(-1n)).toBe(0n);
  expect(player.foodMilli()).toBe(0n);
});

test("dead players receive neither food nor recruitment", async () => {
  const { game, player } = await paintedFixture(true);
  for (const tile of [...player.tiles()]) player.relinquish(tile);
  player.removeFoodMilli(player.foodMilli());
  player.setTroops(0);
  game.executeNextTick();
  expect(player.foodMilli()).toBe(0n);
  expect(player.troops()).toBe(0);
});

test("credits and milli-food participate in deterministic hashing", async () => {
  const a = await paintedFixture(true),
    b = await paintedFixture(true);
  for (let i = 0; i < 20; i++) {
    a.game.executeNextTick();
    b.game.executeNextTick();
  }
  expect((a.player as PlayerImpl).hash()).toBe((b.player as PlayerImpl).hash());
  expect(paintedResources(a.game, a.player)).toEqual(
    paintedResources(b.game, b.player),
  );
  const hash = (a.player as PlayerImpl).hash();
  a.player.addFoodMilli(1n);
  expect((a.player as PlayerImpl).hash()).not.toBe(hash);
  a.player.removeFoodMilli(1n);
  paintedState(a.player).foodCredit += 0.01;
  expect((a.player as PlayerImpl).hash()).not.toBe(hash);
});

test("resource changes survive incremental publication", async () => {
  const { game, player } = await paintedFixture(true);
  const before = (player as PlayerImpl).toUpdate()!;
  game.executeNextTick();
  const after = (player as PlayerImpl).lastSentUpdate!;
  const diff = diffPlayerUpdate(before, after)!;
  const target = {} as PlayerState;
  applyStateUpdate(target, diff);
  expect(target.painted).toEqual(paintedResources(game, player));
});
