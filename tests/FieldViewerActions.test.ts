import { describe, expect, test } from "vitest";
import {
  dequeuePlayerActions,
  playerActionBatchSize,
} from "../src/client/viewer/FieldViewerBase";

describe("field player action queue", () => {
  test("takes one action per player in FIFO order and stamps the GPU tick", () => {
    const queues = [
      undefined,
      [
        { actionKind: 2, actionTile: 7 },
        { actionKind: 3, actionTile: 8 },
      ],
      [{ actionKind: 4, actionTile: 9 }],
    ];
    expect(dequeuePlayerActions(queues, 12)).toEqual([
      undefined,
      { actionKind: 2, actionTile: 7, actionTick: 12 },
      { actionKind: 4, actionTile: 9, actionTick: 12 },
    ]);
    expect(queues[1]).toEqual([{ actionKind: 3, actionTile: 8 }]);
    expect(queues[2]).toEqual([]);
  });

  test("limits a command-bearing submission to one tick", () => {
    expect(playerActionBatchSize(8, [undefined, [{ actionKind: 2 }]])).toBe(1);
    expect(playerActionBatchSize(8, [undefined, []])).toBe(8);
  });
});
