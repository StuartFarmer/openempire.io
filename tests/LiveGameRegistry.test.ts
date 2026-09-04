import { beforeEach, describe, expect, test, vi } from "vitest";

const createLeanRuntime = vi.hoisted(() =>
  vi.fn(async () => ({
    async beforeTick(): Promise<void> {},
    dispose(): void {},
  })),
);

vi.mock("../src/client/games/leanfront/runtime", () => ({
  createRuntime: createLeanRuntime,
}));

import { getLiveGame, LIVE_GAMES } from "../src/client/games/registry";

describe("live-game registry", () => {
  beforeEach(() => createLeanRuntime.mockClear());

  test("contains exactly the two selectable live games", () => {
    expect(LIVE_GAMES.map((entry) => entry.id)).toEqual([
      "openfront",
      "leanfront",
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

  test("both games expose the same two-method lifecycle", async () => {
    for (const entry of LIVE_GAMES) {
      const runtime = await entry.createRuntime({} as never);
      await expect(runtime.beforeTick()).resolves.toBeUndefined();
      expect(() => runtime.dispose()).not.toThrow();
    }
  });

  test("creating OpenFront never loads the LeanFront runtime", async () => {
    const runtime = await getLiveGame("openfront")!.createRuntime({} as never);
    await runtime.beforeTick();
    expect(createLeanRuntime).not.toHaveBeenCalled();
    runtime.dispose();
  });
});
