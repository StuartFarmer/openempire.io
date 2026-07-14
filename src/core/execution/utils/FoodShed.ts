import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";

/**
 * The food-shed (openspec add-urban-core-growth, growth-model.md Part 2): a
 * SECOND supply field, separate from the military one (SupplyField.ts). Where
 * military supply emanates from Settlements and governs troops, the food-shed
 * emanates from FARMLAND — weighted by each farm's maturity — and governs how
 * fast a nearby Settlement grows into a city.
 *
 * A mature farm projects potential  M · 1/(1 + (d/foodShedRadius)^foodShedPower)
 * over owned land at step-distance d — the same soft-decay curve as military
 * supply, different source. A settlement ringed by ripe farms sits in high
 * potential and races up its growth curve; one out past the decay tail barely
 * grows. Maturity-weighting means a freshly-planted farm feeds almost nothing
 * until it ripens — the positive-feedback delay that makes farm-tending matter.
 *
 * Implementation: a single multi-source BFS over owned passable land carries,
 * for each tile, the step-distance to the nearest farm AND that farm's maturity
 * (the shortest-path source). potential = srcMaturity · decay(dist). This is
 * the nearest-farm approximation to the paper's Σ-over-farms superposition —
 * cheap (one BFS), deterministic, and faithful to "farmland close by → grows".
 * Refreshed on the same cadence as military supply (up to one cadence stale,
 * identically on every client).
 */

/** Flood cutoff in radii — beyond this, potential is negligible. */
const CUTOFF_RADII = 3;

export class PlayerFoodShed {
  /** Owned-land tile → precomputed potential srcMaturity·decay(dist) in [0,1].
   *  Precomputed at refresh so the hot urban-growth loop is a plain lookup
   *  (no per-tile Math.pow). */
  readonly potential = new Map<TileRef, number>();
  /**
   * Farm tile → people living in its shed cell (rework-settlement-ecology
   * task 4.1). The BFS partitions the shed into nearest-farm Voronoi cells;
   * each farm's labor pool is the summed urban density of its cell — every
   * farmer tends exactly one farm, no double counting.
   */
  readonly laborByFarm = new Map<TileRef, number>();
  lastCalcTick = -1;
}

const foodShedStates = new WeakMap<Player, PlayerFoodShed>();

/** Soft-decay curve — the food-shed twin of supplyQualityFromDistance. */
export function foodShedDecay(
  d: number,
  f: { foodShedRadius: number; foodShedPower: number },
): number {
  if (!Number.isFinite(d)) return 0;
  return 1 / (1 + Math.pow(d / f.foodShedRadius, f.foodShedPower));
}

/**
 * The player's food-shed field, refreshed on the supply cadence (or first
 * use). Call once per player per tick and reuse the returned object.
 */
export function foodShedField(mg: Game, player: Player): PlayerFoodShed {
  let s = foodShedStates.get(player);
  if (s === undefined) {
    s = new PlayerFoodShed();
    foodShedStates.set(player, s);
  }
  const period = Math.max(1, mg.config().food().supplyRefreshTicks);
  const t = mg.ticks();
  if (s.lastCalcTick === -1 || t - s.lastCalcTick >= period) {
    recompute(mg, player, s);
    s.lastCalcTick = t;
  }
  return s;
}

/** Food-shed potential (0..1) at an owned tile per the current field. */
export function foodShedPotential(
  mg: Game,
  s: PlayerFoodShed,
  tile: TileRef,
): number {
  return s.potential.get(tile) ?? 0;
}

