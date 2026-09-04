import { Game, LandUse, Player, UnitType } from "../../game/Game";
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

// ── BFS scratch ──
//
// The flood's per-tile working state (visited / distance / source farm / source
// maturity) used to live in four `Map<TileRef, …>` allocated per refresh, which
// made the shed the single most expensive thing in the tick on a big map: ~20
// hash operations per shed tile, plus territory-sized Maps churning through the
// GC every refresh (measured 37% of sim time on SPQR at 1.2M owned tiles).
//
// They are map-sized typed arrays instead, allocated once and shared by EVERY
// player and refresh — `recompute` is single-threaded and non-reentrant, so
// there is only ever one flood in flight. `stamp[tile] === run` replaces
// `dist.has(tile)`: bumping `run` invalidates the whole plane, so nothing is
// ever cleared. The visited SET is the BFS `queue` itself (every visited tile is
// pushed exactly once, in the same order `Map` iteration used to yield), so the
// passes that used to walk `dist` walk a contiguous array instead.
//
// This is a pure representation change: same traversal, same order, same output.
let scratchSize = 0;
let stamp = new Int32Array(0);
let distOf = new Int32Array(0);
let srcFarmOf = new Int32Array(0);
let srcMaturityOf = new Float64Array(0);
/** Per-tile farm maturity, cached during the single pass so the coverage sort
 *  ranks against an array instead of re-entering the player's maturity Map
 *  twice per comparison. Only read for tiles written in the same pass. */
let maturityOf = new Float64Array(0);
/** Generation counter for `stamp`. Bumped once per `recompute`. */
let run = 0;

function ensureScratch(tiles: number): void {
  if (scratchSize >= tiles) return;
  scratchSize = tiles;
  stamp = new Int32Array(tiles);
  distOf = new Int32Array(tiles);
  srcFarmOf = new Int32Array(tiles);
  srcMaturityOf = new Float64Array(tiles);
  maturityOf = new Float64Array(tiles);
  // Fresh arrays read 0 everywhere, so restart the generation counter; the
  // `run += 1` at the top of recompute makes the first live generation 1.
  run = 0;
}

// ── Per-tile shed output ──
//
// `potential` and `cellOf` used to be Map<TileRef, …> per player. Measured on
// SPQR at 323k shed tiles: building them costs ~35 ms EACH per refresh cadence
// against ~6 ms for a typed-array plane, and every read is a hash lookup where
// an array index would do (13.0 ms vs 3.4 ms over the same 323k probes).
//
// Sheds are DISJOINT — a tile has exactly one owner, so one player's shed can
// never overlap another's — which means these do not need to be per player at
// all. One shared plane per quantity, indexed by tile, serves every player and
// costs 12 MB on the largest map instead of 66 sparse hash tables.
//
// The catch a shared plane brings: a tile a player LOST keeps that player's
// stale entry until somebody overwrites it. So each shed remembers exactly the
// tiles it wrote (`tiles`) and clears them before re-flooding.
let planeSize = 0;
/** The game the planes currently hold data for. They are module-level, so a NEW
 *  game in the same process (the shell restarting a match, or the next test)
 *  would otherwise inherit stale entries — and since smallIDs are reused, the
 *  owner tag would match and hand the new game the old one's shed. Caught by
 *  `no farms → no food-shed anywhere` failing with a leftover potential. */
let planeGame: object | null = null;
/** Which player's shed owns each tile's entry. A shared plane would otherwise
 *  answer for WHOEVER owns the tile, so asking one player's shed about another
 *  player's ground would return that other player's value instead of "not in my
 *  shed". Consumers only ever ask about their own tiles, but relying on that
 *  would be a footgun — and it would quietly change behaviour, which this
 *  refactor must not do. */
let shedOwnerPlane = new Int32Array(0);
let cellPlane = new Int32Array(0);
/** The same assignment as `cellPlane`, but as a DENSE INDEX into the shed's
 *  `farms` list. Consumers that accumulate per cell (FoodEconomy's production
 *  and granary-capacity pass, once per tilled tile) can then use plain arrays
 *  instead of hashing a tile ref four times per tile. */
