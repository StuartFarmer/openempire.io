import { expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PaintTilesExecution } from "../src/core/execution/PaintTilesExecution";
import { PlayerType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { aiFixture } from "./util/PaintedAISetup";

test("records exact committed and rejected purchases, not capacity losses", async () => {
  const { game, player } = await aiFixture({
    inertResources: true,
    playerType: PlayerType.Human,
  });
  const tiles = [...player.tiles()].filter((t) => !game.plotAt(t));
  player.removeFoodMilli(player.foodMilli());
  player.addFood(1500n);
  game.addExecution(new PaintTilesExecution(player, "farm", tiles.slice(0, 2)));
  game.executeNextTick();
  const updates = game.executeNextTick();
  expect(updates[GameUpdateType.PaintedAction]).toEqual([
    expect.objectContaining({
      kind: "farm",
      outcome: "committed",
      spentMilli: 1_500_000n,
    }),
    expect.objectContaining({
      kind: "farm",
      outcome: "rejected",
      reason: "unaffordable",
      spentMilli: 0n,
    }),
  ]);
  player.relinquish(tiles[0]);
  expect(game.executeNextTick()[GameUpdateType.PaintedAction]).toEqual([]);
});

test("dispatch outcomes distinguish paid, unaffordable and invalid without duplicate records", async () => {
  const { game, player } = await aiFixture({
    inertResources: true,
    playerType: PlayerType.Human,
  });
  player.removeFoodMilli(player.foodMilli());
  player.addFood(60n);
  game.addExecution(new AttackExecution(300, player, null));
  expect(game.executeNextTick()[GameUpdateType.PaintedAction]).toEqual([
    expect.objectContaining({
      kind: "land",
      outcome: "committed",
      troops: 300,
      spentMilli: 60_000n,
    }),
  ]);
  game.addExecution(new AttackExecution(300, player, null));
  expect(game.executeNextTick()[GameUpdateType.PaintedAction]).toEqual([
    expect.objectContaining({
      outcome: "rejected",
      reason: "unaffordable",
      spentMilli: 0n,
    }),
  ]);
  game.addExecution(new AttackExecution(300, player, "missing"));
  expect(game.executeNextTick()[GameUpdateType.PaintedAction]).toEqual([
    expect.objectContaining({
      outcome: "rejected",
      reason: "invalid",
      spentMilli: 0n,
    }),
  ]);
  expect(game.executeNextTick()[GameUpdateType.PaintedAction]).toEqual([]);
});
