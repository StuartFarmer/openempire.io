import type { BoardMap } from "../../core/game/BoardMap";
import {
  setBoardRuntimeLayer,
  type BoardRuntime,
} from "../../core/game/BoardRuntime";
import { getAlternativeTuning } from "./AlternativeTuning";

export const ALTERNATIVE_SETTLEMENT_DISTANCE_LAYER = "settlement.distance";
export const ALTERNATIVE_SETTLEMENT_FOOD_PER_TICK = 10;
export const ALTERNATIVE_FARM_FOOD_PER_TICK = 5;
export const ALTERNATIVE_BASE_CLAIM_FOOD_COST = 25;
export const ALTERNATIVE_FARM_BUILD_COST = 80;
export const ALTERNATIVE_SETTLEMENT_BUILD_COST = 200;

const LAND = 0x80;
const MAX_DISTANCE = 0xffff;

export function addAlternativeSettlement(
  runtime: BoardRuntime,
  ownerId: number,
  ref: number,
): void {
  runtime.entities.set(`settlement:${ownerId}:${ref}`, {
    id: `settlement:${ownerId}:${ref}`,
    type: "settlement",
    tileRef: ref,
    components: { ownerId },
  });
  updateAlternativeSettlementDistance(runtime);
}

export function buildAlternativeFarm(
  runtime: BoardRuntime,
  ownerId: number,
  ref: number,
  options: { free?: boolean } = {},
): boolean {
  if (!canBuildOn(runtime, ownerId, ref)) return false;
  const id = `farm:${ownerId}:${ref}`;
  if (runtime.entities.has(id)) return false;
  if (
    !options.free &&
    !spendAlternativeFood(
      runtime,
      ownerId,
      buildCost(runtime, ref, ALTERNATIVE_FARM_BUILD_COST),
    )
  ) {
    return false;
  }
  runtime.entities.set(id, {
    id,
    type: "farm",
    tileRef: ref,
    components: { ownerId },
  });
  return true;
}

export function buildAlternativeSettlement(
  runtime: BoardRuntime,
  ownerId: number,
  ref: number,
  options: { free?: boolean } = {},
): boolean {
  if (!canBuildOn(runtime, ownerId, ref)) return false;
  const id = `settlement:${ownerId}:${ref}`;
  if (runtime.entities.has(id)) return false;
  if (
    !options.free &&
    !spendAlternativeFood(
      runtime,
      ownerId,
      buildCost(runtime, ref, ALTERNATIVE_SETTLEMENT_BUILD_COST),
    )
  ) {
    return false;
  }
  addAlternativeSettlement(runtime, ownerId, ref);
  return true;
}

export function alternativeSettlementCount(
  runtime: BoardRuntime,
  ownerId: number,
): number {
  let count = 0;
  for (const entity of runtime.entities.values()) {
    if (
      entity.type === "settlement" &&
      entity.components?.ownerId === ownerId
    ) {
      count++;
    }
  }
  return count;
}

export function alternativeFarmCount(
  runtime: BoardRuntime,
  ownerId: number,
): number {
  let count = 0;
  for (const entity of runtime.entities.values()) {
    if (entity.type === "farm" && entity.components?.ownerId === ownerId) {
      count++;
    }
  }
  return count;
}

export function alternativeFoodPerTick(
  runtime: BoardRuntime,
  ownerId: number,
): number {
  return (
    alternativeSettlementCount(runtime, ownerId) *
      getAlternativeTuning(runtime).settlementFoodPerTick +
    alternativeFarmCount(runtime, ownerId) * ALTERNATIVE_FARM_FOOD_PER_TICK
  );
}

export function produceAlternativeFood(
  runtime: BoardRuntime,
  ownerId: number,
): number {
  const produced = alternativeFoodPerTick(runtime, ownerId);
  setAlternativeFood(
    runtime,
    ownerId,
    getAlternativeFood(runtime, ownerId) + produced,
  );
  return produced;
}

export function getAlternativeFood(
  runtime: BoardRuntime,
  ownerId: number,
): number {
  return Number(runtime.globals[foodKey(ownerId)] ?? 0);
}