let cellIdxPlane = new Int32Array(0);
/** f64, not f32: `potential` feeds farm yield and the urban-growth gate, so its
 *  precision is part of the simulation's result. */
let potentialPlane = new Float64Array(0);

function ensurePlanes(game: object, tiles: number): void {
  if (planeSize < tiles) {
    planeSize = tiles;
    shedOwnerPlane = new Int32Array(tiles).fill(-1);
    cellPlane = new Int32Array(tiles).fill(-1);
    cellIdxPlane = new Int32Array(tiles).fill(-1);
    potentialPlane = new Float64Array(tiles);
    planeGame = game;
    return;
  }
  if (planeGame !== game) {
    shedOwnerPlane.fill(-1);
    planeGame = game;
  }
}

export class PlayerFoodShed {
  /** smallID of the player this shed belongs to, set at each refresh. */
  smallID = -1;
  /** The shed's farm cells, in a fixed order — `cellIndexAt` indexes this. */
  farms: TileRef[] = [];
  /** Reverse of `farms`, for the few consumers that hold a cell tile ref. */
  farmIndex = new Map<TileRef, number>();
  /** The tiles this shed covers — its own slice of the shared planes, used to
   *  clear them on refresh and to iterate the shed without scanning the grid. */
  tiles: TileRef[] = [];
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
   * Local distribution (rework-settlement-ecology task 4.2): the shed cell is
   * also the FEEDING neighborhood. `cellAt` gives every owned tile in the shed
   * its nearest nucleus (the Voronoi assignment the BFS already computes);
   * `fedByFarm` carries each cell's last fed-ratio (written by FoodEconomy each
   * tick) so urban recession can prefer razing the starving metro's tiles —
   * one region recedes while another thrives.
   */
  readonly fedByFarm = new Map<TileRef, number>();

  /** Nearest-farm cell of `tile`, or -1 where THIS shed does not reach it. */
  cellAt(tile: TileRef): number {
    return shedOwnerPlane[tile] === this.smallID ? cellPlane[tile] : -1;
  }

  /** Whether this shed reaches `tile`. */
  hasCell(tile: TileRef): boolean {
    return shedOwnerPlane[tile] === this.smallID && cellPlane[tile] >= 0;
  }

  /** Index into `farms` of `tile`'s cell, or -1 outside this shed. */
  cellIndexAt(tile: TileRef): number {
    return shedOwnerPlane[tile] === this.smallID ? cellIdxPlane[tile] : -1;
  }
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

/**
 * A source of the shed's FLOOD other than this file's own BFS — the same
 * injection point `SupplyField` has, for the same reason: `src/core` cannot
 * reach a GPU, so a compute-shader shed has to be offered in rather than
 * branched to.
 *
 * Only the flood is replaceable. Everything the shed derives from it — labor
 * pools, coverage, feeding regions — stays here, because it is per-farm work
 * that no parallel implementation would speed up.
 *
 * `dist` and `cell` are indexed by tile ref; `tiles` lists exactly the tiles
 * covered, in any order (every consumer of the flood's output is
 * order-independent: per-tile writes, integer accumulation, or a sorted rank).
 * Returning null falls back to the CPU flood.
 */
export interface ShedFloodResult {
  tiles: readonly TileRef[];
  dist: Readonly<Uint32Array>;
  cell: Readonly<Int32Array>;
}

export interface ShedFloodProvider {
  flood(mg: Game, player: Player): ShedFloodResult | null;
}

let externalFlood: ShedFloodProvider | null = null;

/** Install (or clear, with null) the external shed flood. */
export function setShedFloodProvider(p: ShedFloodProvider | null): void {
  externalFlood = p;
}

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
/**
 * The player's shed AS IT STANDS — never recomputes, may be null.
 *
 * `foodShedField` refreshes when the cadence is due, which makes it unsafe for
 * an OBSERVER: the GPU uploader runs between ticks, and calling the normal
 * accessor there recomputed sheds early and moved `lastCalcTick`, so the sim's
 * own call later in the tick found them fresh and skipped. Observing the shed
 * changed the shed. (Caught by the injection A/B: 25/41 hashes.)
 *
 * Anything that only wants to LOOK must use this.
 */
