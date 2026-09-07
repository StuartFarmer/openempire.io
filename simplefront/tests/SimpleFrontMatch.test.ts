import { expect, test } from "vitest";
import {
  parseSimpleFrontDifficulty,
  simpleFrontResult,
} from "../src/client/shell/SimpleFrontMatch";
import { Difficulty } from "../src/core/game/Game";
import { aiFixture } from "./util/PaintedAISetup";

test("difficulty validation defaults safely", () => {
  expect(parseSimpleFrontDifficulty("Hard")).toBe(Difficulty.Hard);
  expect(parseSimpleFrontDifficulty("tampered")).toBe(Difficulty.Medium);
  expect(parseSimpleFrontDifficulty(null)).toBe(Difficulty.Medium);
});

test("result projects the real winner and simulation time", async () => {
  const { game, player } = await aiFixture();
  expect(simpleFrontResult(game, player.id())).toBeNull();
  for (let i = 0; i < 30; i++) game.executeNextTick();
  game.setWinner(player, game.stats().stats());
  expect(simpleFrontResult(game, player.id())).toEqual({
    winnerID: player.id(),
    winnerName: player.displayName(),
    humanWon: true,
    elapsedSeconds: game.elapsedGameSeconds(),
  });
  expect(simpleFrontResult(game, "someone-else")?.humanWon).toBe(false);
});
