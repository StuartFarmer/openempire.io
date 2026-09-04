import { afterEach, describe, expect, test, vi } from "vitest";
import { getLiveGame } from "../src/client/games/registry";

describe("live game runtimes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("OpenFront creates and runs its actual no-op runtime", async () => {
    const runtime = await getLiveGame("openfront")!.createRuntime({} as never);

    await expect(runtime.beforeTick()).resolves.toBeUndefined();
    expect(() => runtime.dispose()).not.toThrow();
  });
});
