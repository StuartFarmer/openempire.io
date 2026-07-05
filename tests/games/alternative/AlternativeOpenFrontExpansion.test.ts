import { describe, expect, test } from "vitest";
import {
  createBoardRuntime,
  dispatchBoardCommand,
  tickBoardRuntime,
} from "../../../src/core/game/BoardRuntime";
import {
  AlternativeOpenFrontExpansionSystem,
  createAlternativeMap,
  createAlternativeOpenFrontRuntime,
} from "../../../src/games/alternative";
import { setAlternativeFood } from "../../../src/games/alternative/AlternativeFoodEconomy";

describe("alternative OpenFront expansion", () => {
  test("starts with no placed owner so the first click can place", () => {
    const map = createAlternativeMap({ width: 32, height: 32, seed: 7 });

    expect(countOwned(map.state)).toBe(0);
  });

  test("places the player on clicked land and ignores clicked water", () => {
    const runtime = createAlternativeOpenFrontRuntime({
      width: 32,
      height: 32,
      seed: 7,
    });
    const land = firstLand(runtime.map.terrain);
    const water = firstWater(runtime.map.terrain);

    dispatchBoardCommand(runtime, {
      type: "alternative.place",
      ownerId: 1,
      ref: water,
    });
    dispatchBoardCommand(runtime, {
      type: "alternative.place",
      ownerId: 1,
      ref: land,
    });

    expect(runtime.map.state[water] & 0x0fff).toBe(0);
    expect(runtime.map.state[land] & 0x0fff).toBe(1);
  });

  test("expands from owned border into neutral land over ticks", () => {
    const runtime = createAlternativeOpenFrontRuntime({
      width: 32,
      height: 32,
      seed: 7,
    });
    const start = firstLand(runtime.map.terrain);
    dispatchBoardCommand(runtime, {
      type: "alternative.place",
      ownerId: 1,
      ref: start,
    });
    setAlternativeFood(runtime, 1, 1_000);
    const target = nearestNeutralLand(runtime.map, start);

    dispatchBoardCommand(runtime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: target,
      troops: 2_000,
    });
    for (let i = 0; i < 20; i++) tickBoardRuntime(runtime);

    expect(countOwned(runtime.map.state)).toBeGreaterThan(1);
    expect(runtime.map.state[target] & 0x0fff).toBe(1);
  });

  test("neutral expansion is not steered into a line by the clicked tile", () => {
    const eastRuntime = createFlatRuntime();
    const westRuntime = createFlatRuntime();
    const center = 12;
    eastRuntime.map.state[center] = 1;
    westRuntime.map.state[center] = 1;

    dispatchBoardCommand(eastRuntime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: 14,
      troops: 400,
    });
    dispatchBoardCommand(westRuntime, {
      type: "alternative.expand",
      ownerId: 1,
      ref: 10,
      troops: 400,
    });
    tickBoardRuntime(eastRuntime);
    tickBoardRuntime(westRuntime);

    expect(ownedRefs(eastRuntime.map.state)).toEqual(
      ownedRefs(westRuntime.map.state),
    );
  });
});

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

function firstWater(terrain: Uint8Array): number {
  const ref = terrain.findIndex((tile) => (tile & 0x80) === 0);
  if (ref < 0) throw new Error("missing water tile");
  return ref;
}

function nearestNeutralLand(
  map: ReturnType<typeof createAlternativeMap>,
  start: number,
): number {
  const startX = start % map.width;
  const startY = Math.floor(start / map.width);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let ref = 0; ref < map.terrain.length; ref++) {
    if (ref === start || (map.terrain[ref] & 0x80) === 0) continue;
    const x = ref % map.width;
    const y = Math.floor(ref / map.width);
    const distance = Math.abs(x - startX) + Math.abs(y - startY);
    if (distance < bestDistance) {
      best = ref;
      bestDistance = distance;
    }
  }
  if (best < 0) throw new Error("missing target land tile");
  return best;
}

function createFlatRuntime() {
  return createBoardRuntime(
    {
      width: 5,
      height: 5,
      terrain: new Uint8Array(25).fill(0x80),
      state: new Uint16Array(25),
      layers: { elevation: new Float32Array(25) },
    },
    { systems: [new AlternativeOpenFrontExpansionSystem()] },
  );
}

function ownedRefs(state: Uint16Array): number[] {
  const refs: number[] = [];
  for (let ref = 0; ref < state.length; ref++) {
    if ((state[ref] & 0x0fff) !== 0) refs.push(ref);
  }
  return refs;
}
