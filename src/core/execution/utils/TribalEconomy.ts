import { Game, Player, TribalStructures, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { ConstructionExecution } from "../ConstructionExecution";
import { farmSiteScoreMilli } from "./EconomyModel";

/** Sampling attempts per candidate pool — bounds per-pulse cost. */
const SAMPLE_ATTEMPTS = 40;

/**
 * The shared AI economy (simplify-food-economy, economy-planner spec): two
 * rules, driven by nations (big per-pulse budget) and tribe bots (small).
 *
 *   1. Housing-bound and a Settlement is affordable → buy one near the
 *      population (sampled around the nuclei), raising the ceiling.
 *   2. A Farmland is affordable → buy one on the best-scoring legal
 *      footprint (score = the sim's own production formula), respecting
 *      the spacing rule via canBuild.
 *
 * One purchase per pulse: ConstructionExecution re-checks canBuild at
 * dispatch, and a single buy per pulse keeps the food ledger honest
 * without a commitment ledger.
 */
export class TribalEconomy {
  constructor(
    private random: PseudoRandom,
    private game: Game,
    private player: Player,
  ) {}

  /** Place up to `budget` structures this pulse; returns the number placed. */
  tryBuild(budget: number): number {
    let placed = 0;
    for (let i = 0; i < budget; i++) {
      if (!this.tryBuildOne()) break;
      placed++;
    }
    return placed;
  }

  private tryBuildOne(): boolean {
    // Population grows toward min(foodCapacity, housing) — so place the
    // banked seed that unbinds the BINDING ceiling: the Settlement seed
    // when housing is the smaller (a new nucleus grows more city), the
    // Farmland seed when food capacity is. Seeds are never hoarded — fall
    // back to the other type when the preferred one is unavailable
    // (economy-planner spec, restore-organic-growth).
    const housing = this.game.config().maxTroops(this.player);
    const capacity = this.player.foodFlow().capacity;
    const order: UnitType[] =
      housing <= capacity
        ? [UnitType.Settlement, UnitType.Farmland]
        : [UnitType.Farmland, UnitType.Settlement];
    for (const type of order) {
      const anchors =
        type === UnitType.Settlement
          ? this.settlementAnchors()
          : this.farmAnchors();
      const site = this.bestSite(type, anchors);
      if (site !== null) {
        this.game.addExecution(
          new ConstructionExecution(this.player, type, site),
        );
        return true;
      }
    }
    return false;
  }

  /** Sample buildable tiles around the anchors; return the best by the
   *  type's own plane — full-field potential for farms, city suitability
   *  for settlements (top-k precision is the difficulty lever). */
  private bestSite(type: UnitType, anchors: TileRef[]): TileRef | null {
    if (anchors.length === 0) return null;
    const candidates: { tile: TileRef; score: number }[] = [];
    const seen = new Set<TileRef>();
    for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt++) {
      const around = this.random.randElement(anchors);
      const t = this.sampleAround(around, 6);
      if (t === null || seen.has(t)) continue;
      seen.add(t);
      if (this.player.canBuild(type, t) === false) continue;
      const score =
        type === UnitType.Settlement
          ? this.game.suitability(t)
          : farmSiteScoreMilli(this.game, this.player, t);
      if (score > 0) candidates.push({ tile: t, score });
    }
    if (candidates.length === 0) return null;
    const topK = this.game
      .config()
      .aiDifficulty(this.player.type()).precisionTopK;
    candidates.sort((a, b) => b.score - a.score || a.tile - b.tile);
    const pool = candidates.slice(0, Math.max(1, topK));
    return pool[this.random.nextInt(0, pool.length)].tile;
  }

  /** Farm anchors: the border (new land) and existing farms (fill gaps). */
  private farmAnchors(): TileRef[] {
    const anchors = Array.from(this.player.borderTiles());
    for (const farm of this.player.units(UnitType.Farmland)) {
      anchors.push(farm.tile());
    }
    return anchors;
  }

  /** Settlement anchors: the nuclei — a town belongs by its people. */
  private settlementAnchors(): TileRef[] {
    const anchors: TileRef[] = [];
    const core = this.player.core();
    if (core !== null) anchors.push(core);
    for (const s of this.player.units(UnitType.Settlement)) {
      anchors.push(s.tile());
    }
    if (anchors.length === 0) {
      anchors.push(...Array.from(this.player.borderTiles()));
    }
    return anchors;
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
