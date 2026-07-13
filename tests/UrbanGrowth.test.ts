import { beforeEach, describe, expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import { supplyField } from "../src/core/execution/utils/SupplyField";
import { growUrbanArea } from "../src/core/execution/utils/UrbanGrowth";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

const founderInfo = new PlayerInfo("founder", PlayerType.Human, null, "f_id");
const flat: LayersFill = () => 200;

async function layeredGame(
  fill: LayersFill = flat,
  config?: new (...args: never[]) => TestConfig,
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
    for (let x = x0; x < x0 + w; x++) player.conquer(game.ref(x, y));
  }
}

/** Found a Core at (cx,cy) and seed it. */
function found(game: Game, player: Player, cx: number, cy: number): void {
  const core = game.ref(cx, cy);
  player.setCore(core);
  player.setDensity(core, game.config().food().coreSeedMilli);
}

/**
 * Drive the sprawl engine directly with a full food surplus, isolating the
 * spatial dynamics from the food economy (which gates growth in urbanTick).
 */
function grow(game: Game, player: Player, ticks: number): void {
  const supply = supplyField(game, player);
  for (let i = 0; i < ticks; i++) growUrbanArea(game, player, supply, 1);
}

/** Average per-built-tile density at Manhattan distance [lo,hi] — ρ(r). */
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

describe("Urban sprawl engine (add-urban-core-growth)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(founderInfo.id);
  });

  test("logistic S-curve: area accelerates then saturates", () => {
    conquerBlock(game, player, 10, 10, 80);
    found(game, player, 50, 50);
    const supply = supplyField(game, player);

    const areaAt: number[] = [];
    for (let t = 1; t <= 400; t++) {
      growUrbanArea(game, player, supply, 1);
      if (t === 20 || t === 60 || t === 200 || t === 400) {
        areaAt.push(player.urbanArea());
      }
    }
    const [a20, a60, a200, a400] = areaAt;
    expect(a20).toBeGreaterThan(1);
    expect(a60).toBeGreaterThan(a20);
    expect(a200).toBeGreaterThan(a60);
    const early = (a60 - a20) / 40;
    const late = (a400 - a200) / 200;
    expect(late).toBeLessThan(early);
  });

  test("density decays from the core (emergent gradient)", async () => {
    class NoDispersal extends TestConfig {
      override food() {
        return { ...super.food(), dispersalRate: 0 };
      }
    }
    game = await layeredGame(flat, NoDispersal);
    player = game.player(founderInfo.id);
    conquerBlock(game, player, 10, 10, 80);
    found(game, player, 50, 50);
    grow(game, player, 60);

    let maxDist = 0;
    for (const [tile] of player.densityEntries()) {
      maxDist = Math.max(
        maxDist,
        Math.abs(game.x(tile) - 50) + Math.abs(game.y(tile) - 50),
      );
    }
    const near = ringDensity(game, player, 50, 50, 1, 4);
    const front = ringDensity(game, player, 50, 50, maxDist - 3, maxDist);
    expect(near).toBeGreaterThan(front);
    expect(near).toBeGreaterThan(950);
    expect(front).toBeLessThan(900);
    expect(maxDist).toBeGreaterThan(6);
  });

  test("sprawl is drawn toward freshwater", async () => {
    const cx = 50;
    const eastWater: LayersFill = (name, x) =>
      name === "water" ? (x > cx ? 240 : 20) : 200;
    game = await layeredGame(eastWater);
    player = game.player(founderInfo.id);
    conquerBlock(game, player, 10, 10, 80);
    found(game, player, cx, 50);
    grow(game, player, 120);

    let east = 0;
    let west = 0;
    for (const [tile, d] of player.densityEntries()) {
      if (game.x(tile) > cx) east += d;
      else if (game.x(tile) < cx) west += d;
    }
    expect(east).toBeGreaterThan(west * 1.3);
  });

  test("unreachable owned land does not urbanize (supply gating)", () => {
    conquerBlock(game, player, 10, 10, 20);
    conquerBlock(game, player, 60, 60, 10);
    found(game, player, 20, 20);
    grow(game, player, 150);

    let pocket = 0;
    for (const [tile, d] of player.densityEntries()) {
      if (game.x(tile) >= 60 && game.y(tile) >= 60) pocket += d;
    }
    expect(pocket).toBe(0);
    expect(player.urbanArea()).toBeGreaterThan(1);
  });

  test("a starving city deurbanizes via urbanTick", () => {
    // Grow a city, then choke the food economy (no farms, huge population).
    conquerBlock(game, player, 10, 10, 40);
    found(game, player, 30, 30);
    grow(game, player, 120);
    const peak = player.urbanArea();
    expect(peak).toBeGreaterThan(5);

    player.removeFood(player.food());
    player.setTroops(200_000); // nothing feeds them → starvation → recede
    game.addExecution(new PlayerExecution(player));
    for (let i = 0; i < 120; i++) game.executeNextTick();
    expect(player.urbanArea()).toBeLessThan(peak);
  });

  test("deterministic across identical runs", async () => {
    const run = async () => {
      const g = await layeredGame();
      const p = g.player(founderInfo.id);
      conquerBlock(g, p, 10, 10, 60);
      found(g, p, 40, 40);
      grow(g, p, 200);
      const cells = Array.from(p.densityEntries()).sort((a, b) => a[0] - b[0]);
      return { area: p.urbanArea(), cells };
    };
    const a = await run();
    const b = await run();
    expect(a.area).toBe(b.area);
    expect(a.cells).toEqual(b.cells);
  });
});
