import { afterEach, expect, test, vi } from "vitest";
import type {
  ShellSimFrame,
  ShellSimIn,
  ShellSimOut,
} from "../src/client/webgpu/ShellSimProtocol";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { GameMapType } from "../src/core/game/Game";
import { expectedLayersByteLength } from "../src/core/game/MapLayers";
import { installFakeClockCrypto } from "./util/FakeClockCrypto";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function worker() {
  installFakeClockCrypto();
  vi.resetModules();
  vi.useFakeTimers();
  const manifest = {
    map: { width: 100, height: 100, num_land_tiles: 10000 },
    map4x: { width: 25, height: 25, num_land_tiles: 625 },
    layers: true,
    terrain_colors: true,
    nations: [],
  };
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () => manifest,
    arrayBuffer: async () =>
      url.endsWith("layers.bin")
        ? new Uint8Array(expectedLayersByteLength(100, 100)).buffer
        : new Uint8Array(url.endsWith("map4x.bin") ? 625 : 10000).fill(128)
            .buffer,
  }));
  const messages: ShellSimOut[] = [];
  const context = {
    onmessage: null as ((e: MessageEvent<ShellSimIn>) => void) | null,
    postMessage(message: ShellSimOut) {
      messages.push(message);
    },
  };
  vi.stubGlobal("self", context);
  await import("../src/client/webgpu/ShellSim.worker");
  const send = (data: ShellSimIn) =>
    context.onmessage!(new MessageEvent("message", { data }));
  const frames = () =>
    messages.filter((m): m is ShellSimFrame => m.type === "frame");
  const start = async (
    settings = {},
    ruleset: "simplefront" | "openfront" = "simplefront",
  ) => {
    const count = messages.length;
    send({
      type: "init",
      mapType: GameMapType.Verdantia,
      bots: 0,
      cdnBase: "",
      assetManifest: {},
      ruleset,
      ...settings,
    });
    await vi.waitFor(
      () =>
        expect(
          messages
            .slice(count)
            .some((m) => m.type === "frame" || m.type === "error"),
        ).toBe(true),
      { timeout: 10000, interval: 5 },
    );
  };
  return { messages, send, frames, start };
}

test("real worker opts into development, emits incremental physical levels and resets a grown match", async () => {
  const w = await worker();
  const settings = {
    cityDevelopment: {
      ...DEFAULT_CONFIG,
      rate: 2000,
      populationRate: 2,
      lowerLevelBirths: 10,
      upperLevelBirths: 10,
    },
  };
  await w.start(settings);
  expect(w.frames()[0].development).toMatchObject({
    reset: true,
    width: 100,
    height: 100,
  });
  expect(Array.from(w.frames()[0].development!.tiles)).toEqual([]);
  w.send({ type: "intent", intent: { type: "spawn", tile: 5050 } });
  w.send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(20000);
  const changes = w
    .frames()
    .flatMap((f) => (f.development ? Array.from(f.development.tiles) : []));
  expect(changes.length).toBeGreaterThan(6);
  const urban = w.frames().slice(-1)[0].myStats!.urban!;
  expect(urban).toBeDefined();
  expect(urban.population).toBe(urban.idle + urban.deployed);
  expect(urban.housing).toBeGreaterThanOrEqual(10000);
  expect(urban.occupancy).toBe(urban.population / urban.housing);
  expect(
    w
      .frames()
      .slice(1)
      .filter((f) => f.development)
      .every((f) => !f.development!.reset),
  ).toBe(true);
  await w.start(settings);
  expect(w.frames().slice(-1)[0]!.development).toMatchObject({ reset: true });
  expect(Array.from(w.frames().slice(-1)[0]!.development!.tiles)).toEqual([]);
  await w.start();
  expect(w.frames().slice(-1)[0]!.development).toBeUndefined();
  expect(w.frames().slice(-1)[0]!.myStats?.urban).toBeUndefined();
  expect(w.messages.filter((m) => m.type === "error")).toEqual([]);
});

test("worker rejects invalid development config and development on other rulesets", async () => {
  const w = await worker();
  await w.start({ cityDevelopment: DEFAULT_CONFIG }, "openfront");
  expect(w.messages.slice(-1)[0]).toMatchObject({ type: "error" });
  await w.start({ cityDevelopment: { ...DEFAULT_CONFIG, rate: NaN } });
  expect(w.messages.slice(-1)[0]).toMatchObject({ type: "error" });
  expect(w.frames()).toEqual([]);
});

