import { describe, expect, test } from "vitest";
import type { BoardMap } from "../src/core/game/BoardMap";
import {
  collectBoardRuntimeOverlays,
  createBoardRuntime,
  dispatchBoardCommand,
  setBoardRuntimeLayer,
  tickBoardRuntime,
  type BoardSystem,
} from "../src/core/game/BoardRuntime";

describe("BoardRuntime", () => {
  test("creates runtime from a board map and accepts dynamic layers", () => {
    const map = createMap({ elevation: new Uint8Array(4) });
    const runtime = createBoardRuntime(map);
    const troopMass = new Float64Array(4);

    setBoardRuntimeLayer(runtime, "troop.mass", troopMass);

    expect(runtime.map).toBe(map);
    expect(runtime.layers.elevation).toBe(map.layers!.elevation);
    expect(runtime.layers["troop.mass"]).toBe(troopMass);
    expect(map.layers!["troop.mass"]).toBe(troopMass);
  });

  test("rejects runtime layers with the wrong tile count", () => {
    const runtime = createBoardRuntime(createMap());

    expect(() =>
      setBoardRuntimeLayer(runtime, "front.progress", new Float32Array(3)),
    ).toThrow("front.progress");
  });

  test("dispatches commands, ticks systems in order, and collects overlays", () => {
    const calls: string[] = [];
    const handledCommands: string[] = [];
    const first: BoardSystem = {
      id: "first",
      canHandle: (command) => command.type === "claim",
      handle: (command) => handledCommands.push(command.type),
      tick: () => calls.push("first"),
      overlays: () => [{ type: "first.overlay", ref: 1 }],
    };
    const second: BoardSystem = {
      id: "second",
      canHandle: () => false,
      handle: () => handledCommands.push("should-not-run"),
      tick: () => calls.push("second"),
    };
    const runtime = createBoardRuntime(createMap(), {
      systems: [first, second],
    });

    dispatchBoardCommand(runtime, { type: "claim", ref: 2 });
    tickBoardRuntime(runtime);

    expect(handledCommands).toEqual(["claim"]);
    expect(calls).toEqual(["first", "second"]);
    expect(collectBoardRuntimeOverlays(runtime)).toEqual([
      { type: "first.overlay", ref: 1 },
    ]);
  });

  test("stores sparse entities without requiring tile objects", () => {
    const runtime = createBoardRuntime(createMap());

    runtime.entities.set("building-1", {
      id: "building-1",
      type: "building",
      tileRef: 2,
      components: { buildingType: "farm" },
    });

    expect(runtime.entities.get("building-1")?.tileRef).toBe(2);
    expect(runtime.entities.get("building-1")?.components).toEqual({
      buildingType: "farm",
    });
  });
});

function createMap(layers?: BoardMap["layers"]): BoardMap {
  return {
    width: 2,
    height: 2,
    terrain: new Uint8Array(4),
    state: new Uint16Array(4),
    layers,
  };
}
