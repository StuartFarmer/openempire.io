import { Game, Player, TribalStructures, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { ConstructionExecution } from "../ConstructionExecution";
import {
  assessUrbanRoom,
  committedStaffing,
  effectiveResidents,
  farmDistrictScore,
  farmLaborRelief,
  hostileBorderDiscount,
  settlementScore,
} from "./EconomyModel";
import { foodShedField } from "./FoodShed";
import { supplyField } from "./SupplyField";

/** Sampling attempts per candidate pool — bounds per-pulse cost, as before. */
const SAMPLE_ATTEMPTS = 40;
/** Joint district candidates per pulse — each costs a partner search. */
const PAIR_ANCHOR_LIMIT = 10;
/** PRNG draws in the standoff annulus when siting a pair's farm. */
const PAIR_PARTNER_ATTEMPTS = 6;
/** The pair's farm stands off its town like the spawn kit's collar (~3
 *  tiles of wild land for the young city to grow into — first claim holds
 *  between the automata). */
const PAIR_STANDOFF_MIN = 2;
const PAIR_STANDOFF_MAX = 4;

/** One placement action: a pair candidate carries two builds. */
interface Candidate {
  score: number;
  builds: { type: UnitType; tile: TileRef }[];
}

/**
 * The shared AI economy for tribal plots (add-greedy-economy-planner,
 * reworked by rework-settlement-ecology §7): one brain driven by nations
 * (big per-pulse budget) and plain tribe bots (small).
 *
 * Under the seed regime plots are AWARDED as founding pairs (SeedAwards)
 * and the planner's whole job is siting. Every candidate prices in one
 * currency — population-ticks over the derived horizon — so the argmax is
 * meaningful across types:
 *
 *   - a lone farm seed is worth the FIELD its nucleus grows, capped by the
 *     labor already in reach (farmDistrictScore — a frontier nucleus no
 *     town can staff prices near zero);
 *   - a lone settlement seed is worth the urban room it relieves (D3) plus
 *     the labor-capped fields it staffs (farmLaborRelief);
 *   - a banked PAIR is worth town + field founded together (D-DP2): the
 *     town is the field's labor stake, the field is the town's food. Pairs
 *     place under seed pressure — no waiting for room starvation — but
 *     must beat their own lone-farm shadow, so a town that contributes
 *     nothing keeps its seed banked.
 *
 * Seeds are capital: every score carries the hostile-border discount
 * (D-DP4). Re-tuning a food knob re-tunes this policy with no code changes.
 */
export class TribalEconomy {
  /** Per-pulse staffing already committed to existing fields (task 10). */
  private committedPool: ReadonlyMap<TileRef, number> = new Map();

  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
  ) {}

  /** Place up to `budget` plots this pulse; returns the number placed. */
  tryBuild(budget: number): number {
    let placed = 0;
    // Seeds a queued ConstructionExecution will spend NEXT tick — counted
    // against the bank so the budget loop can't overdraw it (a dispatched
    // pair holds both its seeds for the rest of the pulse).
    const committed = { farm: 0, settlement: 0 };
    for (let i = 0; i < budget; i++) {
      if (!this.tryBuildOne(committed)) break;
      placed++;
    }
    return placed;
  }

  private tryBuildOne(committed: {
    farm: number;
    settlement: number;
  }): boolean {
    const game = this.game;
    const config = game.config();
    const player = this.player;
    const f = config.food();
    const simple = config.simplePlotEconomy() !== null;

    // Simple plots are bought with food.  Rich games keep the seed bank as
    // the placement gate, so this shared planner needs no second build path.
    const farmSeed = simple || player.farmSeeds() - committed.farm > 0;
    const settlementSeed =
      simple || player.settlementSeeds() - committed.settlement > 0;
    if (!farmSeed && !settlementSeed) return false;

    const candidates: Candidate[] = [];
    const shed = foodShedField(game, player);
    // Staffing already spoken for by existing fields (task 10): subtracted
    // from every candidate's resident count so the planner never counts one
    // pool twice — a "new district" one cell over would just split the old
    // one's people.
    this.committedPool = committedStaffing(game, player, shed);

    // ── Lone farm seed: the field the nucleus grows with the labor
    // actually FREE in reach, discounted near rival borders.
    if (farmSeed) {
      for (const t of this.sampleSites(UnitType.Farmland)) {
        if (player.canBuild(UnitType.Farmland, t) === false) continue;
        const score =
          farmDistrictScore(
            game,
            player,
            t,
            effectiveResidents(game, player, t, this.committedPool),
          ) * hostileBorderDiscount(game, player, t);
        if (score > 0) {
          candidates.push({
            score,
            builds: [{ type: UnitType.Farmland, tile: t }],
          });
        }
      }
    }

    // ── Settlement seed: room relief (D3) + labor relief (D-DP3) — and,
    // with a farm seed banked too, the founding PAIR (D-DP2).
    if (settlementSeed) {
      // Labor relief precomputed once per pulse, per nucleus: the marginal
      // field a town's worth of people unlocks at a labor-capped farm.
      const relief = new Map<TileRef, number>();
      for (const farm of player.units(UnitType.Farmland)) {
        if (farm.isUnderConstruction()) continue;
        const r = farmLaborRelief(game, player, shed, farm.tile());
        if (r > 0) relief.set(farm.tile(), r);
      }
      const reliefAt = (site: TileRef): number => {
        let sum = 0;
        for (const [farmTile, r] of relief) {
          const d = Math.max(
            Math.abs(game.x(site) - game.x(farmTile)),
            Math.abs(game.y(site) - game.y(farmTile)),
          );
          if (d <= f.foodShedRadius) sum += r;
        }
        return sum;
      };

      const supply = supplyField(game, player);
      const room = assessUrbanRoom(game, player, supply);
      let pairAnchors = 0;
      for (const s of this.sampleSettlementSites(supply, relief)) {
        if (player.canBuild(UnitType.Settlement, s) === false) continue;
        const disc = hostileBorderDiscount(game, player, s);
        const townValue =
          (room.deficit > 0
            ? settlementScore(game, player, supply, s, room.deficit, 0)
            : 0) + reliefAt(s);
        if (townValue * disc > 0) {
          candidates.push({
            score: townValue * disc,
            builds: [{ type: UnitType.Settlement, tile: s }],
          });
        }

        if (farmSeed && pairAnchors < PAIR_ANCHOR_LIMIT) {
          pairAnchors++;
          const partner = this.bestPairFarm(s);
          if (partner !== null) {
            // The pair must beat its own lone-farm shadow: the town has to
            // contribute (new room, labor relief, or staffing the field
            // itself) or the settlement seed stays banked.
            const gain = townValue + (partner.paired - partner.lone);
            const score =
              (townValue + partner.paired) * Math.min(disc, partner.disc);
            if (gain > 0 && score > 0) {
              candidates.push({
                score,
                builds: [
                  { type: UnitType.Settlement, tile: s },
                  { type: UnitType.Farmland, tile: partner.tile },
                ],
              });
            }
          }
        }
      }
    }

    if (candidates.length === 0) return false;
    // Precision is a difficulty lever (unify-layered-path): the AI picks
    // uniformly (seeded PRNG — deterministic) among the top-k candidates
    // instead of always the argmax. k = 1 on the highest difficulty.
    const topK = config.aiDifficulty(player.type()).precisionTopK;
    candidates.sort((a, b) => b.score - a.score);
    const pool = candidates.slice(0, Math.max(1, topK));
    const best = pool[this.random.nextInt(0, pool.length)];
    for (const b of best.builds) {
      game.addExecution(new ConstructionExecution(player, b.type, b.tile));
      if (b.type === UnitType.Farmland) committed.farm++;
      else committed.settlement++;
    }
    return true;
  }

  /**
   * The best farm partner for a settlement at `s` (D-DP2): PRNG draws in
   * the standoff annulus, scored at PAIRED labor (`residents +
   * popPerDensity` — the town the seed founds is the labor stake; one full
   * city tile staffs a whole scout-window field at default knobs). `lone`
   * is the same site priced without the town, for the pair-gain test.
   */
  private bestPairFarm(
    s: TileRef,
  ): { tile: TileRef; lone: number; paired: number; disc: number } | null {
    const game = this.game;
    const player = this.player;
    const f = game.config().food();
    let best: {
      tile: TileRef;
      lone: number;
      paired: number;
      disc: number;
    } | null = null;
    for (let attempt = 0; attempt < PAIR_PARTNER_ATTEMPTS; attempt++) {
      const dx = this.random.nextInt(-PAIR_STANDOFF_MAX, PAIR_STANDOFF_MAX + 1);
      const dy = this.random.nextInt(-PAIR_STANDOFF_MAX, PAIR_STANDOFF_MAX + 1);
      if (Math.max(Math.abs(dx), Math.abs(dy)) < PAIR_STANDOFF_MIN) continue;
      const x = game.x(s) + dx;
      const y = game.y(s) + dy;
      if (!game.isValidCoord(x, y)) continue;
      const t = game.ref(x, y);
      if (game.owner(t) !== player) continue;
      if (t === s || player.canBuild(UnitType.Farmland, t) === false) continue;
      const residents = effectiveResidents(game, player, t, this.committedPool);
      const paired = farmDistrictScore(
        game,
        player,
        t,
        residents + f.popPerDensity,
      );
      if (paired <= 0) continue;
      if (best === null || paired > best.paired) {
        best = {
          tile: t,
          lone: farmDistrictScore(game, player, t, residents),
          paired,
          disc: hostileBorderDiscount(game, player, t),
        };
      }
    }
    return best;
  }

  /**
   * Sample buildable candidate tiles for a plot type: half the attempts hug
   * existing same-type plots (district growth), half explore from the border.
   * Same seeded-PRNG anchors as always — scoring, not sampling, changed.
   */
  private sampleSites(type: UnitType): TileRef[] {
    const player = this.player;
    const border = player.borderTiles();
    if (border.size === 0) return [];
    const anchors = Array.from(border);
    const ownPlots = player.units(type);

    const sites = new Set<TileRef>();
    for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt++) {
      const nearPlot = ownPlots.length > 0 && attempt % 2 === 0;
      const around = nearPlot
        ? this.random.randElement(ownPlots).tile()
        : this.random.randElement(anchors);
      // Nuclei want SPACING, not adjacency — fields grow (§1b), and the
      // room score already discounts ground an existing field claimed.
      const spread = nearPlot ? 7 : 6;
      const t = this.sampleAround(around, spread);
      if (t === null) continue;
      if (player.canBuild(type, t) === false) continue;
      sites.add(t);
    }
    return Array.from(sites);
  }

  /**
   * Settlement candidates go where the town can matter: anchored on own
   * farms OUTSIDE the current supply field (a farm belt no nucleus serves
   * yet), on labor-capped farms whose fields want staffing (the relief
   * map), and on the border (new districts grow toward the frontier).
   */
  private sampleSettlementSites(
    supply: ReturnType<typeof supplyField>,
    relief: ReadonlyMap<TileRef, number>,
  ): TileRef[] {
    const player = this.player;
    const uncovered = player
      .units(UnitType.Farmland)
      .map((u) => u.tile())
      .filter((t) => !supply.dist.has(t) || relief.has(t));
    const border = Array.from(player.borderTiles());
    if (uncovered.length === 0 && border.length === 0) return [];

    const sites = new Set<TileRef>();
    for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt++) {
      const anchorUncovered = uncovered.length > 0 && attempt % 2 === 0;
      const around = anchorUncovered
        ? this.random.randElement(uncovered)
        : border.length > 0
          ? this.random.randElement(border)
          : this.random.randElement(uncovered);
      const t = this.sampleAround(around, 4);
      if (t === null) continue;
      if (player.canBuild(UnitType.Settlement, t) === false) continue;
      sites.add(t);
    }
    return Array.from(sites);
  }

  /** One PRNG draw of an owned tile within `spread` of `around`, else null. */
  private sampleAround(around: TileRef, spread: number): TileRef | null {
    const game = this.game;
    const x = this.random.nextInt(
      game.x(around) - spread,
      game.x(around) + spread + 1,
    );
    const y = this.random.nextInt(
      game.y(around) - spread,
      game.y(around) + spread + 1,
    );
    if (!game.isValidCoord(x, y)) return null;
    const t = game.ref(x, y);
    if (game.owner(t) !== this.player) return null;
    return t;
  }
}

/** True when this player should run the tribal economy at all. */
export function tribalEconomyActive(game: Game, player: Player): boolean {
  return (
    player.isAlive() &&
    TribalStructures.types.every((t) => !game.config().isUnitDisabled(t))
  );
}
