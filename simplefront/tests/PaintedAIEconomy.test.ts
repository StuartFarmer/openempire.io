import { expect, test } from "vitest";
import {
  decidePaintedAI,
  paintedAIState,
} from "../src/core/execution/utils/PaintedAI";
import {
  paintedResources,
  paintedState,
} from "../src/core/execution/utils/PaintedEconomy";
import { UnitType } from "../src/core/game/Game";
import { aiFixture } from "./util/PaintedAISetup";

test("depleted AI rebuilds both missing essential plots using paid resources", async () => {
  const { game, player } = await aiFixture();
  for (const u of player.units(UnitType.Farmland, UnitType.Settlement))
    u.delete(false);
  player.removeFoodMilli(player.foodMilli());
  player.setTroops(0);
  for (let i = 0; i < 600; i++) game.executeNextTick();
  expect(paintedResources(game, player).farms).toBeGreaterThanOrEqual(1);
  expect(paintedResources(game, player).cities).toBeGreaterThanOrEqual(1);
  expect(player.troops()).toBeGreaterThan(0);
  expect(player.foodMilli()).toBeGreaterThanOrEqual(0n);
});

test("missing-farm purchase debits exact food and does not wait for expedition reserve", async () => {
  const { game, player } = await aiFixture({ inertResources: true });
  player.units(UnitType.Farmland)[0].delete(false);
  player.removeFoodMilli(player.foodMilli());
  player.addFood(1500n);
  const decision = decidePaintedAI(game, player, paintedAIState(player)!);
  expect(decision.kind).toBe("paint");
  for (let i = 0; i < 25; i++) game.executeNextTick();
  expect(paintedResources(game, player).farms).toBe(1);
  expect(player.foodMilli()).toBe(0n);
});

test("AI expands with a paid army while keeping idle defenders", async () => {
  const { game, player } = await aiFixture({ inertResources: true });
  const before = player.numTilesOwned();
  for (let i = 0; i < 40; i++) game.executeNextTick();
  expect(player.numTilesOwned()).toBeGreaterThan(before);
  expect(player.foodMilli()).toBeLessThan(4_000_000n);
  const resources = paintedResources(game, player);
  expect(resources.idleTroops).toBeGreaterThanOrEqual(
    Math.floor(resources.totalTroops * 0.3),
  );
});

test("city demand uses deployed headroom and preserves a dispatch budget", async () => {
  const { game, player } = await aiFixture({ inertResources: true });
  player.setTroops(600);
  paintedState(player).pendingLandingTroops = 7000;
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toMatchObject({
    kind: "paint",
    plot: "city",
  });
  paintedState(player).pendingLandingTroops = 0;
  player.setTroops(7600);
  const decision = decidePaintedAI(game, player, paintedAIState(player)!);
  expect(decision).toMatchObject({ kind: "paint", plot: "city" });
  player.removeFoodMilli(player.foodMilli());
  player.addFood(2000n);
  expect(
    decidePaintedAI(game, player, paintedAIState(player)!),
  ).not.toMatchObject({ kind: "paint", plot: "city" });
});

test("damaged sites do not consume construction food or trap a decision", async () => {
  const { game, player } = await aiFixture({ inertResources: true });
  player.units(UnitType.Farmland)[0].delete(false);
  for (const tile of player.tiles()) game.addTileDamage(tile, 1000);
  const food = player.foodMilli();
  const decision = decidePaintedAI(game, player, paintedAIState(player)!);
  expect(decision.kind).not.toBe("paint");
  expect(player.foodMilli()).toBe(food);
});

test("no city, no troops and no legal site reports no-site without inventing recovery", async () => {
  const { game, player } = await aiFixture({ inertResources: true });
  player.units(UnitType.Settlement)[0].delete(false);
  player.setTroops(0);
  for (const tile of player.tiles()) game.addTileDamage(tile, 1000);
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toEqual({
    kind: "wait",
    reason: "no-site",
  });
});
