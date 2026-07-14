import { Game, Player, TribalStructures, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { ConstructionExecution } from "../ConstructionExecution";
import {
  assessUrbanRoom,
  BARN_INSURANCE_SCORE,
  farmScore,
  neighborPlotCount,
  settlementScore,
  wantsBarnInsurance,
} from "./EconomyModel";
import { supplyField } from "./SupplyField";

/** Sampling attempts per candidate pool — bounds per-pulse cost, as before. */
const SAMPLE_ATTEMPTS = 40;

/**
 * The shared AI economy for tribal plots (add-greedy-economy-planner): one
 * brain driven by nations (big per-pulse budget) and plain tribe bots (small).
 *
 * The policy is a greedy marginal-utility planner: every pulse it samples
 * candidate actions (Farmland sites, Settlement sites, a Barn), scores each
 * with EconomyModel — pure math derived from the live Config.food() knobs and
 * the map layers, in one currency of population-ticks — and executes the
 * single best strictly-positive affordable action. No fixed quotas or floors:
 * when no action can repay its cost, the pulse banks instead. Re-tuning a
 * food knob re-tunes this policy with no code changes.
 */
export class TribalEconomy {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
  ) {}

  /** Place up to `budget` plots this pulse; returns the number placed. */
  tryBuild(budget: number): number {
    let placed = 0;
    for (let i = 0; i < budget; i++) {
      if (!this.tryBuildOne()) break;
      placed++;
    }
    return placed;
  }

  private tryBuildOne(): boolean {
    const config = this.game.config();
    const player = this.player;
    const food = Number(player.food());
    const cost = (type: UnitType) =>
      Number(config.unitInfo(type).cost(this.game, player));

    const candidates: { score: number; type: UnitType; tile: TileRef }[] = [];
    const consider = (score: number, type: UnitType, tile: TileRef): void => {
      if (score > 0) candidates.push({ score, type, tile });
    };

    // ── Farmland: people fed by the tile's steady yield over the horizon ──
    const farmCost = cost(UnitType.Farmland);
    if (food >= farmCost) {
      for (const t of this.sampleSites(UnitType.Farmland)) {
        consider(
          farmScore(this.game, player, t, farmCost * 1000),
          UnitType.Farmland,
          t,
        );
      }
    }

    // ── Settlement: only when the food-supported city has outgrown the
    // placeable room inside the supply field (the derived founding trigger).
    const settlementCost = cost(UnitType.Settlement);
    const supply = supplyField(this.game, player);
    const room = assessUrbanRoom(this.game, player, supply);
    if (food >= settlementCost && room.deficit > 0) {
      for (const t of this.sampleSettlementSites(supply)) {
        consider(
          settlementScore(
            this.game,
            player,
            supply,
            t,
            room.deficit,
            settlementCost * 1000,
          ),
          UnitType.Settlement,
          t,
        );
      }
    }

    // ── Barn: insurance — wanted when storage is under one generation of
    // consumption and the banked share is accruing. Its sentinel score is
    // below any positive growth score, so the argmax never picks it over
    // growth; it only wins when nothing else can repay its cost.
    const barnCost = cost(UnitType.Barn);
    if (food >= barnCost && wantsBarnInsurance(this.game, player)) {
      const t = this.bestBarnSite();
      if (t !== null) consider(BARN_INSURANCE_SCORE, UnitType.Barn, t);
    }

    if (candidates.length === 0) return false;
    // Precision is a difficulty lever (unify-layered-path): the AI picks
    // uniformly (seeded PRNG — deterministic) among the top-k candidates
    // instead of always the argmax. k = 1 on the highest difficulty.
    const topK = config.aiDifficulty(player.type()).precisionTopK;
    candidates.sort((a, b) => b.score - a.score);
    const pool = candidates.slice(0, Math.max(1, topK));
    const best = pool[this.random.nextInt(0, pool.length)];
    this.game.addExecution(
      new ConstructionExecution(player, best.type, best.tile),
    );
    return true;
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
      const spread = nearPlot ? 4 : 6;
      const t = this.sampleAround(around, spread);
      if (t === null) continue;
      if (player.canBuild(type, t) === false) continue;
      sites.add(t);
    }
    return Array.from(sites);
  }

  /**
   * Settlement candidates go where the room is: anchored on own farms OUTSIDE
   * the current supply field (a farm belt no nucleus serves yet), falling back
   * to the border when every farm is already covered.
   */
  private sampleSettlementSites(
    supply: ReturnType<typeof supplyField>,
  ): TileRef[] {
    const player = this.player;
    const uncovered = player
      .units(UnitType.Farmland)
      .map((u) => u.tile())
      .filter((t) => !supply.dist.has(t));
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

  /** Best Barn site by district adjacency (storage capacity multiplier). */
  private bestBarnSite(): TileRef | null {
    let best: TileRef | null = null;
    let bestAdjacency = -1;
    for (const t of this.sampleSites(UnitType.Barn)) {
      const adj = neighborPlotCount(this.game, this.player, t, UnitType.Barn);
      if (adj > bestAdjacency) {
        bestAdjacency = adj;
        best = t;
      }
    }
    return best;
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
