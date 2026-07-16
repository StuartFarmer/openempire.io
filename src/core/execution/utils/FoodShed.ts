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
  /**
   * The people LIVING in each cell (task 4.2): raw density + rural split,
   * UNCAPPED — this is who eats there. Distinct from laborByFarm, which is
   * capped at staffing need and spilled between cells: a metro's surplus
   * workers still dine at home even when a neighboring field employs them.
   */
  readonly peopleByFarm = new Map<TileRef, number>();
  /**
   * Labor coverage (rework-settlement-ecology §1b). `ranked` holds every
   * claimed spread tile this refresh considered; `tilled` the staffed subset
   * (every nucleus — the bootstrap guard — plus the best-ranked claimed
   * tiles the cell's pool covers at farmersPerFieldTile each). A claimed
   * tile in `ranked` but not `tilled` is FALLOW: it produces nothing and
   * senesces. A claimed tile in NEITHER (claimed since the refresh) is in
   * grace — frozen, judged at the next refresh — so the frontier never
   * flaps on cadence staleness.
   */
  readonly ranked = new Set<TileRef>();
  readonly tilled = new Set<TileRef>();
  /**
   * Local distribution (rework-settlement-ecology task 4.2): the shed cell
   * is also the FEEDING neighborhood. `cellOf` maps every owned tile in the
   * shed to its nearest nucleus (the Voronoi assignment the BFS already
   * computes); `fedByFarm` carries each cell's last fed-ratio (written by
   * FoodEconomy each tick) so urban recession can prefer razing the
   * starving metro's tiles — one region recedes while another thrives.
   */
  readonly cellOf = new Map<TileRef, TileRef>();
  readonly fedByFarm = new Map<TileRef, number>();
  /**
   * Feeding REGION (task 4.2): farm nucleus → the root nucleus of its
   * connected shed component. Cells whose floods touch share food — the
   * design's locality bound is the shed CUTOFF, not the Voronoi seam: a
   * metro eats from every farm within reach, while a region beyond the
   * flood (or cut off by enemy land) starves alone.
   */
  readonly regionOf = new Map<TileRef, TileRef>();
  /** Idle population at refresh time — feeding scales the cell headcounts
   *  to the LIVE pool each tick (task 4.2), or every baby born between
   *  refreshes would sit outside the districts and starve in the camp. */
  idleAtRefresh = 0;
  lastCalcTick = -1;
}

