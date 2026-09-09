import { afterEach, expect, test, vi } from "vitest";
import type {
  ShellSimFrame,
  ShellSimIn,
  ShellSimOut,
} from "../src/client/webgpu/ShellSimProtocol";
import { DEFAULT_CONFIG } from "../src/core/development/CityDevelopmentConfig";
import { GameMapType } from "../src/core/game/Game";
import { expectedLayersByteLength } from "../src/core/game/MapLayers";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function worker() {
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
    await vi.waitFor(() =>
      expect(
        messages
          .slice(count)
          .some((m) => m.type === "frame" || m.type === "error"),
      ).toBe(true),
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
