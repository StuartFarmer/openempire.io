import { Game, Player, TribalStructures, UnitType } from "../../game/Game";
import { TileRef } from "../../game/GameMap";
import { PseudoRandom } from "../../PseudoRandom";
import { ConstructionExecution } from "../ConstructionExecution";

/** Minimum crop score (fertility × adjacency) worth farming. */
const MIN_FARM_CROP = 30;
/** Farm until production covers this multiple of what the population CAP eats. */
const FARM_TARGET_FACTOR = 1.2;
/** Barn when the stock reaches this fraction of the storage ceiling. */
const BARN_AT_STOCK_FRACTION = 0.85;

/**
 * The shared AI economy for tribal plots (add-economy-insights): one brain
 * driven by nations (big per-pulse budget) and plain tribe bots (small).
 * Policy is MAXIMIZING, not subsistence: farm toward feeding the population
 * cap, settle ahead of demand, barn when the granary tops out.
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
    const f = config.food();
    const player = this.player;
    const food = Number(player.food());
    const cost = (type: UnitType) =>
      Number(config.unitInfo(type).cost(this.game, player));
    const cap = config.maxTroops(player);

    // The city sprawls itself from the founded Core (add-urban-core-growth);
    // bots no longer build Settlements. They feed the sprawl with Farmland
    // and bank its surplus with Barns.

    // 1. Feed the cap, not just the current mouths: farm while production
    // trails what a full population (set by the sprawl) would eat.
    const productionMilli = player.foodFlow().production * 1000;
    const capConsumptionMilli = cap * f.idleConsumptionMilli;
    if (
      productionMilli < capConsumptionMilli * FARM_TARGET_FACTOR &&
      food >= cost(UnitType.Farmland) &&
      this.placePlot(UnitType.Farmland, true)
    ) {
      return true;
    }

    // 2. Bank the surplus when the granary tops out — bounded by farm count
    // so a saturated economy doesn't barn-spam forever.
    const barnLevels = this.levels(UnitType.Barn);
    const farmLevels = this.levels(UnitType.Farmland);
    const storageCap = f.baseStorage + barnLevels * f.storagePerBarn;
    if (
      food >= BARN_AT_STOCK_FRACTION * storageCap &&
      food >= cost(UnitType.Barn) &&
      barnLevels < farmLevels / 4 + 1 &&
      this.placePlot(UnitType.Barn, false)
    ) {
      return true;
    }

    return false;
  }

  private levels(type: UnitType): number {
    return this.player
      .units(type)
      .filter((u) => !u.isUnderConstruction())
      .reduce((sum, u) => sum + u.level(), 0);
  }

  /**
   * Sample candidate tiles near the border and around existing same-type
   * plots; score by fertility (farms) × district adjacency so districts
   * grow contiguously. Farms below MIN_FARM_CROP are not worth the food.
   */
  private placePlot(type: UnitType, maximizeCrop: boolean): boolean {
    const game = this.game;
    const player = this.player;
    const border = player.borderTiles();
    if (border.size === 0) return false;
    const anchors = Array.from(border);
    const ownPlots = player.units(type);
    const bonus = game.config().food().adjacencyBonus;

    const adjacency = (t: TileRef): number => {
      let count = 0;
      const x = game.x(t);
      const y = game.y(t);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        if (!game.isValidCoord(x + dx, y + dy)) continue;
        const p = game.plotAt(game.ref(x + dx, y + dy));
        if (p !== undefined && p.type() === type && p.owner() === player) {
          count++;
        }
      }
      return count;
    };

    let best: TileRef | null = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      // Half the samples hug existing plots (district growth), half explore.
      const nearPlot = ownPlots.length > 0 && attempt % 2 === 0;
      const around = nearPlot
        ? this.random.randElement(ownPlots).tile()
        : this.random.randElement(anchors);
      const spread = nearPlot ? 4 : 6;
      const x = this.random.nextInt(
        game.x(around) - spread,
        game.x(around) + spread + 1,
      );
      const y = this.random.nextInt(
        game.y(around) - spread,
        game.y(around) + spread + 1,
      );
      if (!game.isValidCoord(x, y)) continue;
      const t = game.ref(x, y);
      if (game.owner(t) !== player) continue;
      if (player.canBuild(type, t) === false) continue;
      const fertility = maximizeCrop ? game.layer("crop", t) : 100;
      const score = fertility * (1 + adjacency(t) * bonus);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    // Farms on near-barren soil are wasted food — leave the budget for
    // settlements/barns instead of farm-spamming wasteland.
    if (maximizeCrop && bestScore < MIN_FARM_CROP) return false;
    if (best === null) return false;
    this.game.addExecution(new ConstructionExecution(player, type, best));
    return true;
  }
}

/** True when this player should run the tribal economy at all. */
export function tribalEconomyActive(game: Game, player: Player): boolean {
  return (
    game.hasLayers() &&
    player.isAlive() &&
    TribalStructures.types.every((t) => !game.config().isUnitDisabled(t))
  );
}
