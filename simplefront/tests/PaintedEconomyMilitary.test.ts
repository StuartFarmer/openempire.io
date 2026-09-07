import { expect, test } from "vitest";
import { PAINTED_DEFAULTS } from "../src/core/configuration/PaintedEconomyConfig";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { TransportShipExecution } from "../src/core/execution/TransportShipExecution";
import { paintedResources } from "../src/core/execution/utils/PaintedEconomy";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { PlayerImpl } from "../src/core/game/PlayerImpl";
import { paintedFixture } from "./util/PaintedSetup";
import { setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

test("dispatch charges 500 new troops exactly 100 food without recruitment headroom", async () => {
  const { game, player } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFood(100n);
  player.setTroops(2000);
  game.addExecution(new AttackExecution(500, player, null));
  game.executeNextTick();
  expect(player.foodMilli()).toBe(0n);
  expect(player.troops()).toBe(1500);
  expect(paintedResources(game, player).totalTroops).toBe(2000);
});

test("shortage rejects without resizing troops or changing diplomacy", async () => {
  const { game, player, rival } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFood(99n);
  player.setTroops(2000);
  const relations = rival.relation(player);
  game.addExecution(new AttackExecution(500, player, rival.id()));
  game.executeNextTick();
  expect(player.foodMilli()).toBe(99000n);
  expect(player.troops()).toBe(2000);
  expect(player.outgoingAttacks()).toHaveLength(0);
  expect(rival.getEmbargoes()).toHaveLength(0);
  expect(rival.relation(player)).toBe(relations);
});

test("invalid and empty-front orders never commit", async () => {
  for (const troops of [0, -1, NaN, Infinity]) {
    const { game, player } = await paintedFixture();
    const food = player.foodMilli(),
      idle = player.troops();
    game.addExecution(new AttackExecution(troops, player, null));
    game.executeNextTick();
    expect(player.foodMilli()).toBe(food);
    expect(player.troops()).toBe(idle);
    expect(player.outgoingAttacks()).toHaveLength(0);
  }
  const { game, player } = await paintedFixture();
  const food = player.foodMilli();
  game.addExecution(
    new AttackExecution(500, player, null, null, true, [game.ref(15, 15)]),
  );
  game.executeNextTick();
  expect(player.foodMilli()).toBe(food);
  expect(player.outgoingAttacks()).toHaveLength(0);
});

test("reinforcement charges only new troops and empty food does not starve armies", async () => {
  const { game, player } = await paintedFixture();
  player.removeFoodMilli(player.foodMilli());
  player.addFood(200n);
  player.setTroops(2000);
  game.addExecution(new PlayerExecution(player));
  game.addExecution(new AttackExecution(500, player, null));
  game.addExecution(new AttackExecution(500, player, null));
  game.executeNextTick();
  expect(player.outgoingAttacks()).toHaveLength(1);
  expect(player.outgoingAttacks()[0].troops()).toBe(1000);
  expect(player.foodMilli()).toBe(0n);
  const land = player.numTilesOwned();
  for (let i = 0; i < 20; i++) game.executeNextTick();
  expect(player.numTilesOwned()).toBeGreaterThan(land);
  expect(player.troops()).toBe(1000);
});

test("queued boat passengers count once and land without another fee", async () => {
  const { game, player } = await paintedFixture();
  player.buildUnit(UnitType.Settlement, game.ref(10, 10), {});
  player.setTroops(10000);
  const boat = player.buildUnit(UnitType.TransportShip, game.ref(10, 11), {
    troops: 500,
  });
  const landing = AttackExecution.fromTransport(
    game,
    boat,
    null,
    game.ref(10, 11),
  );
  boat.delete(false);
  expect(paintedResources(game, player).totalTroops).toBe(10000);
  const food = player.foodMilli();
  game.addExecution(landing);
  game.executeNextTick();
  expect(player.foodMilli()).toBe(food);
  expect(paintedResources(game, player)).toMatchObject({
    totalTroops: 10000,
    deployedTroops: 500,
  });
});

test("retained combat produces the same territory and casualty trace as the copied original", async () => {
  const painted = await paintedFixture(false),
    legacy = await paintedFixture(false, true);
  for (const { game, player, rival } of [painted, legacy]) {
    player.setTroops(20000);
    rival.setTroops(10000);
    player.addFood(100000n);
    game.addExecution(
      new AttackExecution(10000, player, rival.id(), null, true, [
        game.ref(19, 15),
      ]),
    );
  }
  for (let tick = 0; tick < 25; tick++) {
    painted.game.executeNextTick();
    legacy.game.executeNextTick();
    const state = ({ player, rival }: typeof painted) => ({
      idle: player.troops(),
      defense: rival.troops(),
      territory: [...player.tiles()],
      attacks: player
        .outgoingAttacks()
        .map((a) => ({ troops: a.troops(), front: [...a.frontTiles()] })),
    });
    expect(state(painted)).toEqual(state(legacy));
  }
});

async function coast() {
  class CoastConfig extends TestConfig {
    override paintedEconomy() {
      return {
        ...PAINTED_DEFAULTS,
        foodBootstrapFraction: 0,
        troopBootstrapFraction: 0,
        foodGrowthRate: 0,
        troopGrowthRate: 0,
      };
    }
  }
  const info = new PlayerInfo("sailor", PlayerType.Human, null, "sailor");
  const game = await setup(
    "ocean_and_land",
    {},
    [info],
    undefined,
    CoastConfig,
  );
  const player = game.player(info.id);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 8; x++)
      if (game.isLand(game.ref(x, y))) player.conquer(game.ref(x, y));
  player.setSpawnTile(game.ref(7, 8));
  player.setTroops(2000);
  player.removeFoodMilli(player.foodMilli());
  player.addFood(100n);
  return { game, player };
}

