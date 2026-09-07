import { expect, test } from "vitest";
import { attachPaintedAI } from "../src/core/execution/PaintedAIExecution";
import {
  decidePaintedAI,
  paintedAIState,
} from "../src/core/execution/utils/PaintedAI";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { createGame } from "../src/core/game/GameImpl";
import { SimpleFrontConfig } from "../src/core/game/Rulesets";
import { setup } from "./util/Setup";

async function coast(): Promise<{ game: Game; player: Player }> {
  const base = await setup("ocean_and_land");
  class CoastConfig extends SimpleFrontConfig {
    override paintedEconomy() {
      return {
        ...super.paintedEconomy(),
        foodBootstrapFraction: 0,
        troopBootstrapFraction: 0,
        foodGrowthRate: 0,
        troopGrowthRate: 0,
      };
    }
  }
  const game = createGame(
    [],
    [],
    base.map(),
    base.miniMap(),
    new CoastConfig(base.config().gameConfig(), null, false),
  );
  const player = game.addPlayer(
    new PlayerInfo("Sailor", PlayerType.Bot, null, "sailor"),
  );
  for (let y = 0; y < game.height(); y++)
    for (let x = 0; x < 8; x++)
      if (game.isLand(game.ref(x, y))) player.conquer(game.ref(x, y));
  player.setSpawnTile(game.ref(7, 8));
  const tiles = [...player.tiles()];
  player.buildUnit(UnitType.Settlement, tiles[0], {});
  player.buildUnit(UnitType.Farmland, tiles[1], {});
  player.setTroops(2000);
  player.removeFoodMilli(player.foodMilli());
  player.addFood(60n);
  game.endSpawnPhase();
  attachPaintedAI("coast-test", game, player);
  return { game, player };
}

test("AI chooses and pays for a real crossing rather than remaining landlocked", async () => {
  const { game, player } = await coast();
  let boat;
  for (let i = 0; i < 150 && !boat; i++) {
    game.executeNextTick();
    boat = player.units(UnitType.TransportShip)[0];
  }
  expect(boat).toBeDefined();
  expect(player.foodMilli()).toBe(0n);
  expect(boat!.troops()).toBe(300);
  const destination = boat!.targetTile()!;
  for (let i = 0; i < 150; i++) game.executeNextTick();
  expect(game.owner(destination)).toBe(player);
  expect(player.foodMilli()).toBe(0n);
});

test("empty food cannot launch a boat or manufacture an unpaid crossing", async () => {
  const { game, player } = await coast();
  player.removeFoodMilli(player.foodMilli());
  for (let i = 0; i < 150; i++) game.executeNextTick();
  expect(player.units(UnitType.TransportShip)).toHaveLength(0);
  expect(player.troops()).toBe(2000);
});

test("a pending boat destination does not receive another expedition", async () => {
  const { game, player } = await coast();
  let boat;
  for (let i = 0; i < 150 && !boat; i++) {
    game.executeNextTick();
    boat = player.units(UnitType.TransportShip)[0];
  }
  expect(boat).toBeDefined();
  player.addFood(200n);
  const decision = decidePaintedAI(game, player, paintedAIState(player)!);
  expect(decision).not.toMatchObject({
    kind: "transport",
    tile: boat!.targetTile(),
  });
});

test("an expedition retreats if its destination becomes friendly", async () => {
  const { game, player } = await coast();
  let boat;
  for (let i = 0; i < 150 && !boat; i++) {
    game.executeNextTick();
    boat = player.units(UnitType.TransportShip)[0];
  }
  expect(boat).toBeDefined();
  player.conquer(boat!.targetTile()!);
  expect(decidePaintedAI(game, player, paintedAIState(player)!)).toEqual({
    kind: "boat-retreat",
    unitID: boat!.id(),
  });
});

test("no-route coast search consumes no more than its candidate budget", async () => {
  const { game, player } = await coast();
  for (let t = 0; t < game.width() * game.height(); t++)
    if (game.isLand(t)) player.conquer(t);
  const state = paintedAIState(player)!;
  const before = state.coastCursor;
  expect(decidePaintedAI(game, player, state).kind).not.toBe("transport");
  expect(state.coastCursor - before).toBeLessThanOrEqual(
    game.config().paintedAI()!.candidateBudget,
  );
});
