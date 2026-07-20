import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";

/**
 * Worked farm fields (unbound-organic-growth, farm-growth spec): a Farmland's
 * field starts at its own tile and GROWS organically with NO footprint cap —
 * each tick it claims the best-fertility tiles on its 4-adjacent frontier
 * (owned passable land, unclaimed by any field or city, holding no structure),
 * with no distance limit, so it flows around rivers/coasts and keeps growing as
 * the territory grows. Deterministic greedy (ties: lowest tile ref), paced by
 * fieldGrowthRate × current field size (fractional credit) and self-limited by
 * the field's own perimeter each tick. The growth IS the production ramp:
 * FoodEconomy prices the worked set (per worked tile, so a large field yields
 * more than the reference footprint). `farmRadius` is only the production
 * reference and the placement-spacing rule — NOT a growth bound.
 */

/** Advance every completed farm's field one tick. */
export function fieldGrowthTick(mg: Game, player: Player): void {
  const f = mg.config().food();
  if (f.fieldGrowthRate <= 0) return; // frozen (inert test configs)
  const impl = player as Player & { _fieldCredit: Map<TileRef, number> };
  const r = Math.max(0, Math.floor(f.farmRadius));
  // Steady spread: ~fieldGrowthRate × reference-footprint tiles per tick (the
  // same early pace the bounded field had, now continuing without a cap). The
  // per-tick claim is also self-limited by the field's own perimeter.
  const pace = f.fieldGrowthRate * (2 * r + 1) * (2 * r + 1);

  for (const farm of player.units(UnitType.Farmland)) {
    if (farm.isUnderConstruction()) continue;
    const nucleus = farm.tile();
    // Lazy init: the nucleus is always worked (if the player still owns it).
    if (player.fieldTiles(nucleus).size === 0 && mg.owner(nucleus) === player) {
      player.addFieldTile(nucleus, nucleus);
    }
    if (player.fieldTiles(nucleus).size === 0) continue; // lost the nucleus
    const credit = (impl._fieldCredit.get(nucleus) ?? 0) + pace;
    const grow = Math.floor(credit);
    impl._fieldCredit.set(nucleus, credit - grow);
    if (grow > 0) growField(mg, player, nucleus, grow);
  }
}

/** Claim up to `n` best-fertility frontier tiles of the field at `nucleus` in a
 *  single scan (one scan/tick regardless of `n`; capped by the frontier). */
function growField(mg: Game, player: Player, nucleus: TileRef, n: number): void {
  const map = mg.map();
  const full = mg.config().food().popPerDensity;
  const nbuf: TileRef[] = [0, 0, 0, 0];
  // Collect the eligible frontier (deduped) with each candidate's fertility.
  const cand: [TileRef, number][] = [];
  const seen = new Set<TileRef>();
  for (const ft of player.fieldTiles(nucleus)) {
    const k = map.neighbors4(ft, nbuf);
    for (let i = 0; i < k; i++) {
      const t = nbuf[i];
      if (seen.has(t)) continue;
      seen.add(t);
      if (player.isFieldTile(t)) continue;
      if (mg.owner(t) !== player) continue;
      if (!map.isLand(t) || map.isImpassable(t)) continue;
      if (player.density(t) >= full) continue; // first claim holds (city)
      if (mg.plotAt(t) !== undefined) continue; // structures keep their tile
      cand.push([t, mg.fertility(t)]);
    }
  }
  if (cand.length === 0) return;
  // Best fertility first, ties on lowest tile ref (deterministic).
  cand.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const take = Math.min(n, cand.length);
  for (let i = 0; i < take; i++) player.addFieldTile(nucleus, cand[i][0]);
}

/**
 * Pre-grow a farm's field until it feeds `people` (or the frontier runs
 * out) — the spawn kit's starter field (farm-growth spec): without it,
 * spawn capacity is one tile's yield and the population crashes before the
 * field can grow (the same day-one famine the old model patched).
 */
export function preGrowField(
  mg: Game,
  player: Player,
  nucleus: TileRef,
  people: number,
): void {
  const f = mg.config().food();
  if (mg.owner(nucleus) === player && player.fieldTiles(nucleus).size === 0) {
    player.addFieldTile(nucleus, nucleus);
  }
  const needMilli = people * f.idleConsumptionMilli;
  // Grow one tile at a time until the starter field feeds `people` or the
  // frontier runs out. Bounded by a sanity guard (the field is unbounded, but
  // the spawn kit only needs to cover the opening population).
  const guardMax = 4096;
  for (let guard = 0; guard < guardMax; guard++) {
    if (farmProductionOf(mg, player, nucleus) >= needMilli) break;
    const before = player.fieldTiles(nucleus).size;
    growField(mg, player, nucleus, 1);
    if (player.fieldTiles(nucleus).size === before) break; // frontier exhausted
  }
}

/** The live production of the field at `nucleus` (mirror of
 *  FoodEconomy.farmProductionMilli, local to avoid an import cycle). */
function farmProductionOf(mg: Game, player: Player, nucleus: TileRef): number {
  const f = mg.config().food();
  const r = Math.max(0, Math.floor(f.farmRadius));
  const side = 2 * r + 1;
  let fertSum = 0;
  for (const t of player.fieldTiles(nucleus)) fertSum += mg.fertility(t);
  return Math.floor(
    (f.farmOutputMilli * fertSum * f.fertilityBonus) / (255 * side * side),
  );
}

/** Full-field POTENTIAL of a site (milli-food/tick if the whole footprint
 *  were owned, grown, and worked) — the bot-scoring / preview twin of the
 *  live production formula. */
export function farmPotentialMilli(
  mg: Game,
  player: Player,
  tile: TileRef,
): number {
  const f = mg.config().food();
  const r = Math.max(0, Math.floor(f.farmRadius));
  const side = 2 * r + 1;
  const area = side * side;
  const x0 = mg.x(tile);
  const y0 = mg.y(tile);
  let fertSum = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!mg.isValidCoord(x0 + dx, y0 + dy)) continue;
      const t = mg.ref(x0 + dx, y0 + dy);
      if (mg.owner(t) !== player) continue;
      fertSum += mg.fertility(t);
    }
  }
  return Math.floor(
    (f.farmOutputMilli * fertSum * f.fertilityBonus) / (255 * area),
  );
}
