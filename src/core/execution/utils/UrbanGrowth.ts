import { Game, Player, UnitType } from "../../game/Game";
import { GameMap, TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { simpleHash } from "../../Util";
import {
  PlayerSupply,
  probeDistance,
  supplyField,
  supplyQuality,
  supplyQualityFromDistance,
} from "./SupplyField";

/**
 * The urban-core growth tick (openspec add-urban-core-growth). Replaces the
 * plot-based food tick on layered maps: the city is a per-tile density field
 * that grows itself from a founded Core. Two coupled dynamics, straight from
 * the urban-growth literature:
 *
 *   - HOW MUCH (Wang et al.): total built area advances on a logistic S-curve
 *     ΔA = r·A·(1 − A/K)·surplus, capped by a land-derived carrying capacity K.
 *   - WHERE (Marquis & Barthelemy): the area budget is deposited on the
 *     frontier weighted by a suitability field with a congestion term that
 *     pushes growth outward — producing the exponential density gradient,
 *     √P radius scaling, and rough edges emergently.
 *
 * Food (production from density×fertility×supply, consumption, storage, decay,
 * starvation, allocation) runs in the same tick. Deterministic: the suitability
 * field is a pure function of layers+supply+density; deposit order uses a
 * per-tick seeded PRNG.
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
  const f = mg.config().food();
  const supply = supplyField(mg, player);
  const impl = player as Player & {
    _foodMilli: bigint;
    _foodFlow: {
      production: number;
      consumption: number;
      starvedTroops: number;
    };
  };

  // ── Production: density × fertility × supply quality ────────────────────
  let prodUnits = 0;
  for (const [tile, dMilli] of player.densityEntries()) {
    const cropN = mg.layer("crop", tile) / 255;
    const q = supplyQuality(mg, supply, tile);
    prodUnits += cropN * (dMilli / 1000) * q;
  }
  const productionMilli = Math.floor(prodUnits * f.urbanYieldMilli);

  // ── Consumption + war-supply attrition (unchanged from the food economy) ─
  let fighting = 0;
  for (const attack of player.outgoingAttacks()) {
    const front = attack.frontTile();
    const frontDist =
      front === null ? Infinity : probeDistance(mg, player, supply, front);
    const q = supplyQualityFromDistance(frontDist, f);
    const losses = Math.floor(attack.troops() * (1 - q) * f.warSupplyAttrition);
    if (losses > 0) attack.setTroops(attack.troops() - losses);
    fighting += attack.troops();
  }
  let moving = 0;
  for (const boat of player.units(UnitType.TransportShip)) {
    moving += boat.troops();
  }
  const idle = player.troops();
  const consumptionMilli = Math.floor(
    idle * f.idleConsumptionMilli +
      moving * f.moveConsumptionMilli +
      fighting * f.fightConsumptionMilli,
  );

  // ── Food stock: allocation split → bank storage → overflow rebate →
  //    feed population (draw storage on shortfall) → decay (see food economy).
  const share = player.foodPopulationShare();
  let popMilli = Math.floor(productionMilli * share);
  const storeMilli = productionMilli - popMilli;
  let stock = impl._foodMilli + BigInt(storeMilli);
  const capMilli = BigInt(f.baseStorage + granaryCapacity(player)) * 1000n;
  if (stock > capMilli) {
    popMilli += Number(stock - capMilli);
    stock = capMilli;
  }
  const netMilli = popMilli - consumptionMilli;
  let deficitMilli = 0;
  if (netMilli < 0) {
    const need = BigInt(-netMilli);
    const draw = stock < need ? stock : need;
    stock -= draw;
    deficitMilli = Number(need - draw);
  }
  stock -= (stock * BigInt(f.decayNumer)) / BigInt(f.decayDenom);
  impl._foodMilli = stock;

  // ── Population fills toward the cap on surplus; starves on deficit ───────
  let starved = 0;
  let surplusFactor = 0;
  if (deficitMilli > 0) {
    const total = idle + fighting + moving;
    const unfed = deficitMilli / f.idleConsumptionMilli;
    starved = Math.min(total, Math.ceil(unfed * f.starvationDeathFraction));
    if (total > 0 && starved > 0) {
      player.removeTroops(Math.round((starved * idle) / total));
      for (const attack of player.outgoingAttacks()) {
        const s = Math.round((starved * attack.troops()) / total);
        attack.setTroops(Math.max(0, attack.troops() - s));
      }
      for (const boat of player.units(UnitType.TransportShip)) {
        const s = Math.round((starved * boat.troops()) / total);
        boat.setTroops(Math.max(0, boat.troops() - s));
      }
    }
    // Deurbanization: a starving city recedes (density decays back to land).
    recedeDensity(player, f.starvationDeathFraction);
  } else if (netMilli > 0) {
    surplusFactor = Math.min(
      1,
      netMilli / Math.max(1, consumptionMilli) / f.surplusForFullGrowth,
    );
    player.addTroops(mg.config().troopIncreaseRate(player) * surplusFactor);
  }

  // ── Logistic area growth, spatially placed by suitability ───────────────
  if (surplusFactor > 0 && player.core() !== null) {
    growUrbanArea(mg, player, supply, surplusFactor);
  }

  // ── Expose flow for UI/stats (display units) ────────────────────────────
  impl._foodFlow.production = Math.floor(productionMilli / 1000);
  impl._foodFlow.consumption = Math.floor(consumptionMilli / 1000);
  impl._foodFlow.starvedTroops = starved;
}

/**
 * Deposit this tick's logistic area budget onto the frontier, weighted by
 * suitability. Congestion (in the suitability field) saturates the interior
 * and pushes deposition outward; a fraction seeds satellites beyond the front.
 */
function growUrbanArea(
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

/**
 * Storage from Granary infrastructure (add-urban-core-growth). Granary is
 * added in task 3 (field-shaping infrastructure); until then this is 0 and
 * storage is `baseStorage` alone.
 */
function granaryCapacity(_player: Player): number {
  return 0;
}
