import { expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  paintedResources,
  paintedState,
} from "../src/core/execution/utils/PaintedEconomy";
import { UnitType } from "../src/core/game/Game";
import { PlayerImpl } from "../src/core/game/PlayerImpl";
import { paintedFixture } from "./util/PaintedSetup";

test("capture transfers complete plots once and preserves over-capacity troops", async () => {
  const { game, player, rival } = await paintedFixture();
  const tile = [...player.tiles()][0];
  const plot = player.buildUnit(UnitType.Settlement, tile, {});
  player.setTroops(15000);
  const before = rival.troops();
  rival.conquer(tile);
  expect(paintedResources(game, player).cities).toBe(0);
  expect(paintedResources(game, rival).cities).toBe(1);
  expect(plot.owner()).toBe(rival);
  expect(player.troops()).toBe(15000);
  expect(rival.troops()).toBe(before);
  game.addExecution(new PlayerExecution(player));
  game.executeNextTick();
  game.executeNextTick();
  expect(paintedResources(game, rival).cities).toBe(1);
  expect(plot.level()).toBe(1);
});

test("farm loss immediately clamps food; deletion and relinquishment remove capacity", async () => {
  const { game, player, rival } = await paintedFixture();
  const tile = [...player.tiles()][0];
  const farm = player.buildUnit(UnitType.Farmland, tile, {});
  player.removeFoodMilli(player.foodMilli());
  player.addFoodMilli(8_000_000n);
  paintedState(player).foodCredit = 0.5;
  const before = rival.foodMilli();
  rival.conquer(tile);
  expect(player.foodMilli()).toBe(5_000_000n);
  expect(paintedState(player).foodCredit).toBe(0);
  expect(rival.foodMilli()).toBe(before);
  expect(paintedResources(game, rival).farms).toBe(1);
  farm.delete(false);
  expect(paintedResources(game, rival).farms).toBe(0);
  const city = player.buildUnit(
    UnitType.Settlement,
    [...player.tiles()][0],
    {},
  );
  player.relinquish(city.tile());
  expect(paintedResources(game, player).cities).toBe(0);
  expect(city.isActive()).toBe(false);
});

test("accepted spawn and reroll grant exactly two complete plots", async () => {
  const { game, player } = await paintedFixture();
  function spawn(x: number, y: number) {
    const execution = new SpawnExecution("test", player.info(), game.ref(x, y));
    execution.init(game, game.ticks());
    execution.tick(game.ticks());
  }
  spawn(50, 50);
  expect(paintedResources(game, player)).toMatchObject({
    foodMilli: 4_000_000n,
    foodCapacityMilli: 10_000_000n,
    totalTroops: 2000,
    troopCapacity: 10000,
    cities: 1,
    farms: 1,
  });
  const old = player
    .units(UnitType.Settlement, UnitType.Farmland)
    .map((u) => u.tile());
  paintedState(player).foodCredit = 0.25;
  spawn(80, 80);
  expect(player.units(UnitType.Settlement, UnitType.Farmland)).toHaveLength(2);
  expect(paintedState(player).foodCredit).toBe(0);
  for (const tile of old) expect(game.plotAt(tile)).toBeUndefined();
  expect((player as PlayerImpl)._landUse.size).toBe(2);
});

test("damage blocks new plots but keeps existing capacity", async () => {
  const { game, player } = await paintedFixture();
  const tile = [...player.tiles()][0];
  player.buildUnit(UnitType.Settlement, tile, {});
  game.addTileDamage(tile, 1000);
  expect(paintedResources(game, player).troopCapacity).toBe(10000);
});

test("an impossible reroll leaves the existing kit and balances unchanged", async () => {
  const { game, player } = await paintedFixture();
  const tile = [...player.tiles()][0];
  player.buildUnit(UnitType.Settlement, tile, {});
  const before = paintedResources(game, player),
    territory = [...player.tiles()];
  for (let y = 45; y <= 55; y++)
    for (let x = 45; x <= 55; x++) game.addTileDamage(game.ref(x, y), 1000);
  const attempt = new SpawnExecution("test", player.info(), game.ref(50, 50));
  attempt.init(game, game.ticks());
  attempt.tick(game.ticks());
  expect(paintedResources(game, player)).toEqual(before);
  expect([...player.tiles()]).toEqual(territory);
});
