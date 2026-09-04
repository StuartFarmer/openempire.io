import { beforeEach, describe, expect, test } from "vitest";
import {
  foodShedField,
  foodShedPotential,
  peekFoodShed,
} from "../src/core/execution/utils/FoodShed";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * The food-shed (add-urban-core-growth, growth-model.md Part 2): a second
 * supply field, sourced from Farmland and weighted by maturity, with soft
 * distance decay. It governs where a settlement grows into a city.
 */

const info = new PlayerInfo("farmer", PlayerType.Human, null, "farmer_id");
const flat: LayersFill = () => 200;

async function layeredGame(): Promise<Game> {
  return setup(
    "plains",
    { infiniteGold: false, instantBuild: true },
    [info],
    undefined,
    undefined,
    true,
    flat,
  );
}

describe("food-shed field", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(info.id);
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 60; x++) player.conquer(game.ref(x, y));
  });

  test("potential is highest at a mature farm and decays with distance", () => {
    const farm = game.ref(30, 30);
    player.buildUnit(UnitType.Farmland, farm, {});
    player.setFarmMaturity(farm, 1000);

    const shed = foodShedField(game, player);
    const atFarm = foodShedPotential(game, shed, farm);
    const near = foodShedPotential(game, shed, game.ref(35, 30)); // 5 away
    const far = foodShedPotential(game, shed, game.ref(48, 30)); // 18 away

    expect(atFarm).toBeCloseTo(1, 5); // maturity 1 × decay(0)=1
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(atFarm);
    expect(far).toBeLessThan(near);
  });

  test("an immature farm projects a weak food-shed", () => {
    const farm = game.ref(30, 30);
    player.buildUnit(UnitType.Farmland, farm, {});
    player.setFarmMaturity(farm, 200); // 20% mature

    const shed = foodShedField(game, player);
    // Potential at the farm scales with maturity (decay(0)=1).
    expect(foodShedPotential(game, shed, farm)).toBeCloseTo(0.2, 5);
  });

  test("no farms → no food-shed anywhere", () => {
    const shed = foodShedField(game, player);
    expect(foodShedPotential(game, shed, game.ref(30, 30))).toBe(0);
  });

  test("food-shed does not reach across unowned land", async () => {
    // A farm in a disconnected owned pocket cannot feed the main territory.
    const g = await layeredGame();
    const p = g.player(info.id);
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 6; x++) p.conquer(g.ref(x, y));
    const farm = g.ref(2, 2);
    p.buildUnit(UnitType.Farmland, farm, {});
    p.setFarmMaturity(farm, 1000);
    // A far, unconnected owned tile.
    p.conquer(g.ref(50, 50));

    const shed = foodShedField(g, p);
    expect(foodShedPotential(g, shed, g.ref(50, 50))).toBe(0);
    expect(foodShedPotential(g, shed, farm)).toBeGreaterThan(0);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(info.id);
      for (let y = 0; y < 40; y++)
        for (let x = 0; x < 40; x++) p.conquer(g.ref(x, y));
      for (const [x, y] of [
        [10, 10],
        [25, 25],
        [30, 12],
      ]) {
        p.buildUnit(UnitType.Farmland, g.ref(x, y), {});
        p.setFarmMaturity(g.ref(x, y), 700);
      }
      const shed = foodShedField(g, p);
      const probes: number[] = [];
      for (let x = 0; x < 40; x += 5)
        probes.push(foodShedPotential(g, shed, g.ref(x, 15)));
      return probes;
    };
    expect(await run()).toEqual(await run());
  });
});

/**
 * order-independent-shed-tiebreak: a tile equally distant from two farms belongs
 * to the one with the LOWER tile ref, not to whichever wave of the flood reached
 * it first. Until this rule existed, cell membership depended on the traversal —
 * which no parallel implementation can reproduce, and which meant two correct
 * implementations of the same field disagreed on 4.43% of tiles.
 */
