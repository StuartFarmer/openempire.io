import { afterEach, describe, expect, test, vi } from "vitest";
import { getLiveGame } from "../src/client/games/registry";
import { createRuntime as createLeanRuntime } from "../src/client/games/leanfront/runtime";

describe("live game runtimes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("OpenFront creates and runs its actual no-op runtime", async () => {
    const runtime = await getLiveGame("openfront")!.createRuntime(
      {} as never,
    );

    await expect(runtime.beforeTick()).resolves.toBeUndefined();
    expect(() => runtime.dispose()).not.toThrow();
  });

  test("LeanFront runs the CPU fallback when WebGPU is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const runtime = await createLeanRuntime({} as never);

    expect(warn).toHaveBeenCalledWith(
      "leanfront: no GPU economy available; using the CPU path",
    );
    await expect(runtime.beforeTick()).resolves.toBeUndefined();
    expect(() => runtime.dispose()).not.toThrow();
  });
});
