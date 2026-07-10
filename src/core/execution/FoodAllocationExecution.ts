import { Execution, Game, Player } from "../game/Game";

/**
 * Applies a food_allocation intent (add-food-allocation): sets the fraction
 * of each tick's food production offered to the population (the rest banks
 * into storage). One-shot — the share persists on the player; foodTick reads
 * it every tick. No effect on unlayered maps (foodTick never runs there).
 */
export class FoodAllocationExecution implements Execution {
  private active = true;

  constructor(
    private player: Player,
    private populationShare: number,
  ) {}

  activeDuringSpawnPhase(): boolean {
    return true;
  }

  init(_mg: Game, _ticks: number): void {
    this.player.setFoodPopulationShare(this.populationShare);
    this.active = false;
  }

  tick(_ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }
}
