import { expect, test } from "vitest";
import {
  cityDevelopmentState,
  foundCityDevelopment,
} from "../src/core/development/CityDevelopmentExecution";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import {
  decidePaintedAI,
  paintedAIState,
} from "../src/core/execution/utils/PaintedAI";
import { PlayerInfo, PlayerType, UnitType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { aiFixture } from "./util/PaintedAISetup";

async function frontier() {
  const { game, player } = await aiFixture({ inertResources: true });
  const enemy = game.addPlayer(
    new PlayerInfo("Neighbor", PlayerType.Human, null, "neighbor"),
  );
  for (const tile of [...player.tiles()]) player.relinquish(tile);
  for (let y = 10; y < 20; y++)
    for (let x = 10; x < 30; x++)
      (x < 20 ? player : enemy).conquer(game.ref(x, y));
  player.buildUnit(UnitType.Settlement, game.ref(10, 10), {});
  player.buildUnit(UnitType.Farmland, game.ref(11, 10), {});
  player.setSpawnTile(game.ref(10, 10));
  enemy.setSpawnTile(game.ref(20, 10));
  game.config().gameConfig().spawnImmunityDuration = 0;
  player.setTroops(6000);
  enemy.setTroops(50);
  player.addFood(10000n);
  return { game, player, enemy };
}

test("military policy picks a vulnerable local enemy without bypassing reserves", async () => {
  const { game, player, enemy } = await frontier();
  const state = paintedAIState(player)!;
  state.policy = "military-first";
  const decision = decidePaintedAI(game, player, state);
  expect(decision).toMatchObject({ kind: "attack", targetID: enemy.id() });
  if (decision.kind === "attack") {
    expect(decision.troops).toBeLessThanOrEqual(
      6000 - Math.ceil(6000 * state.reserveRatio),
    );
    for (const tile of decision.sourceTiles)
      expect(game.owner(tile)).toBe(player);
  }
});

test("two stalled campaign samples cause retreat instead of further charges", async () => {
  const { game, player, enemy } = await frontier();
  game.addExecution(
    new AttackExecution(500, player, enemy.id(), null, true, [
      game.ref(19, 15),
    ]),
  );
  game.executeNextTick();
  const attack = player.outgoingAttacks()[0];
  expect(attack).toBeDefined();
  const state = paintedAIState(player)!;
  state.campaign = {
    targetID: enemy.id(),
    sampleTick: game.ticks() - 100,
    targetTiles: enemy.numTilesOwned(),
    ourTroops: 6000,
    stalled: 1,
  };
  expect(decidePaintedAI(game, player, state)).toEqual({
    kind: "retreat",
    attackID: attack.id(),
  });
});

test("dead campaign targets are cleared and never receive a new order", async () => {
  const { game, player, enemy } = await frontier();
  const state = paintedAIState(player)!;
  state.campaign = {
    targetID: enemy.id(),
    sampleTick: 0,
    targetTiles: 100,
    ourTroops: 6000,
    stalled: 0,
  };
  for (const tile of [...enemy.tiles()]) enemy.relinquish(tile);
  const decision = decidePaintedAI(game, player, state);
  expect(state.campaign).toBeNull();
  expect(decision).not.toMatchObject({ kind: "attack", targetID: enemy.id() });
});

test("an active campaign survives a rotated border window that omits its front", async () => {
  const { game, player, enemy } = await frontier();
  for (let y = 30; y < 90; y++)
    for (let x = 0; x < 90; x += 2) player.conquer(game.ref(x, y));
  game.addExecution(
    new AttackExecution(500, player, enemy.id(), null, true, [
      game.ref(19, 15),
    ]),
  );
  game.executeNextTick();
  const state = paintedAIState(player)!;
  state.campaign = {
    targetID: enemy.id(),
    sampleTick: game.ticks(),
    targetTiles: enemy.numTilesOwned(),
    ourTroops: 6000,
    stalled: 0,
  };
  state.borderCursor = 500;
  decidePaintedAI(game, player, state);
  expect(state.campaign?.targetID).toBe(enemy.id());
});

test("immune enemies never receive a discretionary order", async () => {
  const { game, player, enemy } = await frontier();
  game.config().gameConfig().spawnImmunityDuration = 10000;
  const state = paintedAIState(player)!;
  state.policy = "military-first";
  expect(decidePaintedAI(game, player, state)).not.toMatchObject({
    kind: "attack",
    targetID: enemy.id(),
  });
});

test("enemy orders seed one contiguous local front", async () => {
  const { game, player, enemy } = await frontier();
  const state = paintedAIState(player)!;
  state.policy = "military-first";
  // Two long separated seams, deliberately interleave conquest insertion order.
  for (const tile of [...player.tiles()]) player.relinquish(tile);
  for (const tile of [...enemy.tiles()]) enemy.relinquish(tile);
  for (let y = 10; y < 20; y++)
    for (const x of [10, 60]) {
      player.conquer(game.ref(x, y));
      enemy.conquer(game.ref(x + 1, y));
    }
  player.buildUnit(UnitType.Settlement, game.ref(10, 10), {});
  player.buildUnit(UnitType.Farmland, game.ref(10, 11), {});
  const action = decidePaintedAI(game, player, state);
  expect(action.kind).toBe("attack");
  if (action.kind !== "attack") return;
  const remaining = new Set(action.sourceTiles);
  const queue = [action.sourceTiles[0]];
  remaining.delete(queue[0]);
  for (const t of queue)
    for (const n of game.neighbors(t)) if (remaining.delete(n)) queue.push(n);
  expect(remaining.size).toBe(0);
});

test("food-limited large armies invest in farms without reserving the entire treasury", async () => {
  const { game, player, enemy } = await frontier();
  const empty = [...player.tiles()].filter((t) => !game.plotAt(t));
  player.addFood(1000000n);
  for (const tile of empty.slice(0, 30))
    player.buildUnit(UnitType.Settlement, tile, {});
  player.setTroops(200000);
  enemy.setTroops(10000);
  player.removeFoodMilli(player.foodMilli());
  player.addFood(3000n);
  const state = paintedAIState(player)!;
  expect(decidePaintedAI(game, player, state)).toMatchObject({
    kind: "paint",
    plot: "farm",
  });
});

test("continuous city demand cannot starve a favorable campaign indefinitely", async () => {
  const { game, player, enemy } = await frontier();
  // Disable autonomous scheduling only; query the real policy on successive ticks.
  paintedAIState(player)!.phase = -1;
  const choices = [];
  for (let i = 0; i < 60; i++) {
    player.setTroops(9000);
    player.removeFoodMilli(player.foodMilli());
    player.addFood(8000n);
    if (i % 20 === 0)
      choices.push(decidePaintedAI(game, player, paintedAIState(player)!));
    game.executeNextTick();
  }
  expect(choices.some((a) => a.kind === "paint" && a.plot === "city")).toBe(
    true,
  );
  expect(
    choices.some((a) => a.kind === "attack" && a.targetID === enemy.id()),
  ).toBe(true);
});

test("organic opening concentrates an affordable paid hostile push at 8000 people", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  const enemy = game.addPlayer(
    new PlayerInfo("Neighbor", PlayerType.Human, null, "neighbor"),
  );
  for (let y = 30; y < 70; y++)
    for (let x = 56; x < 76; x++) enemy.conquer(game.ref(x, y));
  for (let y = 46; y < 55; y++) player.conquer(game.ref(55, y));
  enemy.setSpawnTile(game.ref(60, 50));
  enemy.setTroops(8000);
  game.config().gameConfig().spawnImmunityDuration = 0;
  const state = paintedAIState(player)!;
  state.policy = "military-first";
  const decision = decidePaintedAI(game, player, state);
  expect(decision).toMatchObject({
    kind: "attack",
    targetID: enemy.id(),
    troops: 2400,
  });
  const before = enemy.numTilesOwned();
  let paid = false;
  let hostile = false;
  for (let i = 0; i < 30; i++) {
    const tick = game.ticks();
    const updates = game.executeNextTick()[GameUpdateType.PaintedAction];
    for (const a of updates)
      if (a.kind === "land" && a.outcome === "committed") {
        console.info("organic hostile dispatch", {
          tick,
          troops: a.troops,
          spentMilli: a.spentMilli,
        });
        expect(a.spentMilli).toBe(BigInt(a.troops) * 200n);
        paid = true;
      }
    hostile ||= player.outgoingAttacks().some((a) => a.target() === enemy);
  }
  expect(paid).toBe(true);
  expect(hostile).toBe(true);
  expect(enemy.numTilesOwned()).toBeLessThan(before);
  expect(player.troops()).toBeGreaterThan(0);
});

