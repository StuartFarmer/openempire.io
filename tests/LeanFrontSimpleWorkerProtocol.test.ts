import { afterEach, describe, expect, test, vi } from "vitest";
import { UnitType } from "../src/core/game/Game";

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

async function workerHarness() {
  let tick = 0;
  const turns: unknown[] = [];
  const player = {
    id: () => "you",
    smallID: () => 1,
    displayName: () => "You",
    type: () => "human",
    troops: () => 19.8,
    numTilesOwned: () => 3,
    isAlive: () => true,
    food: () => 7n,
    foodFlow: () => ({
      population: 999,
      production: 999,
      consumption: 999,
      starvedTroops: 999,
    }),
    farmSeeds: () => 0,
    settlementSeeds: () => 0,
    lastTileChange: () => 0,
    borderTiles: () => [],
    outgoingAttacks: () => [],
    incomingAttacks: () => [],
    core: () => 0,
    tiles: function* () {
      yield 0;
    },
    units: () => [],
  };
  const game = {
    width: () => 2,
    height: () => 2,
    config: () => ({
      food: () => ({
        popPerDensity: 10_000,
        supplyRefreshTicks: 10,
        supplyRadius: 1,
        supplyDecayPower: 1,
      }),
    }),
    layer: () => 0,
    ticks: () => tick,
    units: () => [],
    playerByClientID: () => player,
    players: () => [player],
    nations: () => [],
    inSpawnPhase: () => false,
    ownerID: () => 0,
    map: () => ({
      ownerID: () => 0,
      neighbors4: () => 0,
      isLand: () => true,
      isImpassable: () => false,
    }),
    x: (tile: number) => tile % 2,
    y: (tile: number) => Math.floor(tile / 2),
  };
  const runner = {
    game,
    addTurn: (turn: unknown) => turns.push(turn),
    executeNextTick: () => {
      tick += 1;
    },
  };
  const context = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  };
  const resolvePlotAction = vi.fn((_player, action: string, tile: number) => {
    if (action === "city" && tile === 3) {
      return {
        ok: true as const,
        intent: {
          type: "upgrade_structure" as const,
          unit: UnitType.Settlement,
          unitId: 17,
        },
      };
    }
    if (action === "farm") {
      return {
        ok: true as const,
        intent: { type: "build_unit" as const, unit: UnitType.Farmland, tile },
      };
    }
    if (action === "raze") {
      return {
        ok: true as const,
        intent: { type: "delete_unit" as const, unitId: 29 },
      };
    }
    return { ok: false as const, message: "Raze the existing plot first" };
  });
  const plotFrame = vi.fn(() => Int32Array.from([3, 1, 2, 19.8, 40, 4.9]));

  vi.resetModules();
  vi.stubGlobal("self", context);
  vi.doMock("../src/core/GameRunner", () => ({
    createGameRunner: async () => runner,
    GameRunner: class {},
  }));
  vi.doMock("../src/client/games/registry", () => ({
    createLiveGameRuntime: async () => ({
      beforeTick: async () => {},
      resolvePlotAction,
      plotFrame,
      stats: () => ({
        population: 19.8,
        production: 4.9,
        consumption: 3.2,
        starved: 0,
      }),
      dispose: () => {},
    }),
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
    ruleset: "leanfront-simple",
  });
  await flush();
  return { context, send, turns };
}

describe("LeanFront Simple worker protocol", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("../src/core/GameRunner");
    vi.doUnmock("../src/client/games/registry");
    vi.resetModules();
  });

  test("resolves plot commands into core intents and returns bounded feedback", async () => {
    vi.useFakeTimers();
    const worker = await workerHarness();

    worker.send({ type: "plot_action", action: "city", tile: 3 });
    worker.send({ type: "plot_action", action: "farm", tile: 2 });
    worker.send({ type: "plot_action", action: "city", tile: 1 });
    worker.send({ type: "plot_action", action: "raze", tile: 4 });
    worker.send({ type: "running", running: true, turbo: false });
    await flush();
    worker.send({ type: "running", running: false, turbo: false });

    expect(worker.turns).toContainEqual({
      turnNumber: 0,
      intents: [
        {
          type: "upgrade_structure",
          unit: UnitType.Settlement,
          unitId: 17,
          clientID: expect.any(String),
        },
        {
          type: "build_unit",
          unit: UnitType.Farmland,
          tile: 2,
          clientID: expect.any(String),
        },
        { type: "delete_unit", unitId: 29, clientID: expect.any(String) },
      ],
    });
    expect(
      worker.context.postMessage.mock.calls.map(([message]) => message),
    ).toContainEqual({
      type: "action_result",
      action: "city",
      tile: 1,
      ok: false,
      message: "Raze the existing plot first",
    });
  });

  test("ships integer simple plot sextets and runtime stats in the common frame", async () => {
    const worker = await workerHarness();
    const frame = worker.context.postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => message.type === "frame");

    expect([...frame.simplePlots]).toEqual([3, 1, 2, 19, 40, 4]);
    expect(frame.stats).toEqual(Int32Array.from([1, 20, 3, 1, 7, 5, 3]));
    expect(frame.myStats).toMatchObject({ population: 20, starved: 0 });
  });
});
