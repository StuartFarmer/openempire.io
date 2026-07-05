import type { BoardRuntime } from "../../core/game/BoardRuntime";
import {
  ALTERNATIVE_SETTLEMENT_DISTANCE_LAYER,
  getAlternativeFood,
  setAlternativeFood,
} from "./AlternativeFoodEconomy";
import { getAlternativeTuning } from "./AlternativeTuning";

export const ALTERNATIVE_BASE_MOVE_WORK = 60;
export const ALTERNATIVE_TROOP_WORK_PER_TICK = 0.25;

const ACTIVE_JOB_KEY = "alternative.movement.active";
const MAX_DISTANCE = 0xffff;

export interface AlternativeMovementJob {
  from: number;
  to: number;
  ownerId: number;
  troopAmount: number;
  initialWork: number;
  workRemaining: number;
}

export function createAlternativeMovementJob(
  runtime: BoardRuntime,
  ownerId: number,
  from: number,
  to: number,
  troopAmount: number,
): AlternativeMovementJob {
  const initialWork = calculateAlternativeMovementWork(
    runtime,
    ownerId,
    from,
    to,
    troopAmount,
  );
  const job = {
    from,
    to,
    ownerId,
    troopAmount,
    initialWork,
    workRemaining: initialWork,
  };
  runtime.globals[ACTIVE_JOB_KEY] = job;
  return job;
}

export function getAlternativeMovementJob(
  runtime: BoardRuntime,
): AlternativeMovementJob | null {
  return (runtime.globals[ACTIVE_JOB_KEY] as AlternativeMovementJob) ?? null;
}

export function clearAlternativeMovementJob(runtime: BoardRuntime): void {
  delete runtime.globals[ACTIVE_JOB_KEY];
}

export function calculateAlternativeMovementWork(
  runtime: BoardRuntime,
  _ownerId: number,
  from: number,
  to: number,
  troopAmount: number,
): number {
  const distance = settlementDistance(runtime, to);
  if (distance >= MAX_DISTANCE) return Number.POSITIVE_INFINITY;
  return (
    getAlternativeTuning(runtime).baseMoveWork *
    terrainCost(runtime, to) *
    logisticsCost(runtime, distance) *
    slopeCost(runtime, from, to) *
    troopLoadCost(troopAmount)
  );
}

export function advanceAlternativeMovementJob(runtime: BoardRuntime): {
  spent: number;
  complete: boolean;
} {
  const job = getAlternativeMovementJob(runtime);
  if (!job) return { spent: 0, complete: false };
  const spent = Math.min(
    getAlternativeFood(runtime, job.ownerId),
    job.troopAmount * getAlternativeTuning(runtime).troopWorkPerTick,
    job.workRemaining,
  );
  if (spent <= 0) return { spent: 0, complete: false };

  setAlternativeFood(
    runtime,
    job.ownerId,
    getAlternativeFood(runtime, job.ownerId) - spent,
  );
  job.workRemaining = Math.max(0, job.workRemaining - spent);
  return { spent, complete: job.workRemaining <= 0 };
}

export function describeAlternativeMovementWork(
  runtime: BoardRuntime,
): { remaining: number; total: number; progress: number } | null {
  const job = getAlternativeMovementJob(runtime);
  if (!job) return null;
  const total = Math.max(1, job.initialWork);
  return {
    remaining: job.workRemaining,
    total: job.initialWork,
    progress: 1 - job.workRemaining / total,
  };
}

function settlementDistance(runtime: BoardRuntime, ref: number): number {
  const layer = runtime.layers[ALTERNATIVE_SETTLEMENT_DISTANCE_LAYER];
  return layer?.[ref] ?? MAX_DISTANCE;
}

function terrainCost(runtime: BoardRuntime, ref: number): number {
  return 1 + (runtime.map.terrain[ref] & 0x1f) / 128;
}

function logisticsCost(runtime: BoardRuntime, distance: number): number {
  return 1 + distance * getAlternativeTuning(runtime).logisticsDistanceFactor;
}

function slopeCost(runtime: BoardRuntime, from: number, to: number): number {
  const elevation = runtime.layers.elevation;
  if (!elevation) return 1;
  return (
    1 +
    Math.max(0, elevation[to] - elevation[from]) *
      getAlternativeTuning(runtime).slopeFactor
  );
}

function troopLoadCost(troopAmount: number): number {
  return 1 + Math.max(0, troopAmount) / 10_000;
}