describe("food-shed equidistant tie-break", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(info.id);
    for (let y = 0; y < 60; y++)
      for (let x = 0; x < 60; x++) player.conquer(game.ref(x, y));
  });

  test("a tile equidistant from two farms joins the lower tile ref", () => {
    // Two farms on the same row, and the midpoint between them.
    const left = game.ref(20, 30);
    const right = game.ref(30, 30);
    const middle = game.ref(25, 30);
    expect(Number(left)).toBeLessThan(Number(right));
    for (const t of [left, right]) {
      player.buildUnit(UnitType.Farmland, t, {});
      player.setFarmMaturity(t, 1000);
    }
    const shed = foodShedField(game, player);
    expect(shed.cellAt(middle)).toBe(left);
  });

  test("the winner does not depend on which farm was built first", async () => {
    const build = async (order: "lr" | "rl") => {
      const g = await layeredGame();
      const p = g.player(info.id);
      for (let y = 0; y < 60; y++)
        for (let x = 0; x < 60; x++) p.conquer(g.ref(x, y));
      const left = g.ref(20, 30);
      const right = g.ref(30, 30);
      for (const t of order === "lr" ? [left, right] : [right, left]) {
        p.buildUnit(UnitType.Farmland, t, {});
        p.setFarmMaturity(t, 1000);
      }
      const shed = foodShedField(g, p);
      return shed.cellAt(g.ref(25, 30));
    };
    // Same map coordinates both times, so the same tile ref must win.
    expect(await build("lr")).toBe(await build("rl"));
  });

  test("a strictly nearer farm wins even with the higher tile ref", () => {
    const far = game.ref(20, 30); // lower ref, further away
    const near = game.ref(34, 30); // higher ref, closer
    const probe = game.ref(32, 30);
    expect(Number(far)).toBeLessThan(Number(near));
    for (const t of [far, near]) {
      player.buildUnit(UnitType.Farmland, t, {});
      player.setFarmMaturity(t, 1000);
    }
    const shed = foodShedField(game, player);
    expect(shed.cellAt(probe)).toBe(near);
  });

  test("the winning farm's maturity is the one that projects potential", () => {
    const left = game.ref(20, 30);
    const right = game.ref(30, 30);
    player.buildUnit(UnitType.Farmland, left, {});
    player.setFarmMaturity(left, 1000);
    player.buildUnit(UnitType.Farmland, right, {});
    player.setFarmMaturity(right, 200);
    const shed = foodShedField(game, player);
    const middle = game.ref(25, 30);
    expect(shed.cellAt(middle)).toBe(left);
    // Projected by the LEFT farm (maturity 1.0), not the right one (0.2).
    const both = foodShedPotential(game, shed, middle);
    expect(both).toBeGreaterThan(0.2);
  });
});

/**
 * The BFS scratch (visited stamp / distance / source farm / source maturity)
 * is a single set of map-sized typed arrays shared by EVERY player and every
 * refresh, invalidated by a generation counter rather than cleared. Two
 * properties keep that honest: one player's flood must not leak into another's,
 * and a refresh must not disturb a shed computed earlier.
 */
describe("food-shed scratch is not shared between players", () => {
  const neighborInfo = new PlayerInfo(
    "neighbor",
    PlayerType.Human,
    null,
    "neighbor_id",
  );

  async function twoPlayerGame(): Promise<Game> {
    return setup(
      "plains",
      { infiniteGold: false, instantBuild: true },
      [info, neighborInfo],
      undefined,
      undefined,
      true,
      flat,
    );
  }

  test("adjacent empires each keep their own shed", async () => {
    const game = await twoPlayerGame();
    const west = game.player(info.id);
    const east = game.player(neighborInfo.id);
    // Two touching halves, so both floods run over the same tiles' neighbours.
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 20; x++) west.conquer(game.ref(x, y));
      for (let x = 20; x < 40; x++) east.conquer(game.ref(x, y));
    }
    const westFarm = game.ref(10, 20);
    const eastFarm = game.ref(30, 20);
    west.buildUnit(UnitType.Farmland, westFarm, {});
    west.setFarmMaturity(westFarm, 1000);
    east.buildUnit(UnitType.Farmland, eastFarm, {});
    east.setFarmMaturity(eastFarm, 1000);

    // Compute west's shed, then east's — east's refresh reuses the scratch.
    const westShed = foodShedField(game, west);
    const westBefore = foodShedPotential(game, westShed, game.ref(12, 20));
    const eastShed = foodShedField(game, east);

    // West's field still reads the same after east flooded through the scratch.
    expect(foodShedPotential(game, westShed, game.ref(12, 20))).toBe(
      westBefore,
    );
    expect(westBefore).toBeGreaterThan(0);
    // Neither shed spills across the border into the other's land.
    expect(westShed.hasCell(eastFarm)).toBe(false);
    expect(eastShed.hasCell(westFarm)).toBe(false);
    expect(foodShedPotential(game, westShed, game.ref(30, 20))).toBe(0);
    expect(foodShedPotential(game, eastShed, game.ref(10, 20))).toBe(0);
    // Every cell in each shed belongs to that shed's own farm.
    for (const t of westShed.tiles) expect(westShed.cellAt(t)).toBe(westFarm);
    for (const t of eastShed.tiles) expect(eastShed.cellAt(t)).toBe(eastFarm);
  });

  test("a player's own refresh is stable when re-run after a neighbor's", async () => {
    const game = await twoPlayerGame();
    const west = game.player(info.id);
    const east = game.player(neighborInfo.id);
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 20; x++) west.conquer(game.ref(x, y));
      for (let x = 20; x < 40; x++) east.conquer(game.ref(x, y));
    }
    for (const [x, y] of [
      [5, 10],
      [14, 30],
    ]) {
      west.buildUnit(UnitType.Farmland, game.ref(x, y), {});
      west.setFarmMaturity(game.ref(x, y), 800);
    }
    east.buildUnit(UnitType.Farmland, game.ref(25, 20), {});
    east.setFarmMaturity(game.ref(25, 20), 800);

    const probe = (): number[] => {
      const shed = foodShedField(game, west);
      const out: number[] = [];
      for (let x = 0; x < 20; x += 2)
        out.push(foodShedPotential(game, shed, game.ref(x, 10)));
      return out;
    };
    const first = probe();
    // Flood the neighbour through the shared scratch, then push the clock past
    // the refresh cadence so west's next call is a REAL recompute — otherwise
    // the cache hands back the same object and the test proves nothing.
    foodShedField(game, east);
    const period = game.config().food().supplyRefreshTicks;
    for (let i = 0; i <= period; i++) game.executeNextTick();
    expect(probe()).toEqual(first);
  });

  /**
   * The behaviour change specified by shed-reflects-current-ownership: the shed
   * follows the map, not the refresh clock. Ground a player has lost leaves
   * their shed as soon as the new owner's is recomputed — it no longer lingers
   * until the loser's own cadence comes round.
   */
  test("ground that changes hands leaves the loser's shed at once", async () => {
    const game = await twoPlayerGame();
    const west = game.player(info.id);
    const east = game.player(neighborInfo.id);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) west.conquer(game.ref(x, y));
    const westFarm = game.ref(10, 20);
    west.buildUnit(UnitType.Farmland, westFarm, {});
    west.setFarmMaturity(westFarm, 1000);

    const contested = game.ref(14, 20);
    const westShed = foodShedField(game, west);
    expect(westShed.hasCell(contested)).toBe(true);
    expect(westShed.cellAt(contested)).toBe(westFarm);

    // East takes the ground and plants its own farm on it, then floods.
    for (let y = 12; y < 28; y++)
      for (let x = 12; x < 24; x++) east.conquer(game.ref(x, y));
    const eastFarm = game.ref(18, 20);
    east.buildUnit(UnitType.Farmland, eastFarm, {});
    east.setFarmMaturity(eastFarm, 1000);
    const eastShed = foodShedField(game, east);

    // The tile is east's now, and west's shed no longer claims it — even though
    // west has not refreshed.
    expect(eastShed.hasCell(contested)).toBe(true);
    expect(eastShed.cellAt(contested)).toBe(eastFarm);
    expect(westShed.hasCell(contested)).toBe(false);
    expect(foodShedPotential(game, westShed, contested)).toBe(0);
    // West's remaining ground is untouched by east's flood.
    expect(westShed.hasCell(westFarm)).toBe(true);
  });

  /**
   * The shed's planes are module-level and shared across players. A second game
   * in the same process — the shell restarting a match, or simply the next test
   * — must not inherit the first game's shed, and smallIDs get reused, so the
   * owner tag alone would happily match.
   */
  test("a second game in the same process starts with an empty shed", async () => {
    const first = await layeredGame();
    const p1 = first.player(info.id);
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 30; x++) p1.conquer(first.ref(x, y));
    const farm = first.ref(15, 15);
    p1.buildUnit(UnitType.Farmland, farm, {});
    p1.setFarmMaturity(farm, 1000);
    const shed1 = foodShedField(first, p1);
    expect(foodShedPotential(first, shed1, first.ref(17, 15))).toBeGreaterThan(
      0,
    );

    // A fresh game, same process, same player id — and no farms at all.
    const second = await layeredGame();
    const p2 = second.player(info.id);
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 30; x++) p2.conquer(second.ref(x, y));
    const shed2 = foodShedField(second, p2);
    expect(foodShedPotential(second, shed2, second.ref(17, 15))).toBe(0);
    expect(shed2.hasCell(second.ref(17, 15))).toBe(false);
  });
});