export function setAlternativeFood(
  runtime: BoardRuntime,
  ownerId: number,
  food: number,
): void {
  runtime.globals[foodKey(ownerId)] = Math.max(0, food);
}

export function spendAlternativeFood(
  runtime: BoardRuntime,
  ownerId: number,
  food: number,
): boolean {
  const current = getAlternativeFood(runtime, ownerId);
  if (current < food) return false;
  setAlternativeFood(runtime, ownerId, current - food);
  return true;
}

export function alternativeClaimFoodCost(
  runtime: BoardRuntime,
  _ownerId: number,
  ref: number,
): number {
  const distance = settlementDistance(runtime, ref);
  if (distance >= MAX_DISTANCE) return Number.POSITIVE_INFINITY;
  const terrain = runtime.map.terrain[ref] & 0x1f;
  return (
    ALTERNATIVE_BASE_CLAIM_FOOD_COST *
    (1 + distance * getAlternativeTuning(runtime).logisticsDistanceFactor) *
    (1 + terrain / 128)
  );
}

export function updateAlternativeSettlementDistance(
  runtime: BoardRuntime,
): void {
  const distance = new Uint16Array(runtime.map.width * runtime.map.height);
  distance.fill(MAX_DISTANCE);
  const queue: number[] = [];

  for (const entity of runtime.entities.values()) {
    if (entity.type !== "settlement" || entity.tileRef === undefined) continue;
    distance[entity.tileRef] = 0;
    queue.push(entity.tileRef);
  }

  for (let i = 0; i < queue.length; i++) {
    const ref = queue[i];
    const nextDistance = distance[ref] + 1;
    for (const next of neighbors4(runtime.map, ref)) {
      if ((runtime.map.terrain[next] & LAND) === 0) continue;
      if (nextDistance >= distance[next]) continue;
      distance[next] = nextDistance;
      queue.push(next);
    }
  }

  setBoardRuntimeLayer(
    runtime,
    ALTERNATIVE_SETTLEMENT_DISTANCE_LAYER,
    distance,
  );
}

export function describeAlternativeEconomy(
  runtime: BoardRuntime,
  ownerId: number,
): { food: number; foodPerTick: number; settlements: number; farms: number } {
  return {
    food: getAlternativeFood(runtime, ownerId),
    foodPerTick: alternativeFoodPerTick(runtime, ownerId),
    settlements: alternativeSettlementCount(runtime, ownerId),
    farms: alternativeFarmCount(runtime, ownerId),
  };
}

function settlementDistance(runtime: BoardRuntime, ref: number): number {
  const layer = runtime.layers[ALTERNATIVE_SETTLEMENT_DISTANCE_LAYER];
  return layer?.[ref] ?? MAX_DISTANCE;
}

function foodKey(ownerId: number): string {
  return `alternative.food.${ownerId}`;
}

function canBuildOn(
  runtime: BoardRuntime,
  ownerId: number,
  ref: number,
): boolean {
  return (
    Number.isInteger(ref) &&
    ref >= 0 &&
    ref < runtime.map.state.length &&
    (runtime.map.terrain[ref] & LAND) !== 0 &&
    (runtime.map.state[ref] & 0x0fff) === ownerId
  );
}

function buildCost(runtime: BoardRuntime, ref: number, base: number): number {
  const distance = settlementDistance(runtime, ref);
  if (distance >= MAX_DISTANCE) return Number.POSITIVE_INFINITY;
  const terrain = runtime.map.terrain[ref] & 0x1f;
  return (
    base *
    (1 + distance * getAlternativeTuning(runtime).logisticsDistanceFactor) *
    (1 + terrain / 128)
  );
}

function neighbors4(
  map: Pick<BoardMap, "width" | "height">,
  ref: number,
): number[] {
  const x = ref % map.width;
  const y = Math.floor(ref / map.width);
  const out: number[] = [];
  if (x > 0) out.push(ref - 1);
  if (x < map.width - 1) out.push(ref + 1);
  if (y > 0) out.push(ref - map.width);
  if (y < map.height - 1) out.push(ref + map.width);
  return out;
}
