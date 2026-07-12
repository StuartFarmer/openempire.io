import { beforeEach, describe, expect, test } from "vitest";
import { urbanTick } from "../src/core/execution/utils/UrbanGrowth";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

const founderInfo = new PlayerInfo("founder", PlayerType.Human, null, "f_id");
const flat: LayersFill = () => 200;

/**
 * Isolate the AREA dynamics: population growth is frozen so troops don't
 * confound the logistic. Troop↔area coupling (density-based maxTroops) is
 * exercised after the food-tick flip; here we test the growth engine alone.
 */
class FrozenPop extends TestConfig {
  override troopIncreaseRate(): number {
    return 0;
  }
}

async function layeredGame(
  fill: LayersFill = flat,
  config: new (...args: never[]) => TestConfig = FrozenPop,
): Promise<Game> {
  return setup(
    "plains", // 100×100 all land
    { infiniteGold: false, instantBuild: true },
    [founderInfo],
    undefined,
    config,
    true,
    fill,
  );
}

function conquerBlock(
  game: Game,
  player: Player,
  x0: number,
  y0: number,
  w: number,
  h = w,
): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      player.conquer(game.ref(x, y));
    }
  }
}

/** Found a Core at (cx,cy) inside an owned block; seed it and stock food. */
function found(game: Game, player: Player, cx: number, cy: number): void {
  const core = game.ref(cx, cy);
  player.setCore(core);
  player.setDensity(core, game.config().food().coreSeedMilli);
  player.addFood(1_000_000n);
  player.setTroops(0); // no consumers → pure surplus, clean S-curve
}

/** Average per-built-tile density at Manhattan distance in [lo, hi] from the
 *  core — the empirical density profile ρ(r). */
function ringDensity(
  game: Game,
  player: Player,
  cx: number,
  cy: number,
  lo: number,
  hi: number,
): number {
  let sum = 0;
  let count = 0;
  for (const [tile, d] of player.densityEntries()) {
    const md = Math.abs(game.x(tile) - cx) + Math.abs(game.y(tile) - cy);
    if (md >= lo && md <= hi) {
      sum += d;
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

describe("Urban growth engine (add-urban-core-growth)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(founderInfo.id);
  });

  test("logistic S-curve: area accelerates then saturates", () => {
    conquerBlock(game, player, 10, 10, 80);
    found(game, player, 50, 50);

    const areaAt: number[] = [];
    for (let t = 1; t <= 400; t++) {
      urbanTick(game, player);
      if (t === 20 || t === 60 || t === 200 || t === 400) {
        areaAt.push(player.urbanArea());
      }
    }
    const [a20, a60, a200, a400] = areaAt;
    // Monotone growth from the seed.
    expect(a20).toBeGreaterThan(1);
    expect(a60).toBeGreaterThan(a20);
    expect(a200).toBeGreaterThan(a60);
    // Saturation: late growth per-tick is far slower than early growth.
    const early = (a60 - a20) / 40;
    const late = (a400 - a200) / 200;
    expect(late).toBeLessThan(early);
  });

  test("density decays from the core (emergent gradient)", async () => {
    // No satellites so growth is pure edge expansion → clean radial profile.
    class NoDispersal extends FrozenPop {
      override food() {
        return { ...super.food(), dispersalRate: 0 };
      }
    }
    game = await layeredGame(flat, NoDispersal);
    player = game.player(founderInfo.id);
    conquerBlock(game, player, 10, 10, 80);
    found(game, player, 50, 50);

    for (let t = 0; t < 60; t++) urbanTick(game, player);

    // The gradient lives at the moving front: the saturated interior vs the
    // partial frontier band. Find the outermost occupied ring.
    let maxDist = 0;
    for (const [tile] of player.densityEntries()) {
      maxDist = Math.max(
        maxDist,
        Math.abs(game.x(tile) - 50) + Math.abs(game.y(tile) - 50),
      );
    }
    const near = ringDensity(game, player, 50, 50, 1, 4);
    const front = ringDensity(game, player, 50, 50, maxDist - 3, maxDist);
    // Saturated core, sparser frontier — density decays outward.
    expect(near).toBeGreaterThan(front);
    expect(near).toBeGreaterThan(950); // interior essentially saturated
    expect(front).toBeLessThan(900);
    expect(maxDist).toBeGreaterThan(6); // the city actually spread
  });

  test("growth is drawn toward freshwater", async () => {
    // Water high to the east of the core, low to the west; crop uniform.
    const cx = 50;
    const eastWater: LayersFill = (name, x) =>
      name === "water" ? (x > cx ? 240 : 20) : 200;
    game = await layeredGame(eastWater);
    player = game.player(founderInfo.id);
    conquerBlock(game, player, 10, 10, 80);
    found(game, player, cx, 50);

    for (let t = 0; t < 120; t++) urbanTick(game, player);

    let east = 0;
    let west = 0;
    for (const [tile, d] of player.densityEntries()) {
      if (game.x(tile) > cx) east += d;
      else if (game.x(tile) < cx) west += d;
    }
    expect(east).toBeGreaterThan(west * 1.3);
  });

  test("unreachable owned land does not urbanize (supply gating)", () => {
    // Home block with the core, plus a disconnected owned pocket across a gap.
    conquerBlock(game, player, 10, 10, 20);
    conquerBlock(game, player, 60, 60, 10);
    found(game, player, 20, 20);

    for (let t = 0; t < 150; t++) urbanTick(game, player);

    let pocket = 0;
    for (const [tile, d] of player.densityEntries()) {
      if (game.x(tile) >= 60 && game.y(tile) >= 60) pocket += d;
    }
    expect(pocket).toBe(0);
    expect(player.urbanArea()).toBeGreaterThan(1); // home city grew
  });

  test("a starving city deurbanizes (area recedes)", () => {
    // Grow a city, then choke it: many troops, no food, low fertility.
    conquerBlock(game, player, 10, 10, 40);
    found(game, player, 30, 30);
    for (let t = 0; t < 120; t++) urbanTick(game, player);
    const peak = player.urbanArea();
    expect(peak).toBeGreaterThan(5);

    player.removeFood(player.food());
    // A population far beyond what the city can feed → sustained deficit.
    player.setTroops(Math.ceil(peak * 2000));
    for (let t = 0; t < 120; t++) urbanTick(game, player);
    expect(player.urbanArea()).toBeLessThan(peak);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(founderInfo.id);
      conquerBlock(g, p, 10, 10, 60);
      found(g, p, 40, 40);
      for (let t = 0; t < 200; t++) urbanTick(g, p);
      const cells = Array.from(p.densityEntries()).sort((a, b) => a[0] - b[0]);
      return { area: p.urbanArea(), cells };
    };
    const a = await run();
    const b = await run();
    expect(a.area).toBe(b.area);
    expect(a.cells).toEqual(b.cells);
  });
});
