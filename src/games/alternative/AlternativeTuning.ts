import type { BoardRuntime } from "../../core/game/BoardRuntime";

export interface AlternativeTuning {
  settlementFoodPerTick: number;
  baseMoveWork: number;
  troopWorkPerTick: number;
  logisticsDistanceFactor: number;
  slopeFactor: number;
}

export const DEFAULT_ALTERNATIVE_TUNING: AlternativeTuning = {
  settlementFoodPerTick: 10,
  baseMoveWork: 60,
  troopWorkPerTick: 0.25,
  logisticsDistanceFactor: 0.25,
  slopeFactor: 1 / 128,
};

const TUNING_KEY = "alternative.tuning";

export function getAlternativeTuning(runtime: BoardRuntime): AlternativeTuning {
  return {
    ...DEFAULT_ALTERNATIVE_TUNING,
    ...((runtime.globals[TUNING_KEY] as Partial<AlternativeTuning>) ?? {}),
  };
}

export function setAlternativeTuning(
  runtime: BoardRuntime,
  patch: Partial<AlternativeTuning>,
): void {
  runtime.globals[TUNING_KEY] = {
    ...getAlternativeTuning(runtime),
    ...patch,
  };
}

export function resetAlternativeTuning(runtime: BoardRuntime): void {
  delete runtime.globals[TUNING_KEY];
}
