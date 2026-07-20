import { beforeEach, describe, expect, test } from "vitest";
import { PlayerExecution } from "../src/core/execution/PlayerExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { LayersFill, setup } from "./util/Setup";

/**
 * Demand-gated city growth over the suitability plane (restore-organic-
 * growth, city-growth spec): the city grows when its people press the
 * housing ceiling, recedes when they leave, and IS the housing.
 */

const founderInfo = new PlayerInfo("founder", PlayerType.Human, null, "f_id");
const richFill: LayersFill = (n) =>
  n === "temperature" ? Math.round(0.65 * 255) : 255;

async function layeredGame(fill: LayersFill = richFill): Promise<Game> {
  return setup(
    "plains",
    { instantBuild: true },
    [founderInfo],
    undefined,
    undefined,
    true,
    fill,
  );
}

function own(g: Game, p: Player, x0: number, y0: number, size: number): void {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) p.conquer(g.ref(x, y));
  }
}

describe("demand-gated city growth", () => {
  let game: Game;
  let player: Player;

  beforeEach(async () => {
    game = await layeredGame();
    player = game.player(founderInfo.id);
    own(game, player, 20, 20, 15);
    player.setCore(game.ref(27, 27));
    player.buildUnit(UnitType.Farmland, game.ref(22, 22), {});
    game.addExecution(new PlayerExecution(player));
    game.executeNextTick();
  });

  test("the city grows while people press housing, and housing IS the footprint", () => {
    const f = game.config().food();
    // startPopulation 2000 ≥ 0.9 × housingBase 2000 → pressed from tick one.
    for (let i = 0; i < 300; i++) game.executeNextTick();
    const cityTiles = Math.round(player.urbanArea());
    expect(cityTiles).toBeGreaterThan(0);
    const housing = f.housingBase + cityTiles * f.popPerDensity;
    expect(game.config().maxTroops(player)).toBe(housing);
    // Growth is gated: the city never runs far ahead of its people.
    expect(player.foodFlow().population).toBeGreaterThan(0.4 * housing);
    // And the population actually grew past the base ceiling.
    expect(player.foodFlow().population).toBeGreaterThan(f.housingBase);
  });

  test("city tiles are contiguous with the nuclei and never on fields", () => {
    for (let i = 0; i < 300; i++) game.executeNextTick();
    const painted = new Set(
      Array.from(player.densityEntries()).map(([t]) => t),
    );
    expect(painted.size).toBeGreaterThan(1);
    for (const t of painted) {
      expect(player.isFieldTile(t)).toBe(false);
      if (t === player.core()) continue;
      const touches = game
        .neighbors(t)
        .some((n) => painted.has(n) || n === player.core());
      expect(touches).toBe(true);
    }
  });

  test("the city persists through a population collapse (unbound-organic-growth)", () => {
    for (let i = 0; i < 300; i++) game.executeNextTick();
    const before = Math.round(player.urbanArea());
    expect(before).toBeGreaterThan(2);
    // Decimate the population but keep it above zero — a permanent city keeps
    // every tile (only conquest / death removes ground).
    player.removeTroops(Math.floor(player.troops() * 0.9));
    for (let i = 0; i < 300; i++) game.executeNextTick();
    expect(Math.round(player.urbanArea())).toBeGreaterThanOrEqual(before);
  });

  test("losing ground is the only thing that shrinks a city", () => {
    for (let i = 0; i < 300; i++) game.executeNextTick();
    const before = Math.round(player.urbanArea());
    expect(before).toBeGreaterThan(2);
    // Give up some city tiles (the ownership-change path) → they leave the city.
    const drop: number[] = [];
    for (const [t] of player.densityEntries()) {
      if (t === player.core()) continue;
      drop.push(t);
      if (drop.length >= 3) break;
    }
    for (const t of drop) player.relinquish(t);
    expect(drop.length).toBeGreaterThan(0);
    expect(Math.round(player.urbanArea())).toBeLessThan(before);
  });
});

describe("suitability shapes the city", () => {
  test("the city grows into high-suitability ground first", async () => {
    // A dry, hot stripe west of the core (low fertility → low suitability);
    // normal rich land east. The young city should lean east.
    const splitFill: LayersFill = (n, x) =>
      x < 27
        ? n === "temperature"
          ? 250
          : n === "crop" || n === "humidity" || n === "water"
            ? 20
            : 20
        : n === "temperature"
          ? 166
          : 255;
    const game = await layeredGame(splitFill);
    const player = game.player(founderInfo.id);
    own(game, player, 20, 20, 15);
    player.setCore(game.ref(27, 27));
    player.buildUnit(UnitType.Farmland, game.ref(31, 31), {});
    game.addExecution(new PlayerExecution(player));
    game.executeNextTick();
    for (let i = 0; i < 200; i++) game.executeNextTick();
    const tiles = Array.from(player.densityEntries()).map(([t]) => t);
    expect(tiles.length).toBeGreaterThan(3);
    const east = tiles.filter((t) => game.x(t) >= 27).length;
    expect(east / tiles.length).toBeGreaterThan(0.7);
  });
});