/**
 * `peekFoodShed` exists because OBSERVING the shed was changing it. The GPU
 * uploader runs between ticks and used the normal accessor, which refreshes
 * when the cadence is due — so sheds recomputed early, `lastCalcTick` moved, and
 * the sim's own call later in the tick found them fresh and skipped. The
 * injection A/B caught it as 25/41 matching hashes; with the peek it is 41/41.
 */
describe("peekFoodShed does not perturb what it observes", () => {
  test("peeking never recomputes, and never moves the refresh cadence", async () => {
    const game = await setup(
      "plains",
      { instantBuild: true },
      [new PlayerInfo("peek", PlayerType.Human, null, "peek_id")],
      undefined,
      undefined,
      true,
      () => 200,
    );
    const player = game.player("peek_id");

    // Before any refresh there is nothing to see — and asking must not create
    // one, or the first observation would itself be a recompute.
    expect(peekFoodShed(player)).toBe(null);

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) player.conquer(game.ref(x, y));
    }
    player.buildUnit(UnitType.Farmland, game.ref(5, 5), {});
    player.setFarmMaturity(game.ref(5, 5), 1000);

    const shed = foodShedField(game, player) as unknown as {
      lastCalcTick: number;
    };
    const at = shed.lastCalcTick;
    expect(peekFoodShed(player)).not.toBe(null);

    // Tick past a full cadence WITHOUT the sim touching the shed, so a refresh
    // is overdue. Peeking must still not trigger it.
    const period = game.config().food().supplyRefreshTicks;
    for (let i = 0; i < period + 2; i++) game.executeNextTick();
    peekFoodShed(player);
    expect(shed.lastCalcTick).toBe(at);

    // The normal accessor is what refreshes — the contrast that gives the
    // assertion above its meaning.
    foodShedField(game, player);
    expect(shed.lastCalcTick).toBeGreaterThan(at);
  });
});