test("normal SimpleFront worker advances without periodic state hashing", async () => {
  const w = await worker();
  const { GameImpl } = await import("../src/core/game/GameImpl");
  const hash = vi.spyOn(GameImpl.prototype, "hash");
  await w.start({ cityDevelopment: DEFAULT_CONFIG });
  w.send({ type: "intent", intent: { type: "spawn", tile: 5050 } });
  w.send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(10000);
  expect(w.frames().slice(-1)[0]!.tick).toBeGreaterThanOrEqual(100);
  expect(hash).not.toHaveBeenCalled();
  w.send({ type: "running", running: false, turbo: false });
});

test("worker records each executed tick and exports its original initialization", async () => {
  const w = await worker();
  await w.start({ cityDevelopment: DEFAULT_CONFIG });
  w.send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(1000);
  w.send({ type: "running", running: false, turbo: false });
  w.send({ type: "export_chain" });
  await vi.waitFor(() =>
    expect(w.messages.some((m) => m.type === "chain_record")).toBe(true),
  );
  const exported = w.messages.find((m) => m.type === "chain_record")!;
  if (exported.type !== "chain_record") throw new Error("Missing record");
  expect(exported.record.appliedThrough.tick).toBe(
    w.frames().slice(-1)[0].tick - 1,
  );
  expect(
    exported.record.blocks
      .slice(0, exported.record.appliedThrough.tick + 1)
      .map((b) => b.tick),
  ).toEqual(Array.from({ length: w.frames().slice(-1)[0].tick }, (_, n) => n));
  expect(exported.record.stateCheckpoints).toEqual([]);
});
test("a replacement worker replays original IDs, restores render state and continues", async () => {
  const w = await worker();
  await w.start({ cityDevelopment: DEFAULT_CONFIG });
  w.send({ type: "intent", intent: { type: "spawn", tile: 5050 } });
  w.send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(12000);
  w.send({ type: "running", running: false, turbo: false });
  w.send({ type: "export_chain" });
  await vi.advanceTimersByTimeAsync(20);
  const saved = w.messages.find((m) => m.type === "chain_record");
  expect(saved?.type).toBe("chain_record");
  if (saved?.type !== "chain_record") throw new Error("Missing recording");
  const before = w.frames().slice(-1)[0];
  await w.start({ recoverRecord: saved.record });
  const rebuilt = w.frames().slice(-1)[0];
  expect(rebuilt.chain).toEqual(saved.record.appliedThrough);
  expect(rebuilt.myStats).toEqual(before.myStats);
  expect(rebuilt.owner!.length).toBeGreaterThan(0);
  expect(rebuilt.development?.reset).toBe(true);
  w.send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(200);
  expect(w.frames().slice(-1)[0].chain!.tick).toBeGreaterThan(
    saved.record.appliedThrough.tick,
  );
  w.send({ type: "running", running: false, turbo: false });
  expect(w.messages.filter((m) => m.type === "error")).toEqual([]);
});

test("a partially mutated tick is preserved as pending and retried only on a fresh runner", async () => {
  const w = await worker();
  await w.start({ cityDevelopment: DEFAULT_CONFIG });
  const { GameImpl } = await import("../src/core/game/GameImpl");
  const original = GameImpl.prototype.executeNextTick;
  let failedGame: unknown;
  const execute = vi
    .spyOn(GameImpl.prototype, "executeNextTick")
    .mockImplementationOnce(function (this: InstanceType<typeof GameImpl>) {
      failedGame = this;
      original.call(this);
      throw new Error("Injected failure after mutation");
    });
  w.send({ type: "intent", intent: { type: "spawn", tile: 5050 } });
  w.send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(100);
  const failure = w.messages.find((m) => m.type === "chain_failure");
  expect(failure?.type).toBe("chain_failure");
  if (failure?.type !== "chain_failure")
    throw new Error("Missing failure record");
  expect(failure.record.appliedThrough.tick).toBe(-1);
  expect(failure.record.blocks).toHaveLength(1);
  w.send({ type: "running", running: true, turbo: true });
  await vi.advanceTimersByTimeAsync(100);
  expect(execute).toHaveBeenCalledTimes(1);
  await w.start({ recoverRecord: failure.record });
  // The retained pending tick finishes during rebuild, even if playback stays paused.
  expect(w.frames().slice(-1)[0].chain!.tick).toBe(0);
  expect(w.frames().slice(-1)[0].myStats).not.toBeNull();
  w.send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(100);
  expect(
    execute.mock.instances.slice(1).every((game) => game !== failedGame),
  ).toBe(true);
  expect(w.frames().slice(-1)[0].chain!.tick).toBeGreaterThanOrEqual(0);
  expect(w.frames().slice(-1)[0].myStats).not.toBeNull();
  w.send({ type: "running", running: false, turbo: false });
});
