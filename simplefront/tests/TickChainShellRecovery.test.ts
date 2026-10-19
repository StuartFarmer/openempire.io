import { afterEach, expect, test, vi } from "vitest";
import { GameShellPage } from "../src/client/GameShellPage";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test("terminal shell failure terminates the worker, disables input, and retains export evidence", () => {
  const page = new GameShellPage() as any;
  const worker = { terminate: vi.fn(), postMessage: vi.fn() };
  page.worker = worker;
  page.systemId = "simplefront";
  page.failedChainRecord = { blocks: [{ tick: 0 }] };
  page.running = true;
  page.stopChain("Repeated execution failure");
  page.toggleRunning();
  page.postWorker({ type: "intent", intent: { type: "spawn", tile: 5 } });
  page.postWorker({ type: "running", running: true, turbo: true });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(page.worker).toBeNull();
  expect(page.running).toBe(false);
  expect(page.chainStopped).toBe(true);
  expect(page.recoveryTimer).toBeNull();
  expect(page.failedChainRecord.blocks).toHaveLength(1);
});

test("one failed fresh rebuild is terminal; recreating a worker does not reset the budget", async () => {
  const page = new GameShellPage() as any;
  const start = vi.spyOn(page, "startWorker").mockResolvedValue(undefined);
  vi.useFakeTimers();
  const record = { blocks: [{ tick: 0 }] };
  await page.recoverChain(record, "Tick failed");
  expect(page.recoveryTarget).toBe(0);
  await page.recoverChain(record, "Same tick failed again");
  expect(start).toHaveBeenCalledTimes(1);
  expect(page.chainStopped).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test("rebuild deadline terminates the affected client", async () => {
  const page = new GameShellPage() as any;
  vi.spyOn(page, "startWorker").mockResolvedValue(undefined);
  vi.useFakeTimers();
  await page.recoverChain({ blocks: [] }, "Tick failed");
  await vi.advanceTimersByTimeAsync(120001);
  expect(page.chainStopped).toBe(true);
  expect(page.status).toContain("120 seconds");
});

test("an obsolete asynchronous recovery failure cannot stop a newer match", async () => {
  vi.useFakeTimers();
  const page = new GameShellPage() as any;
  let reject!: (reason: Error) => void;
  vi.spyOn(page, "startWorker").mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const recovery = page.recoverChain({ blocks: [] }, "Tick failed");
  page.destroySim();
  reject(new Error("Old worker import failed"));
  await recovery;
  expect(page.chainStopped).toBe(false);
});

test("worker replacement clears dynamic GPU planes before replacing their CPU mirrors", async () => {
  const page = new GameShellPage() as any;
  page.mapKey = "invalid-map"; // stop before loading a new worker
  page.kernel = { clearBuffer: vi.fn() };
  page.litHighlight = [10, 11];
  await page.startWorker();
  expect(
    page.kernel.clearBuffer.mock.calls.map(([name]: [string]) => name),
  ).toEqual([
    "owner",
    "plot",
    "density",
    "front",
    "damage",
    "supply",
    "highlight",
  ]);
});

test.each(["paused", "finished"])(
  "a %s match completes recovery at the retained head without an extra tick",
  (mode) => {
    vi.useFakeTimers();
    const page = new GameShellPage() as any;
    vi.spyOn(page, "onWorkerFrame").mockImplementation(() => {});
    page.chainRecovery.startRebuild();
    page.recoveryTarget = 10;
    page.running = false;
    page.matchResult = mode === "finished" ? { winner: "human123" } : null;
    page.recoveryTimer = setTimeout(() => {
      throw new Error("Recovery was not completed");
    }, 120000);
    page.onWorkerMessage({
      type: "frame",
      chain: { tick: 10, chainHash: "a".repeat(64) },
    });
    expect(page.recoveryTarget).toBeNull();
    expect(page.recoveryTimer).toBeNull();
    expect(page.running).toBe(false);
  },
);
