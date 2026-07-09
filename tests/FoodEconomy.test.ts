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
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
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
    conquerBlock(game, player, 0, 0, 8);
    player.addFood(10_000n);
    // Plenty of production: a farm belt (land alone produces nothing now).
    for (const x of [1, 2, 3, 4, 5, 6]) {
      player.buildUnit(UnitType.Farmland, game.ref(x, 1), {});
    }
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
    player.setTroops(10_000);
    // Clear the starting stake, then give ~2 ticks of buffer: 10k troops
    // eat 100 food/tick vs ~33/tick production (ghost farm + one tile).
    player.removeFood(player.food());
    player.addFood(150n);
    activate(game, player);
    game.executeNextTick();
    // Storage drained, nobody starved while it lasted.
    expect(player.troops()).toBe(10_000);
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
    p.removeFood(p.food()); // clear the starting stake for exact math
    p.addFood(3_000n); // under the base storage cap
    barren.executeNextTick();
    const f = barren.config().food();
    // No farms → zero production; the only movement is one decay step.
    const expectedMilli =
      3_000_000n - (3_000_000n * BigInt(f.decayNumer)) / BigInt(f.decayDenom);
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
    player.buildUnit(UnitType.Farmland, game.ref(1, 1), {});
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

describe("Tribal scarcity (rework-tribal-scarcity)", () => {
  let game: Game;
  let player: Player;
  let rival: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(humanInfo.id);
    rival = game.player(rivalInfo.id);
  });

  test("no gold on layered maps; starting food stake instead", async () => {
    expect(player.gold()).toBe(0n);
    expect(player.food()).toBe(BigInt(game.config().food().startingFood));

    player.conquer(game.ref(0, 0));
    activate(game, player);
    for (let i = 0; i < 5; i++) game.executeNextTick();
    expect(player.gold()).toBe(0n); // no income either

    // Classic maps keep vanilla gold income.
    const classic = await setup("plains", {}, [humanInfo]);
    const cp = classic.player(humanInfo.id);
    cp.conquer(classic.ref(0, 0));
    activate(classic, cp);
    const goldBefore = cp.gold();
    classic.executeNextTick();
    expect(cp.gold()).toBeGreaterThan(goldBefore);
  });

  test("conquest grants no food production by itself", () => {
    conquerBlock(game, player, 0, 0, 16); // 256 tiles
    conquerBlock(game, rival, 40, 40, 2); // 4 tiles
    player.setTroops(0);
    rival.setTroops(0);
    activate(game, player, rival);
    game.executeNextTick();

    // 64× the territory, identical (zero) production without farms.
    expect(flow(player).production).toBe(0);
    expect(flow(rival).production).toBe(0);
  });

  test("unfarmed land produces nothing; farms are the only food source", () => {
    conquerBlock(game, player, 0, 0, 10); // 100 fertile tiles, zero farms
    player.addFood(10_000n);
    player.setTroops(0);
    activate(game, player);
    game.executeNextTick();
    expect(flow(player).production).toBe(0);

    // Paint a 4-plot farm belt (consecutive tiles).
    for (const x of [2, 3, 4, 5]) {
      player.buildUnit(UnitType.Farmland, game.ref(x, 2), {});
    }
    game.executeNextTick();
    expect(flow(player).production).toBeGreaterThan(0);
  });

  test("adjacency: a farm belt out-produces scattered farms", async () => {
    const scatteredGame = await layeredGame();
    const sp = scatteredGame.player(humanInfo.id);
    conquerBlock(game, player, 0, 0, 12);
    conquerBlock(scatteredGame, sp, 0, 0, 12);
    player.addFood(10_000n);
    sp.addFood(10_000n);
    activate(game, player);
    activate(scatteredGame, sp);
    player.setTroops(0);
    sp.setTroops(0);

    // Belt: 4 consecutive plots; scattered: 4 isolated plots.
    for (const x of [2, 3, 4, 5]) {
      player.buildUnit(UnitType.Farmland, game.ref(x, 2), {});
    }
    for (const [x, y] of [
      [1, 1],
      [6, 1],
      [1, 6],
      [6, 6],
    ]) {
      sp.buildUnit(UnitType.Farmland, scatteredGame.ref(x, y), {});
    }
    game.executeNextTick();
    scatteredGame.executeNextTick();
    expect(flow(player).production).toBeGreaterThan(flow(sp).production);
  });

  test("one plot per tile: neighbors fine, same tile rejected", () => {
    conquerBlock(game, player, 0, 0, 6);
    player.addFood(10_000n);
    expect(player.canBuild(UnitType.Farmland, game.ref(0, 0))).not.toBe(false);
    player.buildUnit(UnitType.Farmland, game.ref(0, 0), {});
    // Tile-by-tile packing is allowed…
    expect(player.canBuild(UnitType.Farmland, game.ref(1, 0))).not.toBe(false);
    expect(player.canBuild(UnitType.Barn, game.ref(0, 1))).not.toBe(false);
    // …but an occupied tile is rejected, for any structure type.
    expect(player.canBuild(UnitType.Farmland, game.ref(0, 0))).toBe(false);
    expect(player.canBuild(UnitType.Settlement, game.ref(0, 0))).toBe(false);
    // Unowned tiles are rejected.
    expect(player.canBuild(UnitType.Farmland, game.ref(10, 10))).toBe(false);
  });

  test("tribal plots build instantly — no construction time", () => {
    // instantBuild is OFF here; tribal plots still have no build duration.
    const info = game.config().unitInfo(UnitType.Settlement);
    expect(info.constructionDuration ?? 0).toBe(0);
    expect(
      (game.config().unitInfo(UnitType.Farmland).constructionDuration ?? 0) +
        (game.config().unitInfo(UnitType.Barn).constructionDuration ?? 0),
    ).toBe(0);
  });

  test("costs escalate per owned building", () => {
    conquerBlock(game, player, 0, 0, 35);
    player.addFood(50_000n);
    const cost = () =>
      game.config().unitInfo(UnitType.Farmland).cost(game, player);

    const f = game.config().food();
    const base = cost();
    expect(base).toBe(BigInt(f.farmlandCost));
    player.buildUnit(UnitType.Farmland, game.ref(2, 2), {});
    expect(cost()).toBe(
      BigInt(Math.ceil(f.farmlandCost * (1 + f.costGrowthPerOwned))),
    );
    player.buildUnit(UnitType.Farmland, game.ref(20, 20), {});
    expect(cost()).toBe(
      BigInt(Math.ceil(f.farmlandCost * (1 + 2 * f.costGrowthPerOwned))),
    );
  });

  test("invest-or-starve: idle stake drains, then population shrinks; farms stop the bleed", () => {
    conquerBlock(game, player, 0, 0, 10); // land+ghost sustain only ~6k
    player.setTroops(15_000);
    activate(game, player);

    // Spend nothing: stake drains, then starvation.
    for (let i = 0; i < 100; i++) game.executeNextTick();
    const starvedTo = player.troops();
    expect(starvedTo).toBeLessThan(15_000);
    expect(flow(player).starvedTroops).toBeGreaterThan(0);

    // Invest: two farms lift production; starvation stops shortly after.
    player.addFood(5_000n);
    player.buildUnit(UnitType.Farmland, game.ref(2, 2), {});
    player.buildUnit(UnitType.Farmland, game.ref(2, 8), {});
    for (let i = 0; i < 100; i++) game.executeNextTick();
    expect(flow(player).starvedTroops).toBe(0);
    expect(player.isAlive()).toBe(true);
  });
});

