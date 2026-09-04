import { Game, LandUse, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { simpleHash } from "../../Util";
import { foodTick } from "./FoodEconomy";
import { foodShedField, foodShedPotential } from "./FoodShed";
import { seedAwardTick } from "./SeedAwards";
import { PlayerSupply, supplyField, supplyQuality } from "./SupplyField";
import { nucleusPaceBoost, tenureTick } from "./TileTenure";

/**
 * The urban tick (openspec add-urban-core-growth; see growth-model.md). On
 * layered maps the player places SEEDS — Settlement (city nuclei) and Farmland
 * (food) — and the cities grow themselves as a binary cellular automaton:
 *
 *   - Each tile stores its POPULATION (people, 0..popPerDensity); a full tile
 *     holds popPerDensity people. A new tile fills only 4-adjacent to an
 *     existing city tile (contiguity); no detached satellites. So `urbanArea`
 *     is Σ people / popPerDensity, and sprawl ↔ population are one-to-one.
 *   - HOW BIG (the key bound): the city tracks its FOOD-SUPPORTED size —
 *     target = foodFlow.capacity / popPerDensity. A city is only as big as the
 *     people its farms feed, never as big as the land it owns, so it can't
 *     sprawl across a continent. It grows toward the target a paced few tiles
 *     per tick and razes edge tiles when food drops below it.
 *   - WHERE (Marquis & Barthelemy): each new tile is chosen on the frontier by
 *     suitability (fertility, freshwater, shore, supply − congestion) × a
 *     food-shed gate, so the city grows toward farm-fed, fertile, watered land
 *     and each settlement grows locally from its own surroundings.
 *
 * Deterministic: suitability and food-shed are pure functions of
 * layers+supply+density+maturity; placement order uses a per-tick seeded PRNG.
 */

/** Hard cap on placement iterations per player per tick (runaway backstop). */
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
  // Food economy + demographics: farms produce, the population is born and
  // dies by the food it has (FoodEconomy.foodTick sets foodFlow().population).
  foodTick(mg, player);

  // Seed awards (rework-settlement-ecology): ratchet the high-water marks
  // and bank newly crossed farm/settlement awards. Runs for every player,
  // core or not — conquest earns seeds from the first tile.
  seedAwardTick(mg, player);

  if (player.core() === null) return;

  // Stability (rework-settlement-ecology): advance the demand-gated tenure
  // clocks and refresh the tenure housing bonus, before growth reads them.
  tenureTick(mg, player);

  // The city footprint tracks the LIVING population: it grows near your nuclei
  // (Core + Settlements) where farms feed it, and razes tile-by-tile as people
  // die. When the whole population is gone, so is the city (and the nation).
  const supply = supplyField(mg, player);
  growUrbanArea(mg, player, supply);
  recedeToTarget(mg, player);
}

/** The Core and every completed Settlement — the nuclei a city grows from. */
function nucleusTiles(player: Player): Set<TileRef> {
  const nuclei = new Set<TileRef>();
  const core = player.core();
  if (core !== null) nuclei.add(core);
  for (const s of player.units(UnitType.Settlement)) {
    if (!s.isUnderConstruction()) nuclei.add(s.tile());
  }
  return nuclei;
}

/**
 * Target city size, in whole tiles: the LIVING population divided by the
 * people-per-tile density. Population is driven by food-modulated births and
 * deaths (FoodEconomy), so the city grows as people are born and shrinks as
 * they die — houses follow heads (growth-model.md Part 3).
 */
export function foodTargetTiles(mg: Game, player: Player): number {
  const f = mg.config().food();
  // Tenure raises per-tile housing (rework-settlement-ecology): an aging
  // city houses more people per tile, so the same population needs FEWER
  // tiles — old cities densify instead of sprawling.
  const area = Math.round(player.urbanArea());
  const perTile =
    area > 0
      ? f.popPerDensity + player.tenureCapacityBonus() / area
      : f.popPerDensity;
  // Nuclei anchor the target (rework-settlement-ecology task 10): every
  // founded town deserves its first city tile — without this floor a
  // Settlement placed while national population is under (area+1)·perTile
  // stays a hollow nucleus forever (the founding pair could never actually
  // FOUND anything), and recession can never raze a living town's last tile.
  return Math.max(
    nucleusTiles(player).size,
    Math.floor(player.foodFlow().population / perTile),
  );
}

