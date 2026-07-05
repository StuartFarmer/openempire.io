import { describe, expect, test } from "vitest";
import {
  createBoardRuntime,
  dispatchBoardCommand,
  tickBoardRuntime,
} from "../../../src/core/game/BoardRuntime";
import {
  AlternativeOpenFrontExpansionSystem,
  createAlternativeOpenFrontRuntime,
} from "../../../src/games/alternative";
import {
  alternativeClaimFoodCost,
  alternativeFoodPerTick,
  alternativeSettlementCount,
  getAlternativeFood,
  setAlternativeFood,
} from "../../../src/games/alternative/AlternativeFoodEconomy";

describe("alternative food economy", () => {
  test("first placement creates a settlement that produces food", () => {
    const runtime = createAlternativeOpenFrontRuntime({
      width: 32,
      height: 32,
      seed: 7,
    });

    dispatchBoardCommand(runtime, {
      type: "alternative.place",
      ownerId: 1,
      ref: firstLand(runtime.map.terrain),
    });
    tickBoardRuntime(runtime);

    expect(alternativeSettlementCount(runtime, 1)).toBe(1);
    expect(getAlternativeFood(runtime, 1)).toBe(
      alternativeFoodPerTick(runtime, 1),
    );
  });

  test("farther tiles cost more food than nearby tiles", () => {
    const runtime = createFlatRuntime();

    dispatchBoardCommand(runtime, {
      type: "alternative.place",
      ownerId: 1,
      ref: 12,
    });

    expect(alternativeClaimFoodCost(runtime, 1, 7)).toBeLessThan(
      alternativeClaimFoodCost(runtime, 1, 0),
    );
  });

  test("expansion spends food when it claims wilderness", () => {
    const runtime = createFlatRuntime();
    dispatchBoardCommand(runtime, {
      type: "alternative.place",
      ownerId: 1,
      ref: 12,
    });
    setAlternativeFood(runtime, 1, 100);

    dispatchBoardCommand(runtime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: 13,
      troops: 400,
    });
    tickBoardRuntime(runtime);

    expect(countOwned(runtime.map.state)).toBeGreaterThan(1);
    expect(getAlternativeFood(runtime, 1)).toBeLessThan(
      100 + alternativeFoodPerTick(runtime, 1),
    );
  });

  test("expansion movement waits for food instead of claiming for free", () => {
    const runtime = createFlatRuntime();
    dispatchBoardCommand(runtime, {
      type: "alternative.place",
      ownerId: 1,
      ref: 12,
    });
    setAlternativeFood(runtime, 1, 0);

    dispatchBoardCommand(runtime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: 13,
      troops: 400,
    });
    tickBoardRuntime(runtime);
    expect(countOwned(runtime.map.state)).toBe(1);

    for (let i = 0; i < 10; i++) tickBoardRuntime(runtime);
    expect(countOwned(runtime.map.state)).toBeGreaterThan(1);
  });
});

function createFlatRuntime() {
  return createBoardRuntime(
    {
      width: 5,
      height: 5,
      terrain: new Uint8Array(25).fill(0x80),
      state: new Uint16Array(25),
    },
    {
      systems: [new AlternativeOpenFrontExpansionSystem()],
    },
  );
}

function countOwned(state: Uint16Array): number {
  let count = 0;
  for (const tileState of state) {
    if ((tileState & 0x0fff) !== 0) count++;
  }
  return count;
}

function firstLand(terrain: Uint8Array): number {
  const ref = terrain.findIndex((tile) => (tile & 0x80) !== 0);
  if (ref < 0) throw new Error("missing land tile");
  return ref;
}
