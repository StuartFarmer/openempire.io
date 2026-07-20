import { Game, Player } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { farmPotentialMilli } from "./FarmField";

/**
 * Bot economy model (simplify-food-economy, economy-planner spec): two
 * rules, priced directly by the sim's own formulas — no forecasting, no
 * labor models, no population-tick calculus.
 */

/**
 * Score a Farmland site: the full-field POTENTIAL (milli-food/tick once the
 * field has grown across the owned footprint) — the sim's own formula
 * (FarmField.farmPotentialMilli), so bots farm the best visible footprint.
 */
export function farmSiteScoreMilli(
  mg: Game,
  player: Player,
  tile: TileRef,
): number {
  return farmPotentialMilli(mg, player, tile);
}

/**
 * True when the player's population presses its housing ceiling — the
 * settlement-purchase trigger. `fraction` is how close to the ceiling
 * counts as "bound" (0.9 → within 10%).
 */
export function housingBound(
  mg: Game,
  player: Player,
  fraction = 0.9,
): boolean {
  const housing = mg.config().maxTroops(player);
  if (housing <= 0) return false;
  return player.foodFlow().population >= housing * fraction;
}
