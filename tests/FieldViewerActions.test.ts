import { describe, expect, test } from "vitest";
import {
  dequeuePlayerActions,
  FieldViewerBase,
  fixedClockPlayerActionBatch,
  playerActionBatchSize,
} from "../src/client/viewer/FieldViewerBase";

class TestViewer extends FieldViewerBase {
  protected canvasId(): string {
    return "test";
  }

  beginStroke(): void {
    this.onStrokeStart();
  }

  stamp(brush: string, x: number, y: number): void {
    this.stampBrush(brush, x, y);
  }

  async reset(): Promise<void> {
    await this.resetState();
  }

  begin(ticks: number): number {
    return this.beginSimulationBatch(ticks);
  }
}

customElements.define("test-field-viewer", TestViewer);

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

  test("keeps fixed-clock ticks that an action-bearing batch cannot submit", () => {
    expect(
      fixedClockPlayerActionBatch(8, [undefined, [{ actionKind: 2 }]]),
    ).toEqual({ ticks: 1, accumulator: 7 });
  });

  test("queues an intent tile once per pointer stroke", () => {
    const viewer = new TestViewer() as any;
    viewer.mapWidth = 16;
    viewer.kernel = {};
    viewer.compiled = {
      localPlayer: 1,
      intentForBrush: (brush: string) => (brush === "city" ? 2 : undefined),
    };

    viewer.beginStroke();
    viewer.stamp("city", 3, 4);
    viewer.stamp("city", 3, 4);
    viewer.stamp("city", 4, 4);
    expect(viewer.playerActionQueues[1]).toEqual([
      { actionKind: 2, actionTile: 67 },
      { actionKind: 2, actionTile: 68 },
    ]);

    viewer.beginStroke();
    viewer.stamp("city", 3, 4);
    expect(viewer.playerActionQueues[1]).toHaveLength(3);
  });

  test("keeps opening AI commands for simulation tick one after reset", async () => {
    const writes: Record<string, number>[][] = [];
    const viewer = new TestViewer() as any;
    viewer.mapWidth = 16;
    viewer.mapHeight = 16;
    viewer.view = "test";
    viewer.scalarReadout = { tilesOwned: [0, 99] };
    viewer.kernel = {
      clearBuffer: vi.fn(),
      beginFrame: () => ({ finish: async () => ({ gpuMs: 0 }) }),
      writeBuffer: vi.fn(),
    };
    viewer.compiled = {
      localPlayer: 1,
      playerCount: 2,
      playerOutputNames: ["result"],
      playerFieldNames: ["actionKind", "actionTile", "actionTick"],
      system: {
        ai: {
          decide: (ctx: any) => {
            expect(ctx.scalars).toEqual({});
            ctx.queuePlayer(1, { actionKind: 1, actionTile: 7 });
          },
        },
      },
      runInit: vi.fn(),
      runView: vi.fn(),
      writePlayers: (players: Record<string, number>[]) => {
        writes.push(players.map((player) => ({ ...player })));
        return new ArrayBuffer(0);
      },
    };

    await viewer.reset();
    expect(viewer.begin(1)).toBe(1);
    expect(writes[writes.length - 1]?.[1]).toEqual({
      actionKind: 1,
      actionTile: 7,
      actionTick: 1,
    });
  });
});
