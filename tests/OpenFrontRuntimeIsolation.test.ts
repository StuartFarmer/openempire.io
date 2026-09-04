import { afterEach, describe, expect, test, vi } from "vitest";

const leanRuntimePath = "../src/client/games/leanfront/runtime";

describe("OpenFront runtime isolation", () => {
  afterEach(() => {
    vi.doUnmock(leanRuntimePath);
    vi.resetModules();
  });

  test("loading the registry and running OpenFront never evaluates LeanFront runtime", async () => {
    vi.resetModules();
    let evaluated = false;
    vi.doMock(leanRuntimePath, () => {
      evaluated = true;
      return { createRuntime: vi.fn() };
    });

    const { getLiveGame } = await import("../src/client/games/registry");
    expect(evaluated).toBe(false);

    const runtime = await getLiveGame("openfront")!.createRuntime({} as never);
    await runtime.beforeTick();
    runtime.dispose();

    expect(evaluated).toBe(false);
  });
});
