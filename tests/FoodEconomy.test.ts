import { beforeEach, describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { NationStructureBehavior } from "../src/core/execution/nation/NationStructureBehavior";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";

/**
 * PlayerExecution (which runs the food tick) is normally added by
 * SpawnExecution; test players that conquer() directly need it added by
 * hand. One tick initializes the executions without running a food tick.
 */
function activate(game: Game, ...players: Player[]): void {
  for (const p of players) {
    game.addExecution(new PlayerExecution(p));
  }
  game.executeNextTick();
}

const CROP = 200;
// Every layer plane gets a flat value; only crop matters for the food loop.
const flatLayers = () => CROP;

const humanInfo = new PlayerInfo("eater", PlayerType.Human, null, "eater_id");
const rivalInfo = new PlayerInfo("rival", PlayerType.Human, null, "rival_id");

async function layeredGame(): Promise<Game> {
  return setup(
    "plains",
    { infiniteGold: false, instantBuild: true },
    [humanInfo, rivalInfo],
    undefined,
    undefined,
    true,
    flatLayers,
  );
}

function conquerBlock(
  game: Game,
  player: Player,
  x0: number,
  y0: number,
  size: number,
): number {
  let tiles = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      player.conquer(game.ref(x, y));
      tiles++;
    }
  }
  return tiles;
}

describe("Food economy (layered maps)", () => {
  let game: Game;
  let player: Player;
  let rival: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(humanInfo.id);
    rival = game.player(rivalInfo.id);
  });

  test("activates only when the map has layers", async () => {
    expect(game.hasLayers()).toBe(true);
    expect(player.hasFoodEconomy()).toBe(true);

    const classic = await setup("plains", {}, [humanInfo]);
    expect(classic.hasLayers()).toBe(false);
    expect(classic.player(humanInfo.id).hasFoodEconomy()).toBe(false);
  });

  test("conquest transfers fertility-derived production", () => {
    conquerBlock(game, player, 0, 0, 3);
    expect(player.fertilitySum()).toBe(9 * CROP);

    // Rival takes 4 of those tiles.
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      rival.conquer(game.ref(x, y));
    }
    expect(player.fertilitySum()).toBe(5 * CROP);
    expect(rival.fertilitySum()).toBe(4 * CROP);

    // Relinquish removes fertility entirely.
    rival.relinquish(game.ref(0, 0));
    expect(rival.fertilitySum()).toBe(3 * CROP);
  });

  test("abundance grows population, and the Settlement cap binds", () => {
    conquerBlock(game, player, 0, 0, 8); // 64 tiles → plenty of production
    player.setTroops(1000);
    activate(game, player);

    game.executeNextTick();
    game.executeNextTick();
    const grown = player.troops();
    expect(grown).toBeGreaterThan(1000);

    // Cap: basePopulation with zero Settlements.
    const cap = game.config().maxTroops(player);
    expect(cap).toBe(game.config().food().basePopulation);
    player.setTroops(cap);
    game.executeNextTick();
    expect(player.troops()).toBeLessThanOrEqual(cap);
  });

  test("storage buffers a deficit; empty storage starves", () => {
    // Own one tile (stay alive) → negligible production; troops eat every tick.
    player.conquer(game.ref(0, 0));
    player.setTroops(5000);
    // 5000 troops × 10 milli = 50 food/tick vs 4 food/tick production →
    // ~2 ticks of buffer.
    player.addFood(100n);
    activate(game, player);
    game.executeNextTick();
    // Storage drained, nobody starved while it lasted.
    expect(player.troops()).toBe(5000);
    expect(player.food()).toBeLessThan(10_000n);

    game.executeNextTick();
    game.executeNextTick();
    // Stock exhausted → starvation kicks in.
    const before = player.troops();
    game.executeNextTick();
    expect(player.troops()).toBeLessThan(before);
  });

  test("stored food decays over time", async () => {
    // Barren world (crop 0 everywhere): zero production, zero consumption.
    const barren = await setup(
      "plains",
      { instantBuild: true },
      [humanInfo],
      undefined,
      undefined,
      true,
      () => 0,
    );
    const p = barren.player(humanInfo.id);
    p.conquer(barren.ref(0, 0));
    activate(barren, p);
    p.setTroops(0);
    p.addFood(10_000n);
    barren.executeNextTick();
    const f = barren.config().food();
    // One decay step: floor(10M milli × numer/denom) removed.
    const expectedMilli =
      10_000_000n - (10_000_000n * BigInt(f.decayNumer)) / BigInt(f.decayDenom);
    expect(p.food()).toBe(expectedMilli / 1000n);
  });

  test("surplus above the storage cap is lost", () => {
    player.conquer(game.ref(0, 0));
    activate(game, player);
    player.setTroops(0);
    const f = game.config().food();
    player.addFood(BigInt(f.baseStorage + 25_000));
    game.executeNextTick();
    expect(player.food()).toBeLessThanOrEqual(BigInt(f.baseStorage));
  });

  test("food fields flow through player updates on layered games only", async () => {
    conquerBlock(game, player, 0, 0, 4);
    player.setTroops(500);
    player.addFood(777n);
    activate(game, player);
    game.executeNextTick();

    type UpdateSource = Player & {
      toUpdate(): {
        food?: number;
        foodProduction?: number;
        foodConsumption?: number;
        foodStarved?: number;
      } | null;
    };
    // toUpdate() diffs against the last emission; grab a fresh full snapshot.
    (player as Player & { lastSentUpdate?: unknown }).lastSentUpdate =
      undefined;
    const update = (player as UpdateSource).toUpdate();
    expect(update).not.toBeNull();
    expect(update!.food).toBeTypeOf("number");
    expect(update!.foodProduction).toBeGreaterThan(0);
    expect(update!.foodConsumption).toBeGreaterThan(0);
    expect(update!.foodStarved).toBe(0);

    // Classic game: the fields must be absent entirely.
    const classic = await setup("plains", {}, [humanInfo]);
    const cp = classic.player(humanInfo.id);
    const classicUpdate = (cp as UpdateSource).toUpdate();
    expect(classicUpdate).not.toBeNull();
    expect(classicUpdate!.food).toBeUndefined();
    expect(classicUpdate!.foodProduction).toBeUndefined();
  });

  test("war consumption exceeds the idle baseline", () => {
    conquerBlock(game, player, 0, 0, 5);
    player.setTroops(4000);
    player.addFood(50_000n);
    activate(game, player);
    game.executeNextTick();
    const idleConsumption = flow(player).consumption;

    game.addExecution(new AttackExecution(2000, player, null));
    game.executeNextTick();
    game.executeNextTick();
    expect(flow(player).consumption).toBeGreaterThan(idleConsumption);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(humanInfo.id);
      conquerBlock(g, p, 0, 0, 6);
      p.setTroops(2000);
      p.addFood(1_234n);
      activate(g, p);
      for (let i = 0; i < 50; i++) g.executeNextTick();
      return { food: p.food(), troops: p.troops() };
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
  });
});

