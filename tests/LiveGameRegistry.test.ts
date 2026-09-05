import { beforeEach, describe, expect, test, vi } from "vitest";

const createLeanRuntime = vi.hoisted(() =>
  vi.fn(async () => ({
    async beforeTick(): Promise<void> {},
    dispose(): void {},
  })),
);

const createSimpleRuntime = vi.hoisted(() =>
  vi.fn(async () => ({
    async beforeTick(): Promise<void> {},
    dispose(): void {},
  })),
);

vi.mock("../src/client/games/leanfront/runtime", () => ({
  createRuntime: createLeanRuntime,
}));

vi.mock("../src/client/games/leanfront-simple/runtime", () => ({
  createRuntime: createSimpleRuntime,
}));

import { getLiveGame, LIVE_GAMES } from "../src/client/games/registry";

describe("live-game registry", () => {
  beforeEach(() => {
    createLeanRuntime.mockClear();
    createSimpleRuntime.mockClear();
  });

  test("contains exactly the three selectable live games", () => {
    expect(LIVE_GAMES.map((entry) => entry.id)).toEqual([
      "openfront",
      "leanfront",
      "leanfront-simple",
    ]);
    expect(getLiveGame("terrain")).toBeUndefined();
  });

  test("uses one shared view source", () => {
    const open = getLiveGame("openfront")!;
    const lean = getLiveGame("leanfront")!;
    expect(open.system.views[open.view].source).toBe(
      lean.system.views[lean.view].source,
    );
  });

  test("all games expose the same two-method lifecycle", async () => {
    for (const entry of LIVE_GAMES) {
      const runtime = await entry.createRuntime({} as never);
      await expect(runtime.beforeTick()).resolves.toBeUndefined();
      expect(() => runtime.dispose()).not.toThrow();
    }
  });

  test("forwards LeanFront Simple's game to its runtime", async () => {
    const game = {} as never;

    await getLiveGame("leanfront-simple")!.createRuntime(game);

    expect(createSimpleRuntime).toHaveBeenCalledWith(game);
  });
});
