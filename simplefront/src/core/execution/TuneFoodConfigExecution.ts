import { FoodConfig } from "../configuration/FoodConfig";
import { Execution, Game } from "../game/Game";

/**
 * Applies a tune_food_config intent (add-sim-tuning-panel): pins one
 * FoodConfig knob to a new value (or back to its default) on the game's
 * Config. One-shot; the merged config is read by every economy tick from
 * then on. Because it arrives as an intent, the change is part of the turn
 * log — replays reproduce tuned games exactly.
 */
export class TuneFoodConfigExecution implements Execution {
  private active = true;

  constructor(
    private key: keyof FoodConfig,
    private value: number,
  ) {}

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  init(mg: Game, _ticks: number): void {
    // The zod schema already restricts keys/values; clamp defensively so a
    // hand-crafted turn log still cannot produce NaN/negative knobs.
    if (Number.isFinite(this.value) && this.value >= 0) {
      mg.config().setFoodOverride(this.key, this.value);
    }
    this.active = false;
  }

  tick(_ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }
}
