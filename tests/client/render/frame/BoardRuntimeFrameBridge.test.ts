import { describe, expect, test } from "vitest";
import { BoardRuntimeFrameBridge } from "../../../../src/client/render/frame";
import type { BoardMap } from "../../../../src/core/game/BoardMap";
import {
  createBoardRuntime,
  tickBoardRuntime,
  type BoardSystem,
} from "../../../../src/core/game/BoardRuntime";

describe("BoardRuntimeFrameBridge", () => {
  test("first frame exposes runtime tile state and requests a full upload", () => {
    const runtime = createBoardRuntime(createMap());
    runtime.map.state[1] = 7;

    const bridge = new BoardRuntimeFrameBridge(runtime);
    const frame = bridge.nextFrame();

    expect(frame.tileState).toBe(runtime.map.state);
    expect(frame.changedTiles).toBeNull();
  });

  test("later frames report only tile refs whose state changed", () => {
    const system: BoardSystem = {
      id: "claim-one",
      tick: (runtime) => {
        runtime.map.state[2] = 3;
      },
    };
    const runtime = createBoardRuntime(createMap(), { systems: [system] });
    const bridge = new BoardRuntimeFrameBridge(runtime);

    bridge.nextFrame();
    tickBoardRuntime(runtime);
    const changedFrame = bridge.nextFrame();
    expect(changedFrame.changedTiles).toEqual([{ ref: 2, state: 0 }]);

    const unchangedFrame = bridge.nextFrame();
    expect(unchangedFrame.changedTiles).toEqual([]);
  });
});

function createMap(): BoardMap {
  return {
    width: 2,
    height: 2,
    terrain: new Uint8Array(4),
    state: new Uint16Array(4),
  };
}
