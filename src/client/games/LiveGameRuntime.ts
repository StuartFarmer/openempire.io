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
  resolvePlotAction?(
    player: Player,
    action: LivePlotAction,
    tile: number,
  ): LiveActionResolution;
  plotFrame?(): Int32Array;
  stats?(player: Player): LiveRuntimeStats;
  dispose(): void;
}