export function peekFoodShed(player: Player): PlayerFoodShed | null {
  return foodShedStates.get(player) ?? null;
}

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
  return shedOwnerPlane[tile] === s.smallID ? potentialPlane[tile] : 0;
}

function recompute(mg: Game, player: Player, s: PlayerFoodShed): void {
  const f = mg.config().food();
  const cutoff = Math.ceil(f.foodShedRadius * CUTOFF_RADII);
  const map = mg.map();
  const smallID = player.smallID();
  ensurePlanes(mg, mg.width() * mg.height());
  // Clear only what this shed wrote last time — another player's tiles must
  // survive untouched.
  for (const t of s.tiles) {
    // Only clear what is still MINE. A tile this shed covered last refresh may
    // have changed hands and already been re-flooded by its new owner; wiping
    // it here would delete that player's live entry. (Caught by the sim
    // diverging from tick ~2300 on SPQR — long after a 1200-tick hash check
    // said the refactor was clean.)
    if (shedOwnerPlane[t] !== smallID) continue;
    shedOwnerPlane[t] = -1;
    cellPlane[t] = -1;
    cellIdxPlane[t] = -1;
    potentialPlane[t] = 0;
  }
  s.tiles = [];
  s.smallID = smallID;

  // BFS over owned land carrying, per tile, the step-distance to the nearest
  // farm and that farm's maturity (the shortest-path source). Distance and
  // source maturity live in the shared scratch planes above; the exported field
  // keeps only the precomputed potential = srcMaturity·decay(dist). `queue`
  // doubles as the visited list every later pass iterates.
  ensureScratch(mg.width() * mg.height());
  run += 1;
  // Seeds in ascending tile-ref order (order-independent-shed-tiebreak, D3):
  // the lower-ref wave then leads, so the tie-break below usually has nothing
  // to correct and the flood costs what it always did.
  const farms: TileRef[] = [];
  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const tile = farm.tile();
    if (map.ownerID(tile) !== smallID) continue;
    farms.push(tile);
  }
  farms.sort((a, b) => a - b);

  // `work` may hold a tile more than once (a tile is re-queued when it adopts a
  // better source); `visited` holds each exactly once, in first-reach order,
  // and is what every later pass walks.
  const work: TileRef[] = [];
  const queue: TileRef[] = [];
  for (const tile of farms) {
    const m = player.farmMaturity(tile) / 1000;
    if (stamp[tile] !== run) {
      stamp[tile] = run;
      distOf[tile] = 0;
      srcMaturityOf[tile] = m;
      srcFarmOf[tile] = tile;
      work.push(tile);
      queue.push(tile);
    } else if (m > srcMaturityOf[tile]) {
      srcMaturityOf[tile] = m;
    }
  }

  s.farms = farms;
  s.farmIndex = new Map<TileRef, number>();
  for (let i = 0; i < farms.length; i++) s.farmIndex.set(farms[i], i);

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

  // An external flood replaces the traversal below, not what follows it.
  const supplied =
    externalFlood === null ? null : externalFlood.flood(mg, player);
  if (supplied !== null) {
    for (const t of supplied.tiles) {
      const cell = supplied.cell[t];
      if (cell < 0) continue;
      stamp[t] = run;
      distOf[t] = supplied.dist[t];
      srcFarmOf[t] = cell;
      srcMaturityOf[t] = player.farmMaturity(cell) / 1000;
      queue.push(t);
    }
    // Regions come from the flood's own "these two waves touched" test, which
    // an external flood cannot report. Adjacent tiles in different cells is the
    // same condition, so recover it in one pass over what was supplied.
    for (const t of queue) {
      const cur = srcFarmOf[t];
      const k = map.neighbors4(t, nbuf);
      for (let i = 0; i < k; i++) {
        const n = nbuf[i];
        if (stamp[n] !== run) continue;
        if (srcFarmOf[n] !== cur) union(cur, srcFarmOf[n]);
      }
    }
  }

  let head = 0;
  while (supplied === null && head < work.length) {
    const cur = work[head++];
    const d = distOf[cur] + 1;
    if (d > cutoff) continue;
    const curM = srcMaturityOf[cur];
    const curFarm = srcFarmOf[cur];
    const n4 = map.neighbors4(cur, nbuf);
    for (let i = 0; i < n4; i++) {
      const n = nbuf[i];
      if (stamp[n] === run) {
        // Floods touch → one region. `union` is already a no-op when both sides
        // share a root, and equal sources ALWAYS share one, so this guard skips
        // the two path-compressing finds for the common case (a neighbour in
        // the same Voronoi cell) without changing the result.
        if (srcFarmOf[n] !== curFarm) union(curFarm, srcFarmOf[n]);
        // TIE-BREAK (order-independent-shed-tiebreak): a tile equally distant
        // from two farms belongs to the LOWER tile ref, not to whichever wave
        // arrived first. A first-writer-wins BFS cannot express that, so an
        // equal-distance neighbour offering a lower source adopts it and is
        // re-queued to pass the improvement on. Sources only ever decrease, so
        // this terminates.
        if (distOf[n] === d && srcFarmOf[n] > curFarm) {
          srcFarmOf[n] = curFarm;
          srcMaturityOf[n] = curM;
          work.push(n);
        }
        continue;
      }
      if (map.ownerID(n) !== smallID) continue;
      if (!map.isLand(n) || map.isImpassable(n)) continue;
      stamp[n] = run;
      distOf[n] = d;
      srcMaturityOf[n] = curM;
      srcFarmOf[n] = curFarm;
      work.push(n);
      queue.push(n);
    }
  }

  // Feeding neighborhoods (task 4.2): persist the Voronoi assignment and
  // the region (connected component) of every nucleus.
  s.regionOf.clear();
  for (const farm of farms) {
    s.regionOf.set(farm, find(farm));
  }
  // Drop fed-ratios of farms that no longer exist.
  for (const farm of Array.from(s.fedByFarm.keys())) {
    if (stamp[farm] !== run) s.fedByFarm.delete(farm);
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

  // The field of each nucleus: its cell's CLAIMED spread tiles — the unit
  // of labor coverage. Cell assignment comes from the same nearest-farm BFS.
  const claim = f.fieldClaimMilli;
  const nuclei = new Set<TileRef>(farms);
  const cellClaims = new Map<TileRef, TileRef[]>();
  for (const farm of farms) cellClaims.set(farm, []);

  // ONE pass over the visited set for every per-tile output: potential, cell
  // assignment, labor pooling and the claimed-tile lists. These used to be four
  // separate walks of the `dist` map, each re-reading the tile's source farm.
  s.tiles = queue;
  for (const tile of queue) {
    const farm = srcFarmOf[tile];
    shedOwnerPlane[tile] = smallID;
    potentialPlane[tile] = srcMaturityOf[tile] * foodShedDecay(distOf[tile], f);
    cellPlane[tile] = farm;
    cellIdxPlane[tile] = s.farmIndex.get(farm) ?? -1;
    const housed = player.density(tile);
    if (housed > 0) {
      const people = Math.floor(housed * occupancy);
      s.laborByFarm.set(farm, (s.laborByFarm.get(farm) ?? 0) + people);
    }
    // A Field-zoned tile that senesced to the initial-farmland floor is still
    // claimed ground (rework-persistent-tiles-and-burn): it needs labor to be
    // re-tilled and regrow, so it counts toward coverage even below the
    // maturity claim threshold.
    if (!nuclei.has(tile)) {
      // Cache the maturity the coverage sort below ranks on. It is read here
      // anyway, and `farmMaturity` is a Map lookup — left inside the sort
      // comparator it costs TWO lookups per comparison, i.e. O(n log n) hashes
      // over every claimed tile in the territory (the same order of work as the
      // flood itself). Read once, sort against the array.
      const maturity = player.farmMaturity(tile);
      maturityOf[tile] = maturity;
      if (maturity >= claim || player.landUse(tile) === LandUse.Field) {
        cellClaims.get(farm)!.push(tile);
      }
    }
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
    tiles.sort((a, b) => maturityOf[b] - maturityOf[a] || a - b);
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
