import { Game, Player, UnitType } from "../../../../core/game/Game";

/**
 * The uploads the GPU economy fields read: one per-tile plane each for the
 * flood gate, the food-shed seeds, and the military-supply seeds.
 *
 * This is the single definition of those predicates, shared by everything that
 * feeds the floods (the in-worker probe, the reference dumper). They mirror the
 * CPU implementations exactly:
 *   - `owner`  — FoodShed/SupplyField's step predicate ("owned by THIS player,
 *     land, passable"), generalised to "owned by someone" so one dispatch can
 *     flood every nation inside its own borders. 0 = not floodable.
 *   - `farmMaturity` — FoodShed.recompute's seeding loop: completed Farmland
 *     standing on its owner's ground, maturity in 0..1, max when two farms
 *     share a tile. 0 = not a farm.
 *   - `supplyNode` — SupplyField.recompute's `addSource`: the Core plus every
 *     completed Settlement on its owner's ground.
 */
export interface EconomyFieldInputs {
  owner: Uint32Array;
  farmMaturity: Float32Array;
  supplyNode: Uint32Array;
}

export function buildEconomyInputs(
  game: Game,
  players: readonly Player[],
): EconomyFieldInputs {
  const map = game.map();
  const n = game.width() * game.height();
  const owner = new Uint32Array(n);
  const farmMaturity = new Float32Array(n);
  const supplyNode = new Uint32Array(n);

  for (let t = 0; t < n; t++) {
    const o = map.ownerID(t);
    if (o === 0) continue;
    if (!map.isLand(t) || map.isImpassable(t)) continue;
    owner[t] = o;
  }

  for (const p of players) {
    if (!p.isAlive()) continue;
    const smallID = p.smallID();
    for (const farm of p.units(UnitType.Farmland)) {
      if (farm.isUnderConstruction()) continue;
      const t = Number(farm.tile());
      if (map.ownerID(t) !== smallID) continue;
      const m = p.farmMaturity(t) / 1000;
      if (m > farmMaturity[t]) farmMaturity[t] = m;
    }
    const core = p.core();
    if (core !== null && map.ownerID(core) === smallID) {
      supplyNode[Number(core)] = 1;
    }
    for (const node of p.units(UnitType.Settlement)) {
      if (node.isUnderConstruction()) continue;
      const t = Number(node.tile());
      if (map.ownerID(t) !== smallID) continue;
      supplyNode[t] = 1;
    }
  }

  return { owner, farmMaturity, supplyNode };
}