function recompute(mg: Game, player: Player, s: PlayerFoodShed): void {
  const f = mg.config().food();
  const cutoff = Math.ceil(f.foodShedRadius * CUTOFF_RADII);
  const map = mg.map();
  const smallID = player.smallID();
  s.potential.clear();

  // BFS over owned land carrying, per tile, the step-distance to the nearest
  // farm and that farm's maturity (the shortest-path source). Distance and
  // source maturity live in scratch maps; the exported field keeps only the
  // precomputed potential = srcMaturity·decay(dist).
  const dist = new Map<TileRef, number>();
  const srcMaturity = new Map<TileRef, number>();
  const srcFarm = new Map<TileRef, TileRef>();
  const farms: TileRef[] = [];
  const queue: TileRef[] = [];
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const tile = farm.tile();
    if (map.ownerID(tile) !== smallID) continue;
    farms.push(tile);
    const m = player.farmMaturity(tile) / 1000;
    if (!dist.has(tile)) {
      dist.set(tile, 0);
      srcMaturity.set(tile, m);
      srcFarm.set(tile, tile);
      queue.push(tile);
    } else if (m > (srcMaturity.get(tile) ?? 0)) {
      srcMaturity.set(tile, m);
    }
  }

  const nbuf: TileRef[] = [0, 0, 0, 0];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const d = dist.get(cur)! + 1;
    if (d > cutoff) continue;
    const curM = srcMaturity.get(cur) ?? 0;
    const n4 = map.neighbors4(cur, nbuf);
    for (let i = 0; i < n4; i++) {
      const n = nbuf[i];
      if (dist.has(n)) continue;
      if (map.ownerID(n) !== smallID) continue;
      if (!map.isLand(n) || map.isImpassable(n)) continue;
      dist.set(n, d);
      srcMaturity.set(n, curM);
      srcFarm.set(n, srcFarm.get(cur)!);
      queue.push(n);
    }
  }

  for (const [tile, d] of dist) {
    s.potential.set(tile, (srcMaturity.get(tile) ?? 0) * foodShedDecay(d, f));
  }

  // Labor pools: each farm is tended by the people whose homes fall in its
  // nearest-farm cell of the shed.
  s.laborByFarm.clear();
  for (const [tile] of dist) {
    const people = player.density(tile);
    if (people <= 0) continue;
    const farm = srcFarm.get(tile)!;
    s.laborByFarm.set(farm, (s.laborByFarm.get(farm) ?? 0) + people);
  }

  // The RURAL population: everyone not housed in a city tile. A young
  // village has no urban tiles at all — its whole population is rural, and
  // rural people are exactly who tends farms. Without this the labor model
  // is a bootstrap death-trap (no city → no farmers → no food → no city).
  // Rural labor splits equally across farms until 4.2 spatializes it.
  if (farms.length > 0) {
    let urban = 0;
    for (const [, people] of player.densityEntries()) urban += people;
    const rural = Math.max(0, player.foodFlow().population - urban);
    const perFarm = Math.floor(rural / farms.length);
    if (perFarm > 0) {
      for (const farm of farms) {
        s.laborByFarm.set(farm, (s.laborByFarm.get(farm) ?? 0) + perFarm);
      }
    }
  }

  // Surplus spillover: a dense core holds far more people than its nearest
  // farm needs; the excess walks to the under-tended farms of the same shed
  // network (deterministic tile-ref order). Only city-dwellers inside some
  // shed cell count here — locality still rules; this just stops one
  // Voronoi cell from hoarding workers three farms could use.
  const need = f.farmersPerFarm;
  let surplus = 0;
  for (const [farm, pool] of s.laborByFarm) {
    if (pool > need) {
      surplus += pool - need;
      s.laborByFarm.set(farm, need);
    }
  }
  if (surplus > 0) {
    const hungry: TileRef[] = [];
    for (const farm of farms) {
      if ((s.laborByFarm.get(farm) ?? 0) < need) hungry.push(farm);
    }
    hungry.sort((a, b) => a - b);
    for (const farm of hungry) {
      if (surplus <= 0) break;
      const pool = s.laborByFarm.get(farm) ?? 0;
      const take = Math.min(need - pool, surplus);
      s.laborByFarm.set(farm, pool + take);
      surplus -= take;
    }
  }
}

/**
 * Labor factor of a farm (rework-settlement-ecology task 4.1): output scales
 * with the farmers living in the farm's shed cell —
 * max(laborFloor, min(1, localPop / farmersPerFarm)). A soft multiplier: an
 * unpeopled breadbasket underproduces but never hits zero from labor alone
 * (the floor is a death-spiral guard).
 */
export function farmLaborFactor(
  mg: Game,
  shed: PlayerFoodShed,
  farmTile: TileRef,
): number {
  const f = mg.config().food();
  const local = shed.laborByFarm.get(farmTile) ?? 0;
  return Math.max(f.laborFloor, Math.min(1, local / f.farmersPerFarm));
}