test("real coast dispatch pays once through arrival and land handoff", async () => {
  const { game, player } = await coast();
  game.addExecution(new TransportShipExecution(player, game.ref(15, 8), 500));
  const actions = [...game.executeNextTick()[GameUpdateType.PaintedAction]];
  expect(player.units(UnitType.TransportShip)).toHaveLength(1);
  expect(player.foodMilli()).toBe(0n);
  expect(paintedResources(game, player).totalTroops).toBe(2000);
  for (let i = 0; i < 40; i++) {
    actions.push(...game.executeNextTick()[GameUpdateType.PaintedAction]);
    expect(player.foodMilli()).toBe(0n);
  }
  expect(player.units(UnitType.TransportShip)).toHaveLength(0);
  expect(game.owner(game.ref(15, 8))).toBe(player);
  expect(actions).toEqual([
    expect.objectContaining({
      kind: "transport",
      outcome: "committed",
      troops: 500,
      spentMilli: 100_000n,
    }),
  ]);
});

test("boat retreat keeps its original troop penalty but does not refund food", async () => {
  const { game, player } = await coast();
  game.addExecution(new TransportShipExecution(player, game.ref(15, 8), 500));
  game.executeNextTick();
  const boat = player.units(UnitType.TransportShip)[0];
  game.executeNextTick();
  game.executeNextTick();
  boat.updateTransportShipState({ isRetreating: true });
  for (let i = 0; i < 40; i++) game.executeNextTick();
  expect(player.units(UnitType.TransportShip)).toHaveLength(0);
  expect(player.troops()).toBe(1875);
  expect(player.foodMilli()).toBe(0n);
});

test("unaffordable boat cannot launch", async () => {
  const { game, player } = await coast();
  player.removeFoodMilli(1n);
  game.addExecution(new TransportShipExecution(player, game.ref(15, 8), 500));
  game.executeNextTick();
  expect(player.units(UnitType.TransportShip)).toHaveLength(0);
  expect(player.troops()).toBe(2000);
  expect(player.foodMilli()).toBe(99999n);
});

test("deployed troop changes participate in the painted resource hash", async () => {
  const { game, player } = await paintedFixture();
  game.addExecution(new AttackExecution(500, player, null));
  game.executeNextTick();
  const before = (player as PlayerImpl).hash();
  player.outgoingAttacks()[0].setTroops(499);
  expect((player as PlayerImpl).hash()).not.toBe(before);
});