describe("Tribal buildings", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(humanInfo.id);
    conquerBlock(game, player, 0, 0, 6);
    player.addFood(50_000n);
  });

  test("building costs food, not gold", () => {
    const goldBefore = player.gold();
    const foodBefore = player.food();
    const tile = game.ref(2, 2);
    expect(player.canBuild(UnitType.Farmland, tile)).not.toBe(false);
    player.buildUnit(UnitType.Farmland, tile, {});
    expect(player.gold()).toBe(goldBefore);
    expect(player.food()).toBe(
      foodBefore - BigInt(game.config().food().farmlandCost),
    );
  });

  test("insufficient food rejects the build", () => {
    player.removeFood(player.food());
    expect(player.canBuild(UnitType.Settlement, game.ref(2, 2))).toBe(false);
  });

  test("hidden on unlayered maps", async () => {
    const classic = await setup("plains", { instantBuild: true }, [humanInfo]);
    const p = classic.player(humanInfo.id);
    p.conquer(classic.ref(2, 2));
    p.addFood(50_000n);
    expect(p.canBuild(UnitType.Settlement, classic.ref(2, 2))).toBe(false);
    expect(p.canBuild(UnitType.Farmland, classic.ref(2, 2))).toBe(false);
    expect(p.canBuild(UnitType.Barn, classic.ref(2, 2))).toBe(false);
  });

  test("Settlement raises the population cap; losing it lowers it", () => {
    const f = game.config().food();
    const base = game.config().maxTroops(player);
    const settlement = player.buildUnit(
      UnitType.Settlement,
      game.ref(1, 1),
      {},
    );
    expect(game.config().maxTroops(player)).toBe(
      base + f.populationPerSettlement,
    );
    settlement.delete();
    expect(game.config().maxTroops(player)).toBe(base);
  });

  test("Barn raises storage; Farmland raises production not storage", () => {
    const f = game.config().food();
    activate(game, player);
    player.setTroops(0);

    // Overfill: without barns the stock clamps to base storage.
    player.addFood(BigInt(f.baseStorage + f.storagePerBarn));
    game.executeNextTick();
    expect(player.food()).toBeLessThanOrEqual(BigInt(f.baseStorage));

    player.addFood(5_000n); // budget for building
    player.buildUnit(UnitType.Barn, game.ref(1, 1), {});
    player.addFood(BigInt(f.baseStorage + f.storagePerBarn));
    game.executeNextTick();
    expect(player.food()).toBeGreaterThan(BigInt(f.baseStorage));

    // Farmland: production rises, storage cap does not.
    game.executeNextTick();
    const productionBefore = flow(player).production;
    player.addFood(5_000n);
    player.buildUnit(UnitType.Farmland, game.ref(2, 2), {});
    game.executeNextTick();
    expect(flow(player).production).toBeGreaterThan(productionBefore);
  });

  test("capturing a Settlement transfers its cap to the conqueror", () => {
    const rival = game.player(rivalInfo.id);
    conquerBlock(game, rival, 10, 10, 3);
    rival.addFood(50_000n);
    const f = game.config().food();

    rival.buildUnit(UnitType.Settlement, game.ref(11, 11), {});
    const rivalCap = game.config().maxTroops(rival);
    expect(rivalCap).toBe(f.basePopulation + f.populationPerSettlement);

    // Player conquers the settlement's tile territory → capture via
    // PlayerExecution's structure sweep.
    const playerCapBefore = game.config().maxTroops(player);
    conquerBlock(game, player, 10, 10, 3);
    activate(game, player, rival);
    game.executeNextTick();
    expect(game.config().maxTroops(player)).toBe(
      playerCapBefore + f.populationPerSettlement,
    );
    expect(game.config().maxTroops(rival)).toBe(f.basePopulation);
  });
});

