import { expect, test } from "vitest";
import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
import {
  PaintTilesExecution,
  purchasePaintedTile,
} from "../src/core/execution/PaintTilesExecution";
import { paintedResources } from "../src/core/execution/utils/PaintedEconomy";
import { UnitType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { IntentSchema } from "../src/core/Schemas";
import { paintedFixture } from "./util/PaintedSetup";

test("a partial stroke spends once and never waits for later refill", async () => {
  const { game, player } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFood(3000n);
  const tiles = [...player.tiles()].slice(0, 3);
  game.addExecution(new PaintTilesExecution(player, "farm", tiles));
  game.executeNextTick();
  const updates = game.executeNextTick();
  expect(paintedResources(game, player).farms).toBe(2);
  expect(player.foodMilli()).toBe(0n);
  expect(updates[GameUpdateType.PaintResult][0]).toMatchObject({
    placed: tiles.slice(0, 2),
    spentMilli: 3_000_000n,
    stoppedUnaffordable: true,
  });
  player.addFood(2000n);
  for (let i = 0; i < 3; i++) game.executeNextTick();
  expect(paintedResources(game, player).farms).toBe(2);
});

test("invalid and duplicate cells do not spend, seedless single builds share pricing", async () => {
  const { game, player, rival } = await paintedFixture();
  const tile = [...player.tiles()][0];
  const before = player.foodMilli();
  expect(purchasePaintedTile(game, player, "city", -1)).toBe("invalid");
  expect(purchasePaintedTile(game, player, "farm", [...rival.tiles()][0])).toBe(
    "invalid",
  );
  expect(player.foodMilli()).toBe(before);
  game.addExecution(
    new ConstructionExecution(player, UnitType.Settlement, tile),
  );
  game.executeNextTick();
  game.executeNextTick();
  expect(player.foodMilli()).toBe(2_000_000n);
  expect(game.plotAt(tile)?.type()).toBe(UnitType.Settlement);
  expect(purchasePaintedTile(game, player, "city", tile)).toBe("duplicate");
  expect(purchasePaintedTile(game, player, "farm", tile)).toBe("invalid");
  expect(player.foodMilli()).toBe(2_000_000n);
});

test("competing strokes cannot double-spend the same food", async () => {
  const { game, player } = await paintedFixture();
  const tiles = [...player.tiles()].slice(0, 3);
  game.addExecution(
    new PaintTilesExecution(player, "city", [tiles[0], tiles[0]]),
  );
  game.addExecution(new PaintTilesExecution(player, "farm", tiles.slice(1)));
  game.executeNextTick();
  game.executeNextTick();
  expect(paintedResources(game, player)).toMatchObject({
    cities: 1,
    farms: 1,
    foodMilli: 500_000n,
  });
});

test("wire schema bounds ordered strokes", () => {
  expect(
    IntentSchema.safeParse({ type: "paint_tiles", kind: "farm", tiles: [1, 2] })
      .success,
  ).toBe(true);
  for (const tiles of [[], [-1], [0.5], Array(4097).fill(1)])
    expect(
      IntentSchema.safeParse({ type: "paint_tiles", kind: "city", tiles })
        .success,
    ).toBe(false);
});

test("zero farms, cities and troops can rebuild using only baseline food", async () => {
  const { game, player } = await paintedFixture(true);
  player.removeFoodMilli(player.foodMilli());
  player.setTroops(0);
  for (let i = 0; i < 10000 && player.foodMilli() < 5_000_000n; i++)
    game.executeNextTick();
  expect(player.foodMilli()).toBe(5_000_000n);
  const [farm, city] = [...player.tiles()];
  expect(purchasePaintedTile(game, player, "farm", farm)).toBe("placed");
  expect(purchasePaintedTile(game, player, "city", city)).toBe("placed");
  expect(player.foodMilli()).toBe(1_500_000n);
  expect(player.troops()).toBe(0);
  game.executeNextTick();
  expect(player.foodMilli()).toBe(1_513_600n);
  expect(player.troops()).toBe(2);
});

test("damaged and other occupied cells cannot consume food", async () => {
  const { game, player } = await paintedFixture();
  const [damaged, occupied] = [...player.tiles()];
  game.addTileDamage(damaged, 1000);
  player.buildUnit(UnitType.DefensePost, occupied, {});
  const before = player.foodMilli();
  expect(purchasePaintedTile(game, player, "farm", damaged)).toBe("invalid");
  expect(purchasePaintedTile(game, player, "farm", occupied)).toBe("invalid");
  expect(player.foodMilli()).toBe(before);
});
