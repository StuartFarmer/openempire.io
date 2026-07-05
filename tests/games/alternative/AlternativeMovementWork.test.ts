import { describe, expect, test } from "vitest";
import {
  createBoardRuntime,
  dispatchBoardCommand,
  tickBoardRuntime,
} from "../../../src/core/game/BoardRuntime";
import { AlternativeOpenFrontExpansionSystem } from "../../../src/games/alternative";
import {
  addAlternativeSettlement,
  alternativeFoodPerTick,
  setAlternativeFood,
} from "../../../src/games/alternative/AlternativeFoodEconomy";
import {
  ALTERNATIVE_TROOP_WORK_PER_TICK,
  calculateAlternativeMovementWork,
  getAlternativeMovementJob,
} from "../../../src/games/alternative/AlternativeMovementWork";
import { setAlternativeTuning } from "../../../src/games/alternative/AlternativeTuning";

describe("alternative movement work", () => {
  test("expansion creates movement job without immediate capture", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    setAlternativeFood(runtime, 1, 1_000);

    dispatchBoardCommand(runtime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: 13,
      troops: 400,
    });

    expect(runtime.map.state[13] & 0x0fff).toBe(0);
    const job = getAlternativeMovementJob(runtime);
    expect(job).toMatchObject({
      from: 12,
      ownerId: 1,
      troopAmount: 400,
    });
    expect([7, 11, 13, 17]).toContain(job!.to);
  });

  test("farther and uphill movement require more work", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    const near = calculateAlternativeMovementWork(runtime, 1, 12, 13, 100);
    const far = calculateAlternativeMovementWork(runtime, 1, 12, 0, 100);

    runtime.layers.elevation = new Uint8Array(25);
    runtime.layers.elevation[13] = 100;
    const uphill = calculateAlternativeMovementWork(runtime, 1, 12, 13, 100);

    expect(far).toBeGreaterThan(near);
    expect(uphill).toBeGreaterThan(near);
  });

  test("runtime tuning changes food production and movement work", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    const before = calculateAlternativeMovementWork(runtime, 1, 12, 13, 100);

    setAlternativeTuning(runtime, {
      settlementFoodPerTick: 20,
      baseMoveWork: 120,
    });

    expect(alternativeFoodPerTick(runtime, 1)).toBe(20);
    expect(
      calculateAlternativeMovementWork(runtime, 1, 12, 13, 100),
    ).toBeGreaterThan(before);
  });

  test("tick spends food up to troop throughput and stalls without food", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    setAlternativeFood(runtime, 1, 1_000);
    dispatchBoardCommand(runtime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: 13,
      troops: 100,
    });
    const before = getAlternativeMovementJob(runtime)!.workRemaining;

    tickBoardRuntime(runtime);
    const after = getAlternativeMovementJob(runtime)!.workRemaining;

    expect(before - after).toBe(100 * ALTERNATIVE_TROOP_WORK_PER_TICK);

    setAlternativeFood(runtime, 1, 0);
    const stalledBefore = getAlternativeMovementJob(runtime)!.workRemaining;
    tickBoardRuntime(runtime);
    expect(getAlternativeMovementJob(runtime)!.workRemaining).toBe(
      stalledBefore,
    );
  });

  test("completed movement captures destination", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    setAlternativeFood(runtime, 1, 10_000);
    dispatchBoardCommand(runtime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: 13,
      troops: 400,
    });

    for (let i = 0; i < 20; i++) tickBoardRuntime(runtime);

    expect(runtime.map.state[13] & 0x0fff).toBe(1);
  });
});

function createFlatRuntime() {
  return createBoardRuntime(
    {
      width: 5,
      height: 5,
      terrain: new Uint8Array(25).fill(0x80),
      state: new Uint16Array(25),
      layers: {},
    },
    {
      systems: [new AlternativeOpenFrontExpansionSystem()],
    },
  );
}

function placeOwnedSettlement(
  runtime: ReturnType<typeof createFlatRuntime>,
  ref: number,
): void {
  runtime.map.state[ref] = 1;
  addAlternativeSettlement(runtime, 1, ref);
}