describe("Baked layered fixture", () => {
  test("tribalsmall loads its layers.bin through setup()", async () => {
    const game = await setup("tribalsmall", {}, [humanInfo]);
    expect(game.hasLayers()).toBe(true);
    // A generated world has varied fertility, not a flat plane.
    const crops = new Set<number>();
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 64; x += 4) {
        crops.add(game.layer("crop", game.ref(x, y)));
      }
    }
    expect(crops.size).toBeGreaterThan(1);
  });
});

describe("Tribal bot economy", () => {
  test("nation bot builds all three structures and survives at default knobs", async () => {
    const botInfo = new PlayerInfo(
      "botland",
      PlayerType.Nation,
      null,
      "bot_id",
    );
    // Scarce world: a small fertile patch, near-barren elsewhere — so the
    // Farmland trigger (production trailing consumption) actually fires.
    const game = await setup(
      "plains",
      { instantBuild: true },
      [botInfo],
      undefined,
      undefined,
      true,
      (name, x, y) => (name === "crop" ? (x < 3 && y < 3 ? 200 : 5) : 0),
    );
    const bot = game.player(botInfo.id);
    // 35×35: room for several structures at the 15-tile spacing (farm slots
    // deliberately scale with territory — expansion pressure).
    conquerBlock(game, bot, 0, 0, 35);
    bot.setTroops(9000); // presses on the base cap → Settlement trigger
    bot.addFood(20_000n); // seed stock: buffers the early deficit
    activate(game, bot);

    const behavior = new NationStructureBehavior(
      new PseudoRandom(42),
      game,
      bot,
    );
    for (let i = 0; i < 600; i++) {
      if (i % 10 === 0) behavior.handleStructures();
      game.executeNextTick();
    }

    // Scarcity phase: the bot houses its population and farms fertile land,
    // and never starves out.
    expect(bot.units(UnitType.Settlement).length).toBeGreaterThan(0);
    expect(bot.units(UnitType.Farmland).length).toBeGreaterThan(0);
    expect(bot.troops()).toBeGreaterThan(0);
    expect(bot.isAlive()).toBe(true);

    // Abundance phase: population well under the cap (Settlement trigger
    // quiet), fresh territory (the old block is saturated at the structure
    // spacing), and a windfall at the storage ceiling — the bot responds
    // with a Barn rather than more housing.
    conquerBlock(game, bot, 40, 0, 30);
    bot.setTroops(Math.floor(0.5 * game.config().maxTroops(bot)));
    bot.addFood(60_000n);
    for (let i = 0; i < 40 && bot.units(UnitType.Barn).length === 0; i++) {
      behavior.handleStructures();
      game.executeNextTick();
    }
    expect(bot.units(UnitType.Barn).length).toBeGreaterThan(0);
  });
});

function flow(player: Player): {
  production: number;
  consumption: number;
  starvedTroops: number;
} {
  return (player as Player & { _foodFlow: ReturnType<typeof flow> })._foodFlow;
}
