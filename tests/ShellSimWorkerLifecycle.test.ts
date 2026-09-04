import { afterEach, describe, expect, test, vi } from "vitest";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

async function loadWorker(beforeTick: () => Promise<void>) {
  let tick = 0;
  const game = {
    width: () => 1,
    height: () => 1,
    config: () => ({ food: () => ({ popPerDensity: 10_000 }) }),
    layer: () => 0,
    ticks: () => tick,
    units: () => [],
    playerByClientID: () => null,
    players: () => [],
    nations: () => [],
    inSpawnPhase: () => false,
  };
  const runner = {
    game,
    addTurn: () => {},
    executeNextTick: () => {
      tick += 1;
    },
  };
  const context = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };

  vi.resetModules();
  vi.stubGlobal("self", context);
  vi.doMock("../src/core/GameRunner", () => ({
    createGameRunner: async () => runner,
    GameRunner: class {},
  }));
  vi.doMock("../src/client/games/registry", () => ({
    createLiveGameRuntime: async () => ({ beforeTick, dispose: () => {} }),
  }));

  await import("../src/client/webgpu/ShellSim.worker");
  const send = (data: unknown) =>
    context.onmessage!(new MessageEvent("message", { data }));
  send({
    type: "init",
    mapType: "world",
    bots: 0,
    cdnBase: "",
    assetManifest: {},
    ruleset: "openfront",
  });
  await flushMicrotasks();

  expect(
    context.postMessage.mock.calls.some(
      ([message]) => message.type === "ready",
    ),
  ).toBe(true);
  return { context, send, ticks: () => tick };
}

describe("ShellSim worker lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock("../src/core/GameRunner");
    vi.doUnmock("../src/client/games/registry");
    vi.resetModules();
  });

  test("pause and resume serialize behind a pending pre-tick and discard the stale generation", async () => {
    vi.useFakeTimers();
    const first = deferred();
    let beforeTicks = 0;
    let active = 0;
    let maxActive = 0;
    const worker = await loadWorker(async () => {
      beforeTicks += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        if (beforeTicks === 1) await first.promise;
      } finally {
        active -= 1;
      }
    });

    worker.send({ type: "running", running: true, turbo: false });
    await flushMicrotasks();
    worker.send({ type: "running", running: false, turbo: false });
    worker.send({ type: "running", running: true, turbo: false });
    await flushMicrotasks();
    const callsWhilePending = beforeTicks;

    first.resolve();
    await flushMicrotasks();
    worker.send({ type: "running", running: false, turbo: false });

    const frameTicks = worker.context.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "frame")
      .map((message) => message.tick);
    expect({ callsWhilePending, maxActive, beforeTicks, frameTicks }).toEqual({
      callsWhilePending: 1,
      maxActive: 1,
      beforeTicks: 2,
      frameTicks: [0, 1],
    });
    expect(worker.ticks()).toBe(1);
  });

  test("a rejected pre-tick posts one error and stops the loop", async () => {
    vi.useFakeTimers();
    const failure = deferred();
    let beforeTicks = 0;
    const worker = await loadWorker(() => {
      beforeTicks += 1;
      return failure.promise;
    });

    worker.send({ type: "running", running: true, turbo: false });
    await flushMicrotasks();
    failure.reject(new Error("GPU pre-tick failed"));
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(1_000);

    const messages = worker.context.postMessage.mock.calls.map(
      ([message]) => message,
    );
    expect(messages.filter((message) => message.type === "error")).toEqual([
      { type: "error", message: "GPU pre-tick failed" },
    ]);
    expect(beforeTicks).toBe(1);
    expect(
      messages
        .filter((message) => message.type === "frame")
        .map((message) => message.tick),
    ).toEqual([0]);
    expect(worker.ticks()).toBe(0);
  });
});
