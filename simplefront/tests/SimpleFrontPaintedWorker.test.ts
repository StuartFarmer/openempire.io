import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type {
  ShellSimFrame,
  ShellSimIn,
  ShellSimOut,
} from "../src/client/webgpu/ShellSimProtocol";
import { Difficulty, GameMapType } from "../src/core/game/Game";
import { expectedLayersByteLength } from "../src/core/game/MapLayers";
import { installFakeClockCrypto } from "./util/FakeClockCrypto";

beforeEach(() => installFakeClockCrypto());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("actual victory publishes a final frame, refuses resume and permits a fresh match", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const manifest = {
    map: { width: 8, height: 8, num_land_tiles: 64 },
    map4x: { width: 4, height: 4, num_land_tiles: 16 },
    layers: true,
    terrain_colors: true,
    nations: [],
  };
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    json: async () => manifest,
    arrayBuffer: async () => {
      if (url.endsWith("layers.bin"))
        return new Uint8Array(expectedLayersByteLength(8, 8)).buffer;
      return new Uint8Array(url.endsWith("map4x.bin") ? 16 : 64).fill(128)
        .buffer;
    },
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
  const start = () =>
    send({
      type: "init",
      mapType: GameMapType.Verdantia,
      bots: 0,
      cdnBase: "",
      assetManifest: {},
      ruleset: "simplefront",
      difficulty: Difficulty.Hard,
    });
  start();
  await vi.waitFor(() =>
    expect(messages.some((m) => m.type === "ready")).toBe(true),
  );
  send({ type: "intent", intent: { type: "spawn", tile: 36 } });
  send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(3000);
  const frames = () =>
    messages.filter((m): m is ShellSimFrame => m.type === "frame");
  const final = frames().slice(-1)[0]!;
  expect(final.matchResult).toMatchObject({
    humanWon: true,
    winnerName: "You",
  });
  const count = frames().length;
  send({ type: "running", running: true, turbo: false });
  send({ type: "act", tile: 5, ratio: 0.5 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(frames()).toHaveLength(count);
  const readyCount = messages.filter((m) => m.type === "ready").length;
  start();
  await vi.waitFor(() =>
    expect(messages.filter((m) => m.type === "ready")).toHaveLength(
      readyCount + 1,
    ),
  );
  send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(100);
  expect(frames().slice(-1)[0]?.matchResult).toBeNull();
  expect(frames().slice(-1)[0]?.inSpawn).toBe(true);
  expect(messages.filter((m) => m.type === "error")).toEqual([]);
  send({ type: "running", running: false, turbo: false });
});

test("real worker publishes painted resources and results without supply or climate observers", async () => {
  vi.resetModules();
  const farm = await import("../src/core/execution/utils/FarmGrowth");
  const supply = await import("../src/core/execution/utils/SupplyField");
  vi.useFakeTimers();
  const supplySpy = vi.spyOn(supply, "supplyField");
  const climateSpy = vi.spyOn(farm, "climateSuitability");
  const root = path.join(__dirname, "testdata/maps/plains");
  const manifest = {
    ...JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")),
    layers: true,
    terrain_colors: true,
    nations: [],
  };
  // Only the external map fetch is replaced. Runner, config, core, worker and runtime are real.
  vi.stubGlobal("fetch", async (url: string) => {
    const name = url.split("/").pop()!;
    const data =
      name === "layers.bin"
        ? new Uint8Array(expectedLayersByteLength(100, 100))
        : name === "manifest.json"
          ? new TextEncoder().encode(JSON.stringify(manifest))
          : fs.readFileSync(path.join(root, name));
    return {
      ok: true,
      json: async () => manifest,
      arrayBuffer: async () => Uint8Array.from(data).buffer,
    };
  });
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
  send({
    type: "init",
    mapType: GameMapType.Verdantia,
    bots: 0,
    cdnBase: "",
    assetManifest: {},
    ruleset: "simplefront",
  });
  await vi.waitFor(() =>
    expect(messages.some((m) => m.type === "ready")).toBe(true),
  );
  send({ type: "intent", intent: { type: "spawn", tile: 5050 } });
  send({ type: "running", running: true, turbo: false });
  await vi.advanceTimersByTimeAsync(500);
  const frames = () =>
    messages.filter((m): m is ShellSimFrame => m.type === "frame");
  expect(frames().slice(-1)[0]?.myStats?.painted).toMatchObject({
    farms: 1,
    cities: 1,
    troopCapacity: 10000,
    foodCapacityMilli: 10_000_000n,
  });
  send({
    type: "intent",
    intent: { type: "paint_tiles", kind: "farm", tiles: [5051, 5052, 5053] },
  });
  send({ type: "preview", tile: 5151, unit: "Farmland" as never });
  await vi.advanceTimersByTimeAsync(500);
  expect(
    frames()
      .flatMap((f) => f.paintResults ?? [])
      .some(
        (r) =>
          r.placed.length === 2 &&
          r.stoppedUnaffordable &&
          r.spentMilli === 3_000_000n,
      ),
  ).toBe(true);
  expect(frames().slice(-1)[0]?.myStats?.painted?.farms).toBe(3);
  expect(frames().every((f) => f.supply === null)).toBe(true);
  expect(messages.filter((m) => m.type === "error")).toEqual([]);
  expect(supplySpy).not.toHaveBeenCalled();
  expect(climateSpy).not.toHaveBeenCalled();
  send({ type: "running", running: false, turbo: false });
});