describe("Ghost start + starvation parity", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(humanInfo.id);
  });

  test("settling paints the starter kit: 1 Settlement + 3 Farmland, free", async () => {
    // Real spawn flow (SpawnExecution), not manual conquest.
    const g = await setup(
      "plains",
      { instantBuild: true },
      [humanInfo],
      undefined,
      undefined,
      false, // keep the spawn phase — SpawnExecution drives it
      flatLayers,
    );
    const p = g.player(humanInfo.id);
    const f = g.config().food();
    g.addExecution(new SpawnExecution("kit_game", p.info(), g.ref(20, 20)));
    g.executeNextTick();
    g.executeNextTick();

    expect(p.units(UnitType.Settlement).length).toBe(1);
    expect(p.units(UnitType.Farmland).length).toBe(3);
    // The kit is free: the opening stake is intact.
    expect(p.food()).toBe(BigInt(f.startingFood));
    expect(p.troops()).toBe(f.startPopulation);
    // Cap = floor + the starter Settlement.
    expect(g.config().maxTroops(p)).toBe(
      f.basePopulation + f.populationPerSettlement,
    );

    // Idle from here: the kit's farms feed the start population.
    for (let i = 0; i < 200; i++) g.executeNextTick();
    expect(p.foodFlow().starvedTroops).toBe(0);
    expect(p.troops()).toBeGreaterThanOrEqual(f.startPopulation);
  });

  test("troops deployed in attacks starve too — no famine shelter", () => {
    const rival = game.player(rivalInfo.id);
    conquerBlock(game, player, 0, 0, 8);
    conquerBlock(game, rival, 40, 40, 8);
    player.setTroops(20_000);
    rival.setTroops(20_000);
    player.removeFood(player.food());
    rival.removeFood(rival.food());
    activate(game, player, rival);

    // Rival commits nearly everything to an expansion attack; player idles.
    game.addExecution(new AttackExecution(18_000, rival, null));
    for (let i = 0; i < 200; i++) game.executeNextTick();

    const rivalTotal =
      rival.troops() +
      rival.outgoingAttacks().reduce((a, at) => a + at.troops(), 0);
    // Both starved massively; deployment must not shield the army. The
    // attacker eats at 4× while fighting, so it should end up no better
    // off in total population than the idle player.
    expect(player.troops()).toBeLessThan(20_000);
    expect(rivalTotal).toBeLessThan(20_000);
    expect(rivalTotal).toBeLessThanOrEqual(player.troops() * 2);
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
    // Scarce world: a small fertile patch, near-barren elsewhere — the bot
    // must grow its farm district from the starter kit, not wasteland-spam.
    const game = await setup(
      "plains",
      { instantBuild: true },
      [botInfo],
      undefined,
      undefined,
      false, // spawn phase on — the real SpawnExecution places the kit
      (name, x, y) => (name === "crop" ? (x < 6 && y < 6 ? 200 : 5) : 0),
    );
    const bot = game.player(botInfo.id);
    // Real spawn on the fertile patch → starter kit (Settlement + 3 farms).
    game.addExecution(
      new SpawnExecution("bot_game", bot.info(), game.ref(2, 2)),
    );
    game.executeNextTick();
    game.executeNextTick();
    game.endSpawnPhase();
    expect(bot.units(UnitType.Farmland).length).toBe(3);
    conquerBlock(game, bot, 0, 0, 35);
    // Presses on the starting cap → Settlement trigger.
    const f = game.config().food();
    bot.setTroops(
      Math.ceil(0.85 * (f.basePopulation + f.populationPerSettlement)),
    );
    bot.addFood(20_000n); // seed stock: buffers the early deficit

    const behavior = new NationStructureBehavior(
      new PseudoRandom(42),
      game,
      bot,
    );
    for (let i = 0; i < 600; i++) {
      if (i % 10 === 0) behavior.handleStructures();
      game.executeNextTick();
    }

    // Scarcity phase: the bot houses its population and grows its farm
    // district beyond the starter kit, and never starves out.
    expect(bot.units(UnitType.Settlement).length).toBeGreaterThan(1);
    expect(bot.units(UnitType.Farmland).length).toBeGreaterThan(3);
    expect(bot.troops()).toBeGreaterThan(0);
    expect(bot.isAlive()).toBe(true);

    // Abundance phase: a small population (production comfortably exceeds
    // consumption, so the Farmland/Settlement triggers stay quiet), fresh
    // territory (the old block is saturated at the structure spacing), and
    // a stock at the storage ceiling — the bot responds with a Barn.
    conquerBlock(game, bot, 40, 0, 30);
    bot.setTroops(1000);
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