/**
 * Grow the city toward its food-bounded target by a paced number of WHOLE,
 * fully-opaque tiles (strictly binary — a tile is a city tile or nothing).
 * Each new tile must be 4-adjacent to an existing city tile (contiguity), and
 * is chosen by suitability × food-shed so the city grows toward fertile,
 * well-watered, farm-fed land. Exported for the engine tests.
 */
export function growUrbanArea(
  mg: Game,
  player: Player,
  supply: PlayerSupply,
): void {
  const f = mg.config().food();
  // urbanGrowthRate 0 means frozen urban dynamics (used by inert test
  // configs), not "one tile per tick" via the pacing floor below.
  if (f.urbanGrowthRate <= 0) return;
  const A = Math.round(player.urbanArea());
  const target = foodTargetTiles(mg, player);
  if (A >= target) return;
  const gap = target - A;
  // Pace: close a fraction of the gap this tick (at least one tile), so a city
  // grows over seconds toward its bounded size, not in a single frame. An old
  // capital grows faster (nucleus gravity, rework-settlement-ecology).
  const pace = f.urbanGrowthRate * nucleusPaceBoost(mg, player.core());
  const n = Math.min(gap, Math.max(1, Math.floor(gap * pace)));
  addCityTiles(mg, player, supply, n);
}

