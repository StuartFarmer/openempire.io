import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { fieldGrowthTick } from "./FarmField";
import { foodTick } from "./FoodEconomy";
import { seedLadderTick } from "./SeedLadder";

/**
 * The urban tick (restore-organic-growth). Order matters:
 *
 *   1. FoodEconomy.foodTick — pool + logistic population.
 *   2. SeedLadder.seedLadderTick — ratchet the peak, bank founding pairs.
 *   3. FarmField.fieldGrowthTick — worked fields spread over fertility.
 *   4. City growth (here) — the city spreads over SUITABILITY, holding one
 *      tile per (difficulty-multiplied) popPerDensity people. It is
 *      PERMANENT: it never recedes on its own (unbound-organic-growth) —
 *      ground is lost only to conquest or death. Housing = housingBase +
 *      cityTiles × popPerDensity (city-growth spec): the city you see IS
 *      the troop ceiling.
 */

export function urbanTick(mg: Game, player: Player): void {
  foodTick(mg, player);
  seedLadderTick(mg, player);
  fieldGrowthTick(mg, player);
  if (player.core() === null) return;
  cityGrowthTick(mg, player);
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

/** Demand-following growth/recession, best-suitability first: the city
 *  holds one tile per popPerDensity people (houses follow heads), so
 *  housing = housingBase + cityTiles·popPerDensity binds exactly when the
 *  player runs out of suitable OWNED land — a territorial constraint, not
 *  an asymptote race against the logistic. */
export function cityGrowthTick(mg: Game, player: Player): void {
  const f = mg.config().food();
  if (f.urbanGrowthRate <= 0) return; // frozen (inert test configs)
  const cityTiles = Math.round(player.urbanArea());
  const pop = player.foodFlow().population;
  // The city builds enough tiles that maxTroops (= housing × the AI
  // difficulty multiplier) covers its people: an Easy bot needs 3× the
  // tiles per person, so its ceiling still scales with the multiplier —
  // without this, a sub-1 multiplier turns the follower into a contraction
  // whose fixed point sits below the first ladder rung (harness 2026-07-20).
  const mult = Math.max(
    0.01,
    mg.config().aiDifficulty(player.type()).populationMultiplier,
  );
  // One tile per (mult · popPerDensity) people: housing then exceeds the
  // population by mult·housingBase — permanent headroom, so the follower
  // never deadlocks at its own ceiling (pop = housingBase → target 0).
  const targetTiles = Math.ceil(pop / (mult * f.popPerDensity));
  // Grow toward demand only — a city is PERMANENT (unbound-organic-growth): it
  // never shrinks itself on a population drop; ground is lost only to conquest
  // (density cleared on ownership change) or death (population 0).
  if (cityTiles < targetTiles) {
    const gap = targetTiles - cityTiles;
    growCity(mg, player, Math.min(gap, paceOf(f.urbanGrowthRate, gap)));
  }
}

/** Close a fraction of the gap per tick, min one tile. */
function paceOf(rate: number, gap: number): number {
  return Math.max(1, Math.floor(rate * gap));
}

/** Add up to `n` city tiles on the best-suitability contiguous frontier. */
function growCity(mg: Game, player: Player, n: number): void {
  const f = mg.config().food();
  const CITY = f.popPerDensity;
  const map = mg.map();
  const smallID = player.smallID();
  const nbuf: TileRef[] = [0, 0, 0, 0];

  // A demand-driven city may claim (and EVICT) worked farm-field tiles — the
  // city has priority so it can always grow into owned land, and the unbounded
  // farm fills the remainder (unbound-organic-growth). Structures and existing
  // city tiles are still off-limits.
  const eligible = (t: TileRef): boolean =>
    map.ownerID(t) === smallID &&
    map.isLand(t) &&
    !map.isImpassable(t) &&
    player.density(t) < CITY &&
    mg.plotAt(t) === undefined; // structures keep their tile

  const nuclei = nucleusTiles(player);

  // Frontier: eligible tiles that are a nucleus or 4-adjacent to city/nuclei.
  const frontier = new Set<TileRef>();
  const consider = (t: TileRef): void => {
    if (eligible(t)) frontier.add(t);
  };
  for (const nucleus of nuclei) {
    consider(nucleus);
    const k = map.neighbors4(nucleus, nbuf);
    for (let i = 0; i < k; i++) consider(nbuf[i]);
  }
  for (const [t] of player.densityEntries()) {
    const k = map.neighbors4(t, nbuf);
    for (let i = 0; i < k; i++) consider(nbuf[i]);
  }

  for (let placed = 0; placed < n; placed++) {
    // Deterministic greedy: best suitability, ties on lowest ref — the
    // city's shape follows the visible plane, exactly like farm fields.
    let best: TileRef | null = null;
    let bestSuit = -1;
    for (const t of frontier) {
      const s = mg.suitability(t);
      if (s > bestSuit || (s === bestSuit && best !== null && t < best)) {
        bestSuit = s;
        best = t;
      }
    }
    if (best === null) return;
    if (player.isFieldTile(best)) player.removeFieldTile(best); // city displaces farm
    player.setDensity(best, CITY);
    frontier.delete(best);
    const k = map.neighbors4(best, nbuf);
    for (let i = 0; i < k; i++) consider(nbuf[i]);
  }
}

