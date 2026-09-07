import { expect, test } from "vitest";
import * as economy from "../src/core/configuration/PaintedEconomyConfig";
import { purchasePaintedTile } from "../src/core/execution/PaintTilesExecution";
import { paintedResources } from "../src/core/execution/utils/PaintedEconomy";
import { PlayerType, UnitType } from "../src/core/game/Game";
import { aiFixture } from "./util/PaintedAISetup";
import { paintedFixture } from "./util/PaintedSetup";

test("calibrated unopposed troop refill reaches city demand in about 26 seconds", async () => {
  const { game, player } = await aiFixture({ playerType: PlayerType.Human });
  let ticks = 0;
  while (player.troops() < 7500 && ticks < 1000) {
    game.executeNextTick();
    ticks++;
  }
  expect(ticks).toBeGreaterThanOrEqual(250);
  expect(ticks).toBeLessThanOrEqual(265);
});

test("capacity-scaled refill recovers from zero and scales at equal fill", () => {
  expect(economy.capacityScaledGain).toBeTypeOf("function");
  expect(economy.capacityScaledGain(0, 10000, 0.001, 0.004)).toBe(10);
  expect(economy.capacityScaledGain(4000, 10000, 0.001, 0.004)).toBeCloseTo(
    15.6,
  );
  expect(economy.capacityScaledGain(8000, 20000, 0.001, 0.004)).toBeCloseTo(
    31.2,
  );
  expect(economy.capacityScaledGain(11000, 10000, 0.001, 0.004)).toBe(0);
  expect(economy.capacityScaledGain(0, 0, 0.001, 0.004)).toBe(0);
});

test("no-farm recovery funds rebuilding in about 23 seconds", async () => {
  const { game, player } = await paintedFixture(true);
  player.removeFoodMilli(player.foodMilli());
  let ticks = 0;
  while (player.foodMilli() < 1_500_000n && ticks < 300) {
    game.executeNextTick();
    ticks++;
  }
  expect(ticks).toBeGreaterThanOrEqual(225);
  expect(ticks).toBeLessThanOrEqual(235);
});

test("opening investment leaves expedition funds and faster projected recovery", async () => {
  const { game, player } = await paintedFixture(true);
  player.buildUnit(UnitType.Farmland, game.ref(10, 10), {});
  player.buildUnit(UnitType.Settlement, game.ref(11, 10), {});
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(4_000_000n);
  expect(purchasePaintedTile(game, player, "farm", game.ref(12, 10))).toBe(
    "placed",
  );
  expect(purchasePaintedTile(game, player, "city", game.ref(13, 10))).toBe(
    "placed",
  );
  expect(player.foodMilli()).toBe(500_000n);
  expect(paintedResources(game, player).foodGainMilli).toBeCloseTo(
    16433.333333,
  );
  let ticks = 0;
  while (player.foodMilli() < 1_500_000n && ticks < 100) {
    game.executeNextTick();
    ticks++;
  }
  expect(ticks).toBeGreaterThanOrEqual(55);
  expect(ticks).toBeLessThanOrEqual(60);
});
