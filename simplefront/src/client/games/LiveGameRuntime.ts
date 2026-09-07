import type { Intent } from "../../core/Schemas";
import type { Player } from "../../core/game/Game";

export type LivePlotAction = "city" | "farm" | "raze";
export type LiveActionResolution =
  | { ok: true; intent: Intent }
  | { ok: false; message: string };
export interface LiveRuntimeStats {
  population: number;
  production: number;
  consumption: number;
  starved: number;
}

export interface LiveGameRuntime {
  beforeTick(): Promise<void>;
  /** Optional same-tick projection refresh after the authoritative core tick. */
  afterTick?(): Promise<void>;
  resolvePlotAction?(
    player: Player,
    action: LivePlotAction,
    tile: number,
  ): LiveActionResolution;
  plotFrame?(): Float64Array;
  stats?(player: Player): LiveRuntimeStats;
  dispose(): void;
}
