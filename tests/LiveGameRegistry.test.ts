import { describe, expect, test } from "vitest";

import { getLiveGame, LIVE_GAMES } from "../src/client/games/registry";

describe("live-game registry", () => {
  test("contains only the worker-backed OpenFront game", () => {
    expect(LIVE_GAMES.map((entry) => entry.id)).toEqual(["openfront"]);
    expect(getLiveGame("leanfront")).toBeUndefined();
    expect(getLiveGame("terrain")).toBeUndefined();
  });

  test("the live game exposes the two-method lifecycle", async () => {
    for (const entry of LIVE_GAMES) {
      const runtime = await entry.createRuntime({} as never);
      await expect(runtime.beforeTick()).resolves.toBeUndefined();
      expect(() => runtime.dispose()).not.toThrow();
    }
  });
});
