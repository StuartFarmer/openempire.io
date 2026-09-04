import { beforeEach, describe, expect, test } from "vitest";
import {
  nucleusPaceBoost,
  tenureCapMult,
  tenureCurve,
  tenureTick,
} from "../src/core/execution/utils/TileTenure";
import { foodTargetTiles } from "../src/core/execution/utils/UrbanGrowth";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * Tile stability (rework-settlement-ecology): a DEMAND-GATED tenure clock.
 * City tiles age only while the population presses its housing limit; farms
 * only once settled at their climate ceiling; damage pauses the clock;
 * conquest hard-resets it; vacancy decays it slowly. Consumers read tenure
 * through a saturating curve: housing capacity and nucleus growth pacing.
 */

const info = new PlayerInfo("elder", PlayerType.Human, null, "elder_id");
const rivalInfo = new PlayerInfo("rival", PlayerType.Human, null, "rival_id");

const goodClimate: LayersFill = (n) => (n === "temperature" ? 153 : 255);

async function layeredGame(): Promise<[Game, Player]> {
  const g = await setup(
    "plains",
    { instantBuild: true },
    [info, rivalInfo],
    undefined,
    undefined,
    true,
    goodClimate,
  );
  const p = g.player(info.id);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) p.conquer(g.ref(x, y));
  return [g, p];
}

/** Make (x,y) a full city tile of `p`. */
function cityTile(g: Game, p: Player, x: number, y: number): number {
  const t = g.ref(x, y);
  p.setDensity(t, g.config().food().popPerDensity);
  return t;
}

function setPopulation(p: Player, people: number): void {
  (p as Player & { _foodFlow: { population: number } })._foodFlow.population =
    people;
}

describe("the demand-gated clock", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    [game, player] = await layeredGame();
  });

  test("a city tile ages only while the population presses its housing", () => {
    const t = cityTile(game, player, 3, 3);

    // Population far below housing: the city has room — no aging.
    setPopulation(player, 1);
    for (let i = 0; i < 20; i++) tenureTick(game, player);
    expect(game.tileTenure(t)).toBe(0);

    // Population at the limit: every healthy full tile ages 1 tick of tenure.
    setPopulation(player, 1_000_000);
    for (let i = 0; i < 20; i++) tenureTick(game, player);
    expect(game.tileTenure(t)).toBe(20_000); // 20 ticks in milli
  });

  test("combat damage pauses the clock", () => {
    const aging = cityTile(game, player, 3, 3);
    const scarred = cityTile(game, player, 5, 5);
    game.addTileDamage(scarred, 500);
    setPopulation(player, 1_000_000);
    for (let i = 0; i < 10; i++) tenureTick(game, player);
    expect(game.tileTenure(aging)).toBe(10_000);
    expect(game.tileTenure(scarred)).toBe(0);
  });

  test("a farm ages only once settled at its climate ceiling", () => {
    const t = game.ref(4, 4);
    player.buildUnit(UnitType.Farmland, t, {});
    setPopulation(player, 0); // farm gate is independent of the city gate

    // Unripe: planted but far below the ceiling — no tenure.
    player.setFarmMaturity(t, 100);
    for (let i = 0; i < 10; i++) tenureTick(game, player);
    expect(game.tileTenure(t)).toBe(0);

    // Settled at the ceiling (suit≈1 on this fill): the clock runs.
    player.setFarmMaturity(t, 1000);
    for (let i = 0; i < 10; i++) tenureTick(game, player);
    expect(game.tileTenure(t)).toBe(10_000);
  });
});

describe("disruption taxonomy", () => {
  test("conquest hard-resets tenure — captured heartland arrives raw", async () => {
    const [game, player] = await layeredGame();
    const t = cityTile(game, player, 3, 3);
    game.setTileTenure(t, 500_000);

    game.player(rivalInfo.id).conquer(t);
    expect(game.tileTenure(t)).toBe(0);
  });

  test("vacancy decays tenure slowly; occupied tiles hold theirs", async () => {
    const [game, player] = await layeredGame();
    const f = game.config().food();
    const occupied = cityTile(game, player, 3, 3);
    const vacant = game.ref(6, 6); // tenured but no density, no farm
    game.setTileTenure(occupied, 100_000);
    game.setTileTenure(vacant, 100_000);

    const period = Math.max(1, f.supplyRefreshTicks);
    const ticks = period * 3;
    for (let i = 0; i < ticks; i++) game.executeNextTick();

    expect(game.tileTenure(occupied)).toBe(100_000); // no decay while lived-in
    const lost = 100_000 - game.tileTenure(vacant);
    // Decayed steadily on the cadence — and far slower than 1000/tick accrual.
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(f.tenureDecayMilli * (ticks + period));
  });
});

describe("consumers of the curve", () => {
  test("the curve saturates: capMult is bounded by tenureCapMultMax", async () => {
    const [game] = await layeredGame();
    const f = game.config().food();
    expect(tenureCapMult(game, 0)).toBe(1);
    const half = f.tenureHalfTicks * 1000;
    expect(tenureCapMult(game, half)).toBeCloseTo(
      1 + (f.tenureCapMultMax - 1) / 2,
      5,
    );
    expect(tenureCapMult(game, half * 1000)).toBeLessThanOrEqual(
      f.tenureCapMultMax,
    );
    expect(tenureCurve(game, half * 1000)).toBeGreaterThan(0.99);
  });

  test("aged tiles raise housing (tenureCapacityBonus) and shrink the footprint target", async () => {
    const [game, player] = await layeredGame();
    const f = game.config().food();
    const t = cityTile(game, player, 3, 3);
    setPopulation(player, f.popPerDensity * 10);

    expect(player.tenureCapacityBonus()).toBe(0); // young tile: no bonus yet
    const youngTarget = foodTargetTiles(game, player);

    game.setTileTenure(t, f.tenureHalfTicks * 1000); // half-plateau age
    tenureTick(game, player);
    const expected = Math.floor(
      (tenureCapMult(game, game.tileTenure(t)) - 1) * f.popPerDensity,
    );
    expect(player.tenureCapacityBonus()).toBe(expected);
    expect(player.tenureCapacityBonus()).toBeGreaterThan(0);

    // Same population now needs FEWER tiles — densify, don't sprawl.
    expect(foodTargetTiles(game, player)).toBeLessThan(youngTarget);

    // And maxTroops grows with the bonus.
    const withBonus = game.config().maxTroops(player);
    (player as Player & { _tenureCapacityBonus: number })._tenureCapacityBonus =
      0;
    expect(withBonus).toBeGreaterThan(game.config().maxTroops(player));
  });

  test("an old capital grows faster (nucleus gravity), bounded", async () => {
    const [game, player] = await layeredGame();
    const f = game.config().food();
    const core = game.ref(2, 2);
    player.setCore(core);
    expect(nucleusPaceBoost(game, core)).toBe(1); // young capital
    game.setTileTenure(core, f.tenureHalfTicks * 1000);
    expect(nucleusPaceBoost(game, core)).toBeCloseTo(
      1 + f.wNucleusTenure / 2,
      5,
    );
    expect(nucleusPaceBoost(game, core)).toBeLessThan(1 + f.wNucleusTenure);
    expect(nucleusPaceBoost(game, null)).toBe(1);
  });
});
