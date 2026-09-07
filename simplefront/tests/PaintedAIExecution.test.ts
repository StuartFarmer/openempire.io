import { expect, test } from "vitest";
import { paintedAIConfig } from "../src/core/configuration/PaintedAIConfig";
import { attachPaintedAI } from "../src/core/execution/PaintedAIExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import * as ai from "../src/core/execution/utils/PaintedAI";
import { Difficulty, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { PlayerImpl } from "../src/core/game/PlayerImpl";
import { aiFixture } from "./util/PaintedAISetup";

test("difficulty changes cadence only, and winning stops the controller", async () => {
  expect(
    Object.values(Difficulty).map((d) => paintedAIConfig(d).decisionTicks),
  ).toEqual([30, 20, 15, 10]);
  const { game, player } = await aiFixture();
  game.setWinner(player, game.stats().stats());
  game.executeNextTick();
  game.executeNextTick();
  expect(ai.paintedAIState(player)?.attached).toBe(false);
});

test("spawn reroll resets strategy but retains the single controller", async () => {
  const { game, player } = await aiFixture({ inSpawn: true });
  const state = ai.paintedAIState(player)!;
  state.campaign = {
    targetID: "stale",
    sampleTick: 0,
    targetTiles: 1,
    ourTroops: 2000,
    stalled: 1,
  };
  state.coastCursor = 100;
  state.pendingCoast = 1;
  game.addExecution(
    new SpawnExecution(
      "ai-test",
      new PlayerInfo(player.name(), PlayerType.Bot, null, player.id()),
      game.ref(70, 70),
    ),
  );
  game.executeNextTick();
  game.executeNextTick();
  expect(ai.paintedAIState(player)).toBe(state);
  expect(state).toMatchObject({
    attached: true,
    campaign: null,
    pendingCoast: null,
    coastCursor: 0,
    lastDecisionTick: -1,
  });
});

test("dispatch sizing respects food and total-deployment reserves", () => {
  expect(ai.dispatchTroops).toBeTypeOf("function");
  expect(ai.dispatchTroops(2000, 2000, 0.35, 0.15, 60_000n, 200n)).toBe(300);
  expect(ai.dispatchTroops(2000, 2000, 0.35, 0.15, 20_000n, 200n)).toBe(100);
  expect(ai.dispatchTroops(300, 2000, 0.35, 0.3, 1_000_000n, 200n)).toBe(0);
  expect(ai.dispatchTroops(2000, 2000, 0.35, 0.15, 0n, 0n)).toBe(300);
  expect(ai.dispatchTroops(NaN, 2000, 0.35, 0.15, 0n, 200n)).toBe(0);
});

test("repeated attachment preserves one deterministic state and cadence", async () => {
  const a = await aiFixture(),
    b = await aiFixture();
  const state = ai.paintedAIState(a.player);
  attachPaintedAI("ai-test", a.game, a.player);
  expect(ai.paintedAIState(a.player)).toBe(state);
  for (let i = 0; i < 80; i++) {
    a.game.executeNextTick();
    b.game.executeNextTick();
    expect((a.player as PlayerImpl).hash()).toBe(
      (b.player as PlayerImpl).hash(),
    );
  }
});

test("successful bot and nation spawns attach selected AI, humans do not", async () => {
  for (const playerType of [PlayerType.Bot, PlayerType.Nation]) {
    const { player } = await aiFixture({ playerType });
    expect((player as PlayerImpl)._paintedAI).toMatchObject({
      attached: true,
      lastDecisionTick: -1,
    });
  }
  const { player } = await aiFixture({ playerType: PlayerType.Human });
  expect((player as PlayerImpl)._paintedAI).toBeNull();
});

test("AI stays inactive during spawn and stops after defeat", async () => {
  const { game, player } = await aiFixture({ inSpawn: true });
  for (let i = 0; i < 50; i++) game.executeNextTick();
  expect((player as PlayerImpl)._paintedAI).toMatchObject({
    lastDecisionTick: -1,
  });
  game.endSpawnPhase();
  for (let i = 0; i < 50; i++) game.executeNextTick();
  expect((player as PlayerImpl)._paintedAI?.lastDecisionTick).toBeGreaterThan(
    0,
  );
  for (const tile of [...player.tiles()]) player.relinquish(tile);
  game.executeNextTick();
  expect((player as PlayerImpl)._paintedAI?.attached).toBe(false);
});

test("strategic state changes the hash but observation counters do not", async () => {
  const { player } = await aiFixture();
  const impl = player as PlayerImpl;
  expect(impl._paintedAI).toBeTruthy();
  const before = impl.hash();
  impl._paintedAI!.foodBlockedTicks += 20;
  expect(impl.hash()).toBe(before);
  impl._paintedAI!.phase++;
  expect(impl.hash()).not.toBe(before);
});