/** Place up to `n` whole city tiles on the contiguous, suitable, fed frontier. */
function addCityTiles(
  mg: Game,
  player: Player,
  supply: PlayerSupply,
  n: number,
): void {
  if (n <= 0) return;
  const f = mg.config().food();
  const CITY = f.popPerDensity; // a full city tile = this many people
  const map = mg.map();
  const smallID = player.smallID();
  const nbuf: TileRef[] = [0, 0, 0, 0];

  const localDensity = (tile: TileRef): number => {
    const k = map.neighbors4(tile, nbuf);
    let sum = 0;
    for (let i = 0; i < k; i++) sum += player.density(nbuf[i]) / CITY;
    return k > 0 ? sum / k : 0;
  };

  // Food-shed field: cities only grow where mature farms feed them — the gate
  // that makes each settlement grow LOCALLY and independently.
  const shed = foodShedField(mg, player);

  // Suitability × food-shed over eligible (reachable, owned, non-farm,
  // non-city) land — the placement weights (WHERE the city grows).
  const suit = new Map<TileRef, number>();
  for (const [tile] of supply.dist) {
    if (map.ownerID(tile) !== smallID) continue;
    if (!map.isLand(tile) || map.isImpassable(tile)) continue;
    if (player.density(tile) >= CITY) continue; // already a city tile
    // First claim holds (rework-settlement-ecology §1b): a claimed field
    // tile — nucleus or spread — is food, never city. Tiles merely
    // establishing below the claim threshold are still wild and fair game.
    if (player.isFieldTile(tile)) continue;
    // ...and once field, always field: a SENESCED field tile (dead crop,
    // maturity 0) keeps its Field zone, so the city grows around the fallow
    // patch and never paves it — the farm regrows there instead.
    if (player.landUse(tile) === LandUse.Field) continue;
    // Battle-worn ground never urbanizes until fully healed — the city
    // grows around the scar (rework-settlement-ecology).
    if (mg.tileDamage(tile) > 0) continue;
    const base = urbanSuitability(mg, player, supply, tile, localDensity(tile));
    if (base <= 0) continue;
    const gate = Math.min(1, f.wFoodShed * foodShedPotential(mg, shed, tile));
    const sp = base * gate;
    if (sp <= 0) continue;
    suit.set(tile, sp);
  }

  const isCity = (t: TileRef): boolean => player.density(t) >= CITY;
  const touchesCity = (t: TileRef): boolean => {
    const k = map.neighbors4(t, nbuf);
    for (let i = 0; i < k; i++) if (isCity(nbuf[i])) return true;
    return false;
  };
  // A city grows outward from its NUCLEI (Core + Settlements): a nucleus tile,
  // or land adjacent to one, seeds the first front even before any density
  // exists there — so a fresh settlement's population urbanizes around it.
  const nuclei = nucleusTiles(player);
  const nearNucleus = (t: TileRef): boolean => {
    if (nuclei.has(t)) return true;
    const k = map.neighbors4(t, nbuf);
    for (let i = 0; i < k; i++) if (nuclei.has(nbuf[i])) return true;
    return false;
  };
  // Frontier: eligible tiles 4-adjacent to an existing city tile, or seeded by
  // a nucleus.
  const frontier: TileRef[] = [];
  const inFrontier = new Set<TileRef>();
  for (const [tile] of suit) {
    if (touchesCity(tile) || nearNucleus(tile)) {
      frontier.push(tile);
      inFrontier.add(tile);
    }
  }

  const rand = new PseudoRandom(
    simpleHash(`urban:${player.id()}:${mg.ticks()}`),
  );
  const weightOf = (tile: TileRef): number => suit.get(tile) ?? 0;

  let placed = 0;
  let guard = 0;
  while (placed < n && frontier.length > 0 && guard < MAX_DEPOSITS) {
    guard++;
    // Pick from a CANONICAL order. `weightedPick` walks the pool accumulating
    // weight until it passes the random draw, so the pool's order decides which
    // tile comes out — and the pool inherited its order from `suit`, which
    // inherited it from however the supply field's Map was built. That made the
    // city depend on the traversal order of a data structure: a field with
    // identical contents in a different insertion order grew a different city
    // (demonstrated in .claude/skills/run-openfront/supply-injection-check.mjs
    // — 36/71 hashes in one order, 71/71 in the other). Sorting by tile ref
    // makes the draw a function of the field, which is what any producer other
    // than this exact BFS needs. The frontier is a handful of tiles, so this is
    // free.
    frontier.sort((a, b) => a - b);
    const t = weightedPick(frontier, weightOf, rand);
    if (t === null) break;
    player.setDensity(t, CITY); // a whole, fully-opaque city tile
    // Urbanizing wipes any sub-claim field establishment — the ground is
    // paved before the field ever claimed it (first claim holds).
    player.setFarmMaturity(t, 0);
    placed++;
    inFrontier.delete(t);
    const idx = frontier.indexOf(t);
    if (idx >= 0) frontier.splice(idx, 1);
    // Promote the new tile's eligible neighbours onto the frontier.
    const k = map.neighbors4(t, nbuf);
    for (let i = 0; i < k; i++) {
      const nb = nbuf[i];
      if (inFrontier.has(nb) || isCity(nb)) continue;
      if ((suit.get(nb) ?? 0) <= 0) continue;
      frontier.push(nb);
      inFrontier.add(nb);
    }
  }
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

/**
 * Raze whole city tiles from the OUTER edge (fewest city neighbours first) when
 * the population can no longer fill the city — deaths outrunning births. One
 * tile is protected: the CORE never falls while its people live (the nation
 * dies by starving to zero, not by receding to zero) — and a standing core
 * blocks field spread (§1b), so a famine dip can't hand the capital's ground
 * to the farm CA and lock the city out of its own valley. Paced like growth.
 */
export function recedeToTarget(mg: Game, player: Player): void {
  const f = mg.config().food();
  // urbanGrowthRate 0 freezes contraction too (see growUrbanArea).
  if (f.urbanGrowthRate <= 0) return;
  const A = Math.round(player.urbanArea());
  const target = foodTargetTiles(mg, player);
  if (A <= target) return;
  const gap = A - target;
  let remove = Math.min(gap, Math.max(1, Math.floor(gap * f.urbanGrowthRate)));

  const CITY = f.popPerDensity;
  const map = mg.map();
  const core = player.foodFlow().population > 0 ? player.core() : null;
  const nbuf: TileRef[] = [0, 0, 0, 0];
  const cityNeighbors = (t: TileRef): number => {
    let c = 0;
    const k = map.neighbors4(t, nbuf);
    for (let i = 0; i < k; i++) if (player.density(nbuf[i]) >= CITY) c++;
    return c;
  };
  // Regional famine is regional (task 4.2): recession prefers the tiles of
  // STARVING districts (lowest fed-ratio first), so one metro recedes while
  // a fed one across the map keeps its footprint. Within a district, outer
  // edge first as before. Quantized to percent so float noise can't flip
  // the deterministic order.
  const shed = foodShedField(mg, player);
  const fedRank = (t: TileRef): number => {
    const cell = shed.hasCell(t) ? shed.cellAt(t) : undefined;
    if (cell === undefined) return 100; // outside every district: last
    return Math.round((shed.fedByFarm.get(cell) ?? 1) * 100);
  };
  const tiles = Array.from(player.densityEntries()).map(([t]) => t);
  tiles.sort(
    (a, b) =>
      fedRank(a) - fedRank(b) || cityNeighbors(a) - cityNeighbors(b) || a - b,
  );
  for (const t of tiles) {
    if (remove <= 0) break;
    if (t === core) continue; // the capital stands while its people live
    player.setDensity(t, 0);
    remove--;
  }
}