/** Fallow: ranked at the last refresh but left unstaffed. */
export function isFallow(s: PlayerFoodShed, tile: TileRef): boolean {
  return s.ranked.has(tile) && !s.tilled.has(tile);
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
    // Staggered per player like the military supply field (see
    // SupplyField.supplyField): all-on-one-tick refreshes are the
    // once-a-second framerate dip.
    s.lastCalcTick = Math.max(0, t - ((t + player.smallID()) % period));
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

  // Union-find over farm nuclei: floods that touch belong to one feeding
  // REGION (task 4.2). Path-compressed find; union by smaller root tile so
  // the result is deterministic.
  const parent = new Map<TileRef, TileRef>();
  for (const farm of farms) parent.set(farm, farm);
  const find = (a: TileRef): TileRef => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== c) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: TileRef, b: TileRef): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };

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
      if (dist.has(n)) {
        union(srcFarm.get(cur)!, srcFarm.get(n)!); // floods touch → one region
        continue;
      }
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

  // Feeding neighborhoods (task 4.2): persist the Voronoi assignment and
  // the region (connected component) of every nucleus.
  s.cellOf.clear();
  for (const [tile] of dist) {
    s.cellOf.set(tile, srcFarm.get(tile)!);
  }
  s.regionOf.clear();
  for (const farm of farms) {
    s.regionOf.set(farm, find(farm));
  }
  // Drop fed-ratios of farms that no longer exist.
  for (const farm of Array.from(s.fedByFarm.keys())) {
    if (!dist.has(farm)) s.fedByFarm.delete(farm);
  }

  // Labor pools: each farm is tended by the people whose homes fall in its
  // nearest-farm cell of the shed. Every farm gets an entry (0 included) —
  // the feeding loop (FoodEconomy, task 4.2) iterates these cells, and an
  // unpeopled district must still bank, decay, and read as starving.
  s.laborByFarm.clear();
  s.peopleByFarm.clear();
  for (const farm of farms) {
    s.laborByFarm.set(farm, 0);
    s.peopleByFarm.set(farm, 0);
  }
  // DENSITY IS HOUSING, NOT HEADCOUNT (task 4.2): a full city tile houses
  // popPerDensity people, but the nation may hold fewer — count each cell's
  // share of the REAL urban civilians (idle pool capped at total housing),
  // or a half-empty capital reads as ten thousand phantom mouths.
  let housing = 0;
  for (const [, h] of player.densityEntries()) housing += h;
  const idlePop = player.troops();
  const urbanCivilians = Math.min(idlePop, housing);
  const occupancy = housing > 0 ? urbanCivilians / housing : 0;
  for (const [tile] of dist) {
    const housed = player.density(tile);
    if (housed <= 0) continue;
    const farm = srcFarm.get(tile)!;
    const people = Math.floor(housed * occupancy);
    s.laborByFarm.set(farm, (s.laborByFarm.get(farm) ?? 0) + people);
  }

  // The RURAL population: every CIVILIAN not housed in a city tile. A young
  // village has no urban tiles at all — its whole population is rural, and
  // rural people are exactly who tends farms. Without this the labor model
  // is a bootstrap death-trap (no city → no farmers → no food → no city).
  // Idle-based (troops()): deployed soldiers neither farm nor eat at home —
  // the WAR cohort feeds by requisition (task 4.2). Rural labor splits
  // equally across farms.
  if (farms.length > 0) {
    const rural = Math.max(0, idlePop - urbanCivilians);
    const perFarm = Math.floor(rural / farms.length);
    if (perFarm > 0) {
      for (const farm of farms) {
        s.laborByFarm.set(farm, (s.laborByFarm.get(farm) ?? 0) + perFarm);
      }
    }
    // The division remainder joins the first farm — left in the shed-less
    // camp cohort it would starve against zero production (task 4.2).
    const remainder = rural - perFarm * farms.length;
    if (remainder > 0) {
      s.laborByFarm.set(
        farms[0],
        (s.laborByFarm.get(farms[0]) ?? 0) + remainder,
      );
    }
  }

  // Snapshot the raw residents per cell BEFORE the labor spillover caps —
  // feeding (task 4.2) is by residence, tilling is by staffing.
  for (const [farm, people] of s.laborByFarm) {
    s.peopleByFarm.set(farm, people);
  }
  s.idleAtRefresh = idlePop;

  // The field of each nucleus: its cell's CLAIMED spread tiles — the unit
  // of labor coverage. Cell assignment comes from the same nearest-farm BFS.
  const claim = f.fieldClaimMilli;
  const nuclei = new Set<TileRef>(farms);
  const cellClaims = new Map<TileRef, TileRef[]>();
  for (const farm of farms) cellClaims.set(farm, []);
  for (const [tile] of dist) {
    if (nuclei.has(tile)) continue;
    if (player.farmMaturity(tile) < claim) continue;
    cellClaims.get(srcFarm.get(tile)!)!.push(tile);
  }

  // Surplus spillover: a dense core holds far more people than its nearest
  // field needs; the excess walks to the under-staffed fields of the same
  // shed network (deterministic tile-ref order). Only city-dwellers inside
  // some shed cell count here — locality still rules; this just stops one
  // Voronoi cell from hoarding workers three fields could use. A field's
  // need scales with its size: (nucleus + claimed tiles) · farmersPerFieldTile.
  const needOf = (farm: TileRef): number =>
    (1 + cellClaims.get(farm)!.length) * f.farmersPerFieldTile;
  let surplus = 0;
  for (const [farm, pool] of s.laborByFarm) {
    const need = needOf(farm);
    if (pool > need) {
      surplus += pool - need;
      s.laborByFarm.set(farm, need);
    }
  }
  if (surplus > 0) {
    const hungry: TileRef[] = [];
    for (const farm of farms) {
      if ((s.laborByFarm.get(farm) ?? 0) < needOf(farm)) hungry.push(farm);
    }
    hungry.sort((a, b) => a - b);
    for (const farm of hungry) {
      if (surplus <= 0) break;
      const pool = s.laborByFarm.get(farm) ?? 0;
      const take = Math.min(needOf(farm) - pool, surplus);
      s.laborByFarm.set(farm, pool + take);
      surplus -= take;
    }
  }

  // Coverage (rework-settlement-ecology §1b): each pool tills its field's
  // best tiles first. The nucleus is always staffed (the bootstrap guard —
  // a lone spawn farm must start the loop even with zero city-dwellers);
  // then claimed tiles ranked by maturity (settled maturity IS the tile's
  // suitability, so the rank prefers the fertile old core), tileRef as the
  // deterministic tie-break. Everything ranked but unstaffed is fallow.
  s.ranked.clear();
  s.tilled.clear();
  for (const farm of farms) {
    s.tilled.add(farm);
    const tiles = cellClaims.get(farm)!;
    tiles.sort(
      (a, b) => player.farmMaturity(b) - player.farmMaturity(a) || a - b,
    );
    const pool = s.laborByFarm.get(farm) ?? 0;
    let slots = Math.max(0, Math.floor(pool / f.farmersPerFieldTile) - 1);
    for (const t of tiles) {
      s.ranked.add(t);
      if (slots > 0) {
        s.tilled.add(t);
        slots--;
      }
    }
  }
}