test("organic target ranking values developed housing equally with or without seed units", async () => {
  const { game, player } = await aiFixture({
    organic: true,
    inertResources: true,
  });
  const enemies = ["a-seed", "z-housing"].map((id) =>
    game.addPlayer(new PlayerInfo(id, PlayerType.Human, null, id)),
  );
  const targets = [game.ref(40, 30), game.ref(60, 30)];
  for (const [i, enemy] of enemies.entries()) {
    for (let y = 10; y <= 30; y++)
      for (let x = 40 + 20 * i; x < 50 + 20 * i; x++)
        enemy.conquer(game.ref(x, y));
    enemy.setSpawnTile(targets[i]);
    enemy.setTroops(80);
    foundCityDevelopment(game, enemy, targets[i]);
    player.conquer(game.ref(40 + 20 * i, 31));
  }
  enemies[0].buildUnit(UnitType.Settlement, targets[0], {});
  const model = cityDevelopmentState(player)!.model;
  const snapshot = model.deterministicState();
  snapshot.tiles.find(([tile]) => tile === targets[1])![1] = 2;
  model.restore(snapshot);
  game.config().gameConfig().spawnImmunityDuration = 0;
  const state = paintedAIState(player)!;
  state.policy = "military-first";
  expect(decidePaintedAI(game, player, state)).toMatchObject({
    kind: "attack",
    targetID: enemies[1].id(),
  });
  snapshot.tiles.find(([tile]) => tile === targets[1])![1] = 1;
  model.restore(snapshot);
  // Equal physical housing uses the existing deterministic target tie-break.
  expect(decidePaintedAI(game, player, state)).toMatchObject({
    kind: "attack",
    targetID: enemies[0].id(),
  });
});
