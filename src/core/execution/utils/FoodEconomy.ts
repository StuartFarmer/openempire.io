import { Game, Player, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { farmTick } from "./FarmGrowth";
import { foodShedField } from "./FoodShed";
import {
  probeDistance,
  supplyField,
  supplyQualityFromDistance,
} from "./SupplyField";
import { tenureCurve } from "./TileTenure";

/**
 * The Tribal-age food tick (openspec add-tribal-food-economy, localized by
 * rework-settlement-ecology task 4.2). Runs once per player per tick from
 * PlayerExecution, only on layered maps.
 *
 * FOOD IS LOCAL: each shed cell (the nearest-nucleus Voronoi neighborhood,
 * FoodShed) is a feeding DISTRICT with its own production (its tilled
 * tiles), its own granary (task 4.3: capacity grown from tile tenure —
 * storage is stability made food, replacing Barns), and its own fed-ratio.
 * A shortfall in one district is never silently covered by production in a
 * distant one — a regional famine is regional, and urban recession prefers
 * the starving metro (UrbanGrowth reads fedByFarm).
 *
 * Three cohorts eat each tick:
 *   - DISTRICT civilians: each cell's labor pool, fed from the cell's
 *     production share and granary.
 *   - The CAMP: civilians outside every shed cell, fed from the old global
 *     stock (`_foodMilli`, baseStorage cap) — the spawn stake a young
 *     nation eats while its first field ramps.
 *   - The WAR cohort (deployed attack/boat troops): fed by REQUISITION — a
 *     proportional tax on every district's production, then the camp stock,
 *     then the granaries. Armies eat from everyone; nobody starves quietly
 *     to feed them locally.
 *
 * Units: flows are computed in milli-food (1000 milli = 1 displayed food) as
 * Numbers, applied to per-district Number stocks and the camp bigint stock.
 * Number math is safe: per-tick flows are far below 2^53.
 */
export function foodTick(mg: Game, player: Player): number {
  const f = mg.config().food();
  const supply = supplyField(mg, player);
  const shed = foodShedField(mg, player);
  farmTick(mg, player, shed);

  const impl = player as Player & {
    _foodMilli: bigint;
    _fieldStockMilli: Map<TileRef, number>;
    _birthCredit: number;
    _deathCredit: number;
    _starveCredit: number;
    _warStarveCredit: number;
  };

  // ── District production + granary capacity (tasks 4.2/4.3): every tilled
  // tile's yield lands in its OWN cell, and its tenure grows the cell's
  // storage capacity — an old district holds deep reserves, a fresh
  // conquest holds none. No district bonus, no labor multiplier (§1b).
  const prodByCell = new Map<TileRef, number>();
  const capByCell = new Map<TileRef, number>();
  let fieldProdMilli = 0;
  for (const tile of shed.tilled) {
    const cell = shed.cellOf.get(tile);
    if (cell === undefined) continue; // lost since refresh
    const capMilli =
      f.fieldTileStorageMilli * tenureCurve(mg, mg.tileTenure(tile));
    capByCell.set(cell, (capByCell.get(cell) ?? 0) + capMilli);
    const maturity = player.farmMaturity(tile) / 1000; // AquaCrop canopy
    if (maturity <= 0) continue;
    const soilN = mg.layer("crop", tile) / 255; // FAO fertility ceiling
    const y = maturity * soilN * f.fieldTileYieldMilli;
    prodByCell.set(cell, (prodByCell.get(cell) ?? 0) + y);
    fieldProdMilli += y;
  }
  // Natural land harvest (knob, default 0) is campfire food — aspatial.
  const landMilli = Math.floor(
    Math.pow(player.fertilitySum(), f.landHarvestExponent) * f.landHarvestMilli,
  );
  const productionMilli = Math.floor(fieldProdMilli) + landMilli;

  // ── The WAR cohort: attrition first (unchanged), then its requisition. ──
  let fighting = 0;
  for (const attack of player.outgoingAttacks()) {
    // Supply-line attrition: a front that outruns its granaries LOSES
    // TROOPS — floor(troops × (1 − quality) × warSupplyAttrition) die this
    // tick, before the survivors eat at the base war rate.
    const front = attack.frontTile();
    const frontDist =
      front === null ? Infinity : probeDistance(mg, player, supply, front);
    const quality = supplyQualityFromDistance(frontDist, f);
    const losses = Math.floor(
      attack.troops() * (1 - quality) * f.warSupplyAttrition,
    );
    if (losses > 0) {
      attack.setTroops(attack.troops() - losses);
    }
    fighting += attack.troops();
  }
  let moving = 0;
  for (const boat of player.units(UnitType.TransportShip)) {
    moving += boat.troops();
  }
  const idle = player.troops();
  const warNeedMilli = Math.floor(
    moving * f.moveConsumptionMilli + fighting * f.fightConsumptionMilli,
  );

  // Requisition: a flat tax ratio on every district's production...
  const taxRatio =
    warNeedMilli <= 0
      ? 0
      : Math.min(1, warNeedMilli / Math.max(1, fieldProdMilli));
  let warPaidMilli = Math.min(warNeedMilli, Math.floor(fieldProdMilli));
  // ...then the camp stock...
  let warOwedMilli = warNeedMilli - warPaidMilli;
  if (warOwedMilli > 0) {
    const draw = Number(
      impl._foodMilli < BigInt(warOwedMilli)
        ? impl._foodMilli
        : BigInt(warOwedMilli),
    );
    impl._foodMilli -= BigInt(draw);
    warPaidMilli += draw;
    warOwedMilli -= draw;
  }
  // ...then the granaries, largest first (deterministic order).
  if (warOwedMilli > 0 && impl._fieldStockMilli.size > 0) {
    const cells = Array.from(impl._fieldStockMilli.entries()).sort(
      (a, b) => b[1] - a[1] || a[0] - b[0],
    );
    for (const [cell, stock] of cells) {
      if (warOwedMilli <= 0) break;
      const draw = Math.min(stock, warOwedMilli);
      impl._fieldStockMilli.set(cell, stock - draw);
      warPaidMilli += draw;
      warOwedMilli -= draw;
    }
  }
  const warFed =
    warNeedMilli <= 0
      ? 1
      : Math.max(0, Math.min(1, warPaidMilli / warNeedMilli));

  // ── District civilians: each cell's pool eats its own production share
  // and granary (task 4.2). The allocation slider splits each district's
  // after-tax production between mouths and the granary.
  const share = player.foodPopulationShare();
  let civNeedMilli = 0;
  let civStarveExpected = 0; // Σ pool_c · starveFraction(fed_c)
  const baseDeathFraction = 1 / f.avgLifespanTicks;
  const starveFractionOf = (fed: number): number =>
    Math.min(1, baseDeathFraction * (1 / Math.max(f.minFedForLife, fed) - 1));

  // Aggregate cells into their feeding REGIONS (connected shed components):
  // a metro eats from every farm whose flood reaches it — the Voronoi seam
  // is a labor boundary, not a dinner table. Distant regions (disconnected,
  // or beyond the shed cutoff) share nothing.
  const regions = new Map<
    TileRef,
    { cells: TileRef[]; people: number; prod: number; cap: number }
  >();
  // Scale the refresh-time headcounts to the LIVE idle pool: babies born
  // between shed refreshes live in the districts too, not in the camp.
  const headScale =
    shed.idleAtRefresh > 0 ? idle / shed.idleAtRefresh : idle > 0 ? 1 : 0;
  let pooledCivilians = 0;
  let rawPooled = 0;
  for (const [cell, poolAtRefresh] of shed.peopleByFarm) {
    rawPooled += poolAtRefresh;
    const pool = Math.floor(poolAtRefresh * headScale);
    pooledCivilians += pool;
    const root = shed.regionOf.get(cell) ?? cell;
    let r = regions.get(root);
    if (r === undefined) {
      r = { cells: [], people: 0, prod: 0, cap: 0 };
      regions.set(root, r);
    }
    r.cells.push(cell);
    r.people += pool;
    r.prod += prodByCell.get(cell) ?? 0;
    r.cap += capByCell.get(cell) ?? 0;
  }
  // Only people who were genuinely beyond every shed at refresh belong to
  // the camp; per-cell flooring dust joins the first district instead of
  // starving against zero production.
  const campAtRefresh = Math.max(0, shed.idleAtRefresh - rawPooled);
  const campTarget = Math.min(idle, Math.floor(campAtRefresh * headScale));
  const dust = Math.max(0, idle - pooledCivilians - campTarget);
  if (dust > 0 && regions.size > 0) {
    const first = regions.values().next().value!;
    first.people += dust;
    pooledCivilians += dust;
  }

  for (const [, r] of regions) {
    const needMilli = r.people * f.idleConsumptionMilli;
    civNeedMilli += needMilli;
    const avail = r.prod * (1 - taxRatio);
    let popMilli = Math.floor(avail * share);
    const bankMilli = avail - popMilli;
    // The region's granary = its member cells' stocks (tenure-capped).
    let stock = 0;
    for (const cell of r.cells) stock += impl._fieldStockMilli.get(cell) ?? 0;
    // Bank; overflow past the grown capacity feeds mouths instead.
    stock += bankMilli;
    if (stock > r.cap) {
      popMilli += stock - r.cap;
      stock = r.cap;
    }
    // Feed; the granary buffers any shortfall, then the CAMP stock — the
    // national spawn stake is the last resort for every district (a young
    // nation eats it while its first field ramps; without this reach a
    // weak-soil spawn starves beside a full pantry).
    let deficit = 0;
    const net = popMilli - needMilli;
    if (net < 0) {
      const draw = Math.min(stock, -net);
      stock -= draw;
      deficit = -net - draw;
      if (deficit > 0) {
        const campDraw = Number(
          impl._foodMilli < BigInt(Math.floor(deficit))
            ? impl._foodMilli
            : BigInt(Math.floor(deficit)),
        );
        impl._foodMilli -= BigInt(campDraw);
        deficit -= campDraw;
      }
    }
    // Grain rots locally too.
    stock -= (stock * f.decayNumer) / f.decayDenom;
    // Write the region's stock back into member granaries, filling each
    // cell to its own tenure-grown cap in deterministic (tile) order.
    r.cells.sort((a, b) => a - b);
    for (const cell of r.cells) {
      const cellCap = capByCell.get(cell) ?? 0;
      const put = Math.min(stock, cellCap);
      impl._fieldStockMilli.set(cell, put);
      stock -= put;
    }

    const fed = needMilli <= 0 ? 1 : Math.max(0, 1 - deficit / needMilli);
    for (const cell of r.cells) shed.fedByFarm.set(cell, fed);
    civStarveExpected += r.people * starveFractionOf(fed);
  }
  // Granaries whose nucleus died since refresh: sweep stale entries.
  for (const cell of Array.from(impl._fieldStockMilli.keys())) {
    if (!shed.peopleByFarm.has(cell) && !shed.cellOf.has(cell)) {
      impl._fieldStockMilli.delete(cell);
    }
  }

  // ── The CAMP: civilians outside every shed cell eat the old global stock
  // — the spawn stake, and the fate of a city with no field in reach.
  const campPool = Math.max(0, idle - pooledCivilians);
  const campNeedMilli = campPool * f.idleConsumptionMilli;
  civNeedMilli += campNeedMilli;
  {
    let popMilli = Math.floor(landMilli * share);
    let stock = impl._foodMilli + BigInt(landMilli - popMilli);
    const capMilli = BigInt(f.baseStorage) * 1000n;
    if (stock > capMilli) {
      popMilli += Number(stock - capMilli);
      stock = capMilli;
    }
    let deficit = 0;
    const net = popMilli - campNeedMilli;
    if (net < 0) {
      const need = BigInt(-net);
      const draw = stock < need ? stock : need;
      stock -= draw;
      deficit = Number(need - draw);
    }
    stock -= (stock * BigInt(f.decayNumer)) / BigInt(f.decayDenom);
    impl._foodMilli = stock;
    const fed =
      campNeedMilli <= 0 ? 1 : Math.max(0, 1 - deficit / campNeedMilli);
    civStarveExpected += campPool * starveFractionOf(fed);
  }

  // ── Demographics (add-urban-core-growth): births and old age stay
  // nation-wide; STARVATION is the sum of each district's own famine. ─────
  const pop = idle + fighting + moving;
  const totalNeedMilli = Math.max(1, civNeedMilli + warNeedMilli);
  const capacity = Math.floor(productionMilli / f.idleConsumptionMilli);
  const surplusRatio = productionMilli / totalNeedMilli;

  // Old-age deaths take the CIVILIAN population (the idle pool). Deployed
  // soldiers are a transient consumed by war and famine, not by aging at the
  // front — a 10-second life must not evaporate an army in the field.
  impl._deathCredit += idle * baseDeathFraction;
  const oldAge = Math.min(idle, Math.floor(impl._deathCredit));
  impl._deathCredit -= oldAge;

  // Civilian starvation: accumulated per district above.
  impl._starveCredit += civStarveExpected;
  const civStarved = Math.min(idle, Math.floor(impl._starveCredit));
  impl._starveCredit -= civStarved;

  // War starvation: the requisition shortfall thins the deployed cohort.
  impl._warStarveCredit += (fighting + moving) * starveFractionOf(warFed);
  const warStarved = Math.min(
    fighting + moving,
    Math.floor(impl._warStarveCredit),
  );
  impl._warStarveCredit -= warStarved;

  // Births: base rate, scaled by food surplus, capped by the food-supported
  // population so growth approaches the ceiling and holds.
  const birthFactor = Math.max(0, Math.min(f.birthSurplusCap, surplusRatio));
  impl._birthCredit += pop * f.baseBirthRate * birthFactor;
  let births = Math.floor(impl._birthCredit);
  impl._birthCredit -= births;
  const headroom = Math.max(0, capacity - pop);
  if (births > headroom) {
    births = headroom;
    impl._birthCredit = 0; // the food ceiling, not banked credit, caps growth
  }

  // Apply: old age and district famine to the idle pool; war famine across
  // the deployed cohort proportionally; births to the idle pool.
  if (oldAge > 0) player.removeTroops(oldAge);
  if (civStarved > 0) player.removeTroops(civStarved);
  if (warStarved > 0 && fighting + moving > 0) {
    for (const attack of player.outgoingAttacks()) {
      const cut = Math.round(
        (warStarved * attack.troops()) / (fighting + moving),
      );
      attack.setTroops(Math.max(0, attack.troops() - cut));
    }
    for (const boat of player.units(UnitType.TransportShip)) {
      const cut = Math.round(
        (warStarved * boat.troops()) / (fighting + moving),
      );
      boat.setTroops(Math.max(0, boat.troops() - cut));
    }
  }
  if (births > 0) player.addTroops(births);

  // Living population after this tick's demographics.
  const newPop =
    player.troops() +
    player.outgoingAttacks().reduce((a, at) => a + at.troops(), 0) +
    player.units(UnitType.TransportShip).reduce((a, b) => a + b.troops(), 0);

  // Expose the breakdown (display units) for the client/stats.
  const flow = (
    player as Player & {
      _foodFlow: {
        production: number;
        consumption: number;
        starvedTroops: number;
        capacity: number;
        population: number;
      };
    }
  )._foodFlow;
  flow.production = Math.floor(productionMilli / 1000);
  flow.consumption = Math.floor((civNeedMilli + warNeedMilli) / 1000);
  flow.starvedTroops = civStarved + warStarved;
  flow.capacity = capacity;
  flow.population = newPop;

  // The nation dies out when its entire population is gone — even if it still
  // holds land. Its territory reverts to neutral (add-urban-core-growth).
  if (newPop <= 0 && player.hasSpawned() && player.isAlive()) {
    for (const t of Array.from(player.tiles())) player.relinquish(t);
  }

  return surplusRatio;
}
