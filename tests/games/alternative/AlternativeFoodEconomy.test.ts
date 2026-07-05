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
  alternativeFarmCount,
  alternativeFoodPerTick,
  alternativeSettlementCount,
  buildAlternativeFarm,
  buildAlternativeSettlement,
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

  test("building a farm spends food and increases food production", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    runtime.map.state[13] = 1;
    setAlternativeFood(runtime, 1, 1_000);
    const beforeFood = getAlternativeFood(runtime, 1);
    const beforeProduction = alternativeFoodPerTick(runtime, 1);

    expect(buildAlternativeFarm(runtime, 1, 13)).toBe(true);

    expect(alternativeFarmCount(runtime, 1)).toBe(1);
    expect(alternativeFoodPerTick(runtime, 1)).toBeGreaterThan(
      beforeProduction,
    );
    expect(getAlternativeFood(runtime, 1)).toBeLessThan(beforeFood);
  });

  test("building fails without enough food", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    runtime.map.state[13] = 1;
    setAlternativeFood(runtime, 1, 0);

    expect(buildAlternativeFarm(runtime, 1, 13)).toBe(false);

    expect(alternativeFarmCount(runtime, 1)).toBe(0);
    expect(getAlternativeFood(runtime, 1)).toBe(0);
  });

  test("building an additional settlement recalculates settlement distance", () => {
    const runtime = createFlatRuntime();
    placeOwnedSettlement(runtime, 12);
    runtime.map.state[3] = 1;
    setAlternativeFood(runtime, 1, 1_000);
    const before = alternativeClaimFoodCost(runtime, 1, 4);

    expect(buildAlternativeSettlement(runtime, 1, 3)).toBe(true);

    expect(alternativeSettlementCount(runtime, 1)).toBe(2);
    expect(alternativeClaimFoodCost(runtime, 1, 4)).toBeLessThan(before);
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

function placeOwnedSettlement(
  runtime: ReturnType<typeof createFlatRuntime>,
  ref: number,
): void {
  runtime.map.state[ref] = 1;
  buildAlternativeSettlement(runtime, 1, ref, { free: true });
}
