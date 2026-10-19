import { expect, test, vi } from "vitest";
import { createGameRunner } from "../src/core/GameRunner";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { GameImpl } from "../src/core/game/GameImpl";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { chainLoader, chainStart } from "./util/TickChainFixture";

async function fixture(stateHashEveryTicks?: number) {
  const hashes: number[] = [];
  const runner = await createGameRunner(
    chainStart(),
    "human123",
    chainLoader(),
    (update) => {
      if ("errMsg" in update) throw new Error(update.errMsg);
      hashes.push(...update.updates[GameUpdateType.Hash].map((h) => h.tick));
    },
    "simplefront",
    DEFAULT_CONFIG,
    { stateHashEveryTicks },
  );
  const step = () => {
    const tick = runner.game.ticks();
    runner.addTurn({
      turnNumber: tick,
      intents:
        tick === 0
          ? [
              {
                type: "spawn",
                tile: runner.game.ref(50, 50),
                clientID: "human123",
              },
            ]
          : [],
    });
    expect(runner.executeNextTick()).toBe(true);
  };
  return { runner, hashes, step };
}

test("legacy callers keep the original checkpoint cadence", async () => {
  const f = await fixture();
  for (let i = 0; i < 21; i++) f.step();
  expect(f.hashes).toEqual([0, 10, 20]);
});

test("disabled diagnostics never scan state and preserve actual simulation", async () => {
  const original = await fixture(),
    disabled = await fixture(0);
  const game = disabled.runner.game as GameImpl;
  const spy = vi.spyOn(game, "hash");
  for (let i = 0; i < 400; i++) {
    original.step();
    disabled.step();
  }
  expect(disabled.hashes).toEqual([]);
  expect(spy).not.toHaveBeenCalled();
  expect(game.cityDevelopment!.deterministicState()).toEqual(
    (original.runner.game as GameImpl).cityDevelopment!.deterministicState(),
  );
  expect(game.hash()).toBe((original.runner.game as GameImpl).hash());
  expect(
    game
      .allPlayers()
      .map((p) => [p.troops(), p.foodMilli(), p.numTilesOwned()]),
  ).toEqual(
    original.runner.game
      .allPlayers()
      .map((p) => [p.troops(), p.foodMilli(), p.numTilesOwned()]),
  );
});

test("developer checks can use a wider interval", async () => {
  const f = await fixture(300);
  for (let i = 0; i < 601; i++) f.step();
  expect(f.hashes).toEqual([0, 300, 600]);
});

test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid diagnostic interval %s",
  async (interval) => {
    await expect(fixture(interval)).rejects.toThrow(
      "Invalid state hash interval",
    );
  },
);
