import { Game, Player, UnitType } from "../../game/Game";

/**
 * War intelligence (rework-ai-war-strategy): strategic readings the AI
 * derives from live sim state. The sim is perfect-information — these
 * helpers turn the raw omniscience into the judgments the attack pipeline
 * actually needs, with one convention throughout:
 *
 *   - THREAT judgments (send caps, threat drift, surge detection) use
 *     totalPower — a committed army comes home eventually.
 *   - OPPORTUNITY judgments (victim windows) use the home pool
 *     (player.troops(), which already excludes deployed forces) plus
 *     committedShare — a player mid-push elsewhere is thin at home NOW.
 */

/** Troops currently deployed away from home: outgoing attacks + transports. */
export function deployedTroops(player: Player): number {
  let deployed = 0;
  for (const a of player.outgoingAttacks()) deployed += a.troops();
  for (const b of player.units(UnitType.TransportShip)) deployed += b.troops();
  return deployed;
}

/** Everything a player can eventually bring to bear: home pool + deployed. */
export function totalPower(player: Player): number {
  return player.troops() + deployedTroops(player);
}

/** Deployed fraction of total power (0..1) — how much of them is away. */
export function committedShare(player: Player): number {
  const total = totalPower(player);
  if (total < 1) return 0;
  return deployedTroops(player) / total;
}

/**
 * Ticks of stored food at the current burn rate (last food tick's
 * consumption, display units). Infinity when nothing is being consumed —
 * an empty nation is not "starving", it just isn't eating.
 */
export function foodRunwayTicks(player: Player): number {
  const consumption = player.foodFlow().consumption;
  if (consumption <= 0) return Infinity;
  return Number(player.food()) / consumption;
}

/**
 * The population a nation can actually field against — the greater of its
 * food-supported capacity (the sim's own closed-form achievable population,
 * FoodEconomy) and its living population (home + deployed; a nation at its
 * food ceiling reads as ready even if production dips), clamped to housing
 * (config.maxTroops). The vanilla ratio gates divided by housing alone,
 * which a food-bound population never approaches — nations idled forever in
 * the trigger lottery.
 */
export function effectiveMaxTroops(mg: Game, player: Player): number {
  const housing = mg.config().maxTroops(player);
  const living = player.troops() + deployedTroops(player);
  // Inert/degenerate food configs divide by zero consumption (NaN/Infinity):
  // food never binds there, so housing is the achievable population — the
  // exact legacy gate.
  const capRaw = player.foodFlow().capacity;
  const capacity = Number.isFinite(capRaw) ? capRaw : housing;
  return Math.max(1, Math.min(Math.max(capacity, living), housing));
}
