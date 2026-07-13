import { Game, Player } from "../../game/Game";
import { GameMap, TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { simpleHash } from "../../Util";
import { foodTick } from "./FoodEconomy";
import { PlayerSupply, supplyField, supplyQuality } from "./SupplyField";

/**
 * The urban tick (openspec add-urban-core-growth). A hybrid on layered maps:
 * the player STILL paints Farmland (food) and Barns (storage) — that food
 * economy runs unchanged via FoodEconomy.foodTick — but the CITY is no longer
 * painted. It sprawls on its own as a per-tile density field grown from a
 * founded Core, and that sprawl (not settlements) sets the population cap.
 *
 * The sprawl follows the urban-growth literature:
 *   - HOW MUCH (Wang et al.): built area advances on a logistic S-curve
 *     ΔA = r·A·(1 − A/K)·surplus, where the surplus is the food surplus from
 *     the player's farms — a well-fed city sprawls, a starving one recedes.
 *   - WHERE (Marquis & Barthelemy): the area budget is deposited on the
 *     frontier weighted by a suitability field (fertility, freshwater, shore,
 *     supply logistics − congestion), reproducing the exponential density
 *     gradient, √P radius scaling, and rough edges emergently.
 *
 * Deterministic: the suitability field is a pure function of layers+supply+
 * density; deposit order uses a per-tick seeded PRNG.
 */

/** Hard cap on deposit iterations per player per tick (runaway backstop). */
const MAX_DEPOSITS = 4096;

/**
 * Suitability of an owned land tile for urban growth (add-urban-core-growth).
 * s = w_food·crop + w_water·(water + w_shore·shore) + w_logi·supplyQ − w_cong·localDensity.
 * `localDensity` is the caller's start-of-tick 4-neighborhood average in [0,1].
 */
export function urbanSuitability(
  mg: Game,
  player: Player,
  supply: PlayerSupply,
  tile: TileRef,
  localDensity: number,
): number {
  const f = mg.config().food();
  const map = mg.map();
  const cropN = mg.layer("crop", tile) / 255;
  const waterN = mg.layer("water", tile) / 255;
  const shore = map.isShoreline(tile) || map.isOceanShore(tile) ? 1 : 0;
  const supplyQ = supplyQuality(mg, supply, tile);
  return (
    f.wFood * cropN +
    f.wWater * (waterN + f.wShore * shore) +
    f.wLogi * supplyQ -
    f.wCong * localDensity
  );
}

export function urbanTick(mg: Game, player: Player): void {
  // Food economy (painted Farmland + Barn plots, unchanged): farms produce,
  // barns store, the population — capped by the urban sprawl (density field)
  // via Config.maxTroops — eats and grows or starves. Returns the surplus.
  const surplusFactor = foodTick(mg, player);

  // Urban sprawl growth (the new mechanic): a fed city sprawls. On a food
  // surplus, the built area advances on the logistic curve, spatially placed
  // by the suitability field; on a deficit, foodTick starves and the sprawl
  // recedes here.
  if (player.core() === null) return;
  if (surplusFactor > 0) {
    const supply = supplyField(mg, player);
    growUrbanArea(mg, player, supply, surplusFactor);
  } else if (player.foodFlow().starvedTroops > 0) {
    recedeDensity(player, mg.config().food().starvationDeathFraction);
  }
}

/**
 * Deposit this tick's logistic area budget onto the frontier, weighted by
 * suitability. Congestion (in the suitability field) saturates the interior
 * and pushes deposition outward; a fraction seeds satellites beyond the front.
 */
export function growUrbanArea(
  mg: Game,
  player: Player,
  supply: PlayerSupply,
  surplusFactor: number,
): void {
  const f = mg.config().food();
  const map = mg.map();
  const smallID = player.smallID();

  // Start-of-tick local density (for the congestion term) — snapshot so all
  // deposits this tick see a consistent field.
  const localDensity = (tile: TileRef): number => {
    const nbuf: TileRef[] = [0, 0, 0, 0];
    const n = map.neighbors4(tile, nbuf);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += player.density(nbuf[i]) / 1000;
    return n > 0 ? sum / n : 0;
  };

  // Suitability + carrying capacity K over reachable owned land.
  const suit = new Map<TileRef, number>();
  let K = 0;
  for (const [tile] of supply.dist) {
    if (map.ownerID(tile) !== smallID) continue;
    if (!map.isLand(tile) || map.isImpassable(tile)) continue;
    const s = urbanSuitability(mg, player, supply, tile, localDensity(tile));
    const sp = s > 0 ? s : 0;
    suit.set(tile, sp);
    K += sp;
  }
  if (K <= 0) return;

  const A = player.urbanArea();
  const deltaA = f.urbanGrowthRate * A * (1 - A / K) * surplusFactor;
  let budget = Math.floor(deltaA * 1000); // milli-density to deposit
  if (budget <= 0) return;

  // Frontier: reachable owned unbuilt-or-partial tiles adjacent to built land
  // (or the core). Satellite pool: any reachable unbuilt tile.
  const core = player.core();
  const nbuf: TileRef[] = [0, 0, 0, 0];
  const isFrontier = (tile: TileRef): boolean => {
    if (player.density(tile) >= 1000) return false;
    if (player.density(tile) > 0 || tile === core) return true;
    const n = map.neighbors4(tile, nbuf);
    for (let i = 0; i < n; i++) if (player.density(nbuf[i]) > 0) return true;
    return false;
  };
  const frontier: TileRef[] = [];
  const inFrontier = new Set<TileRef>();
  const satellitePool: TileRef[] = [];
  for (const [tile, sp] of suit) {
    if (sp <= 0) continue;
    if (isFrontier(tile)) {
      frontier.push(tile);
      inFrontier.add(tile);
    } else if (player.density(tile) === 0) {
      satellitePool.push(tile);
    }
  }

  const rand = new PseudoRandom(
    simpleHash(`urban:${player.id()}:${mg.ticks()}`),
  );
  const weightOf = (tile: TileRef): number => suit.get(tile) ?? 0;
  const step = f.densityStepMilli;

  let guard = 0;
  while (budget > 0 && guard < MAX_DEPOSITS) {
    guard++;

    // Satellite seeding: a disconnected deposit that becomes a new nucleus.
    if (satellitePool.length > 0 && rand.next() < f.dispersalRate) {
      const t = weightedPick(satellitePool, weightOf, rand);
      if (t !== null) {
        deposit(player, t, Math.min(step, budget));
        budget -= Math.min(step, budget);
        // The satellite is now built — its neighbors become frontier.
        promoteNeighbors(map, player, t, suit, frontier, inFrontier, nbuf);
        continue;
      }
    }

    if (frontier.length === 0) break;
    const t = weightedPick(frontier, weightOf, rand);
    if (t === null) break;
    const room = 1000 - player.density(t);
    const add = Math.min(step, budget, room);
    deposit(player, t, add);
    budget -= add;
    if (player.density(t) >= 1000) {
      // Saturated — drop from frontier, promote unbuilt neighbors.
      inFrontier.delete(t);
      const idx = frontier.indexOf(t);
      if (idx >= 0) frontier.splice(idx, 1);
      promoteNeighbors(map, player, t, suit, frontier, inFrontier, nbuf);
    }
  }
}

function promoteNeighbors(
  map: GameMap,
  player: Player,
  tile: TileRef,
  suit: Map<TileRef, number>,
  frontier: TileRef[],
  inFrontier: Set<TileRef>,
  nbuf: TileRef[],
): void {
  const n = map.neighbors4(tile, nbuf);
  for (let i = 0; i < n; i++) {
    const nb = nbuf[i];
    if (inFrontier.has(nb)) continue;
    if (player.density(nb) >= 1000) continue;
    if ((suit.get(nb) ?? 0) <= 0) continue;
    frontier.push(nb);
    inFrontier.add(nb);
  }
}

function deposit(player: Player, tile: TileRef, milli: number): void {
  player.setDensity(tile, player.density(tile) + milli);
}

/** Weighted random pick from `pool` by `weightOf`; null if total weight is 0. */
function weightedPick(
  pool: TileRef[],
  weightOf: (t: TileRef) => number,
  rand: PseudoRandom,
): TileRef | null {
  let total = 0;
  for (const t of pool) total += weightOf(t);
  if (total <= 0) return null;
  let r = rand.nextFloat(0, total);
  for (const t of pool) {
    r -= weightOf(t);
    if (r <= 0) return t;
  }
  return pool[pool.length - 1];
}

/** Uniformly recede density by `frac` (deurbanization under starvation). */
function recedeDensity(player: Player, frac: number): void {
  if (frac <= 0) return;
  const entries = Array.from(player.densityEntries());
  for (const [tile, dMilli] of entries) {
    player.setDensity(tile, dMilli * (1 - frac));
  }
}
