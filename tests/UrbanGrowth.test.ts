import { beforeEach, describe, expect, test } from "vitest";
import { supplyField } from "../src/core/execution/utils/SupplyField";
import {
  foodTargetTiles,
  growUrbanArea,
  recedeToTarget,
} from "../src/core/execution/utils/UrbanGrowth";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";
import { TestConfig } from "./util/TestConfig";

const founderInfo = new PlayerInfo("founder", PlayerType.Human, null, "f_id");
const flat: LayersFill = () => 200;

/**
 * A broad food-shed for the spatial-dynamics tests: a huge foodShedRadius makes
 * one mature farm feed the whole region uniformly, so these tests isolate the
 * urban SUITABILITY field and the food-CAPACITY bound from the food-shed gate.
 */
class Fed extends TestConfig {
  override food() {
    return {
      ...super.food(),
      foodShedRadius: 500,
      foodShedPower: 3,
      wFoodShed: 2,
    };
  }
}

async function layeredGame(
  fill: LayersFill = flat,
  config: new (...args: never[]) => TestConfig = Fed,
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

/** Set the living population that drives the city footprint. */
function setPopulation(player: Player, people: number): void {
  (
    player as Player & { _foodFlow: { population: number } }
  )._foodFlow.population = people;
}

/** Plant a fully-mature Farmland at (x,y) so it projects the food-shed. */
function plantFedFarm(game: Game, player: Player, x: number, y: number): void {
  const t = game.ref(x, y);
  player.buildUnit(UnitType.Farmland, t, {});
  player.setFarmMaturity(t, 1000);
}

/** Found a Core at (cx,cy), seed it, and feed it a mature farm nearby. */
function found(game: Game, player: Player, cx: number, cy: number): void {
  const core = game.ref(cx, cy);
  player.setCore(core);
  player.setDensity(core, game.config().food().popPerDensity);
  plantFedFarm(game, player, cx + 3, cy + 3);
}

/**
 * Drive the sprawl engine directly with an effectively-unbounded population,
 * isolating the spatial dynamics from the population bound.
 */
function grow(game: Game, player: Player, ticks: number): void {
  setPopulation(player, 3_000_000); // target far above the test region
  const supply = supplyField(game, player);
  for (let i = 0; i < ticks; i++) growUrbanArea(game, player, supply);
}

describe("Urban sprawl engine (add-urban-core-growth)", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(founderInfo.id);
  });

  test("city size is bounded by living population, not by land", () => {
    conquerBlock(game, player, 10, 10, 80); // plenty of land
    found(game, player, 50, 50);
    // A population of 10 tiles' worth of people (popPerDensity people per tile).
    setPopulation(player, game.config().food().popPerDensity * 10);
    expect(foodTargetTiles(game, player)).toBe(10);

    const supply = supplyField(game, player);
    for (let i = 0; i < 300; i++) growUrbanArea(game, player, supply);

    // The city saturates at exactly what its population houses, not one tile
    // more, even though 80×80 of land is available.
    expect(player.urbanArea()).toBe(10);
  });

  test("nuclei anchor the target: a founded town earns its first tile at any population", () => {
    conquerBlock(game, player, 10, 10, 80);
    found(game, player, 30, 30);
    const f = game.config().food();

    // A tribal-scale population, far below one full city tile of people:
    // the pop term says 0 tiles, the Core's nucleus floor says 1.
    setPopulation(player, Math.floor(f.popPerDensity / 2));
    expect(foodTargetTiles(game, player)).toBe(1);

    // Found a town (the award pair's settlement) far from the capital,
    // beside a mature farm so the food-shed gate lets it grow.
    player.buildUnit(UnitType.Settlement, game.ref(60, 60), {});
    plantFedFarm(game, player, 63, 63);
    expect(foodTargetTiles(game, player)).toBe(2);

    // The urban CA grows the town's first tile without waiting for a
    // national population of (area+1)·popPerDensity.
    const supply = supplyField(game, player);
    for (let i = 0; i < 50; i++) growUrbanArea(game, player, supply);
    expect(player.urbanArea()).toBe(2);

    // And recession never razes a living town's last tile.
    setPopulation(player, 100);
    for (let i = 0; i < 100; i++) recedeToTarget(game, player);
    expect(player.urbanArea()).toBe(2);
  });

  test("city tiles are binary and 4-contiguous (no gradient, no islands)", () => {
    conquerBlock(game, player, 10, 10, 60);
    found(game, player, 40, 40);
    grow(game, player, 120);

    // Every built tile is a full city tile (popPerDensity people) — no partials.
    const full = game.config().food().popPerDensity;
    const cityTiles = new Set<number>();
    for (const [tile, d] of player.densityEntries()) {
      expect(d).toBe(full);
      cityTiles.add(tile);
    }
    expect(cityTiles.size).toBeGreaterThan(5);

    // Every city tile is 4-connected back to the seed through other city tiles.
    const core = game.ref(40, 40);
    const seen = new Set<number>([core]);
    const stack = [core];
    const nbuf: number[] = [0, 0, 0, 0];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const n = game.map().neighbors4(cur, nbuf);
      for (let i = 0; i < n; i++) {
        const nb = nbuf[i];
        if (cityTiles.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          stack.push(nb);
        }
      }
    }
    for (const t of cityTiles) expect(seen.has(t)).toBe(true);
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
    for (const [tile] of player.densityEntries()) {
      if (game.x(tile) > cx) east++;
      else if (game.x(tile) < cx) west++;
    }
    expect(east).toBeGreaterThan(west * 1.3);
  });

  test("unreachable owned land does not urbanize (supply gating)", () => {
    conquerBlock(game, player, 10, 10, 20);
    conquerBlock(game, player, 60, 60, 10);
    found(game, player, 20, 20);
    grow(game, player, 150);

    let pocket = 0;
    for (const [tile] of player.densityEntries()) {
      if (game.x(tile) >= 60 && game.y(tile) >= 60) pocket++;
    }
    expect(pocket).toBe(0);
    expect(player.urbanArea()).toBeGreaterThan(1);
  });

  test("a city only grows where farms feed it (food-shed gate)", async () => {
    // Two settlements, same nation: one ringed by a mature farm, one with none.
    class Local extends TestConfig {
      override food() {
        return { ...super.food(), foodShedRadius: 6, foodShedPower: 3 };
      }
    }
    game = await layeredGame(flat, Local);
    player = game.player(founderInfo.id);
    conquerBlock(game, player, 0, 0, 90, 90);

    // Fed settlement at (20,20) with a mature farm two tiles away.
    player.setCore(game.ref(20, 20));
    player.setDensity(game.ref(20, 20), game.config().food().popPerDensity);
    plantFedFarm(game, player, 22, 20);
    // Starved settlement at (70,70): a supplied city seed, but no farm within
    // its food-shed — the food-shed gate (not supply) blocks it.
    player.buildUnit(UnitType.Settlement, game.ref(70, 70), {});
    player.setDensity(game.ref(70, 70), game.config().food().popPerDensity);

    setPopulation(player, 3_000_000);
    const supply = supplyField(game, player);
    for (let i = 0; i < 200; i++) growUrbanArea(game, player, supply);

    let fed = 0;
    let starved = 0;
    for (const [tile] of player.densityEntries()) {
      const near = (cx: number, cy: number) =>
        Math.abs(game.x(tile) - cx) + Math.abs(game.y(tile) - cy) < 30;
      if (near(20, 20)) fed++;
      else if (near(70, 70)) starved++;
    }
    expect(fed).toBeGreaterThan(starved * 3);
  });

  test("city razes tiles when the population dies off", () => {
    conquerBlock(game, player, 10, 10, 40);
    found(game, player, 30, 30);
    // A population that houses 15 tiles.
    const f = game.config().food();
    setPopulation(player, f.popPerDensity * 15);
    const supply = supplyField(game, player);
    for (let i = 0; i < 200; i++) growUrbanArea(game, player, supply);
    const peak = player.urbanArea();
    expect(peak).toBeGreaterThan(10);

    // The population collapses to 3 tiles' worth → the city sheds its rim over
    // ticks (recedeToTarget runs from urbanTick; drive it directly here).
    setPopulation(player, f.popPerDensity * 3);
    for (let i = 0; i < 100; i++) recedeToTarget(game, player);
    expect(player.urbanArea()).toBeLessThan(peak);
    expect(player.urbanArea()).toBe(3); // shrinks exactly to what people fill
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
