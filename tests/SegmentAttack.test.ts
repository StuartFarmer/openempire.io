import { describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { Game, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { TileRef } from "../src/core/game/GameMap";
import { setup } from "./util/Setup";

const info = new PlayerInfo("attacker", PlayerType.Human, null, "atk");

/**
 * Concentrated segment push (add-urban-core-growth): an attack seeded from a
 * chosen stretch of the border ("drag along the border") drives deep and local
 * there, instead of the classic whole-border advance that smears the same
 * troops across the entire front.
 */
async function runAttack(
  segment: ((game: Game) => TileRef[]) | null,
  ticks: number,
): Promise<{ count: number; minY: number; maxY: number }> {
  const game = await setup("plains", { instantBuild: true }, [info]);
  const player = game.player(info.id);
  // Own a 10-wide, 30-tall block; the whole x=9 edge borders neutral land.
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < 10; x++) player.conquer(game.ref(x, y));
  player.setTroops(50_000);

  const sources = segment ? segment(game) : null;
  game.addExecution(
    new AttackExecution(
      20_000,
      player,
      game.terraNullius().id(),
      null,
      true,
      sources,
    ),
  );
  for (let i = 0; i < ticks; i++) game.executeNextTick();

  let count = 0;
  let minY = 30;
  let maxY = -1;
  for (const t of player.tiles()) {
    if (game.x(t) >= 10) {
      count++;
      minY = Math.min(minY, game.y(t));
      maxY = Math.max(maxY, game.y(t));
    }
  }
  return { count, minY, maxY };
}

describe("Concentrated segment push (add-urban-core-growth)", () => {
  test("a segment push stays a local salient; the whole-border push spreads", async () => {
    // Push only from a 5-tile stretch of the border, centred on y=15.
    const segment = await runAttack(
      (game) => [13, 14, 15, 16, 17].map((y) => game.ref(9, y)),
      25,
    );
    const wholeBorder = await runAttack(null, 25);

    // Both actually advanced into neutral land.
    expect(segment.count).toBeGreaterThan(5);
    expect(wholeBorder.count).toBeGreaterThan(5);

    // The segment push is a LOCAL salient centred on the chosen stretch…
    const segmentSpread = segment.maxY - segment.minY;
    const mid = (segment.minY + segment.maxY) / 2;
    expect(Math.abs(mid - 15)).toBeLessThan(8);

    // …far narrower than the whole-border advance, which touches the whole
    // 30-tall front.
    const wholeSpread = wholeBorder.maxY - wholeBorder.minY;
    expect(segmentSpread).toBeLessThan(wholeSpread);
    expect(wholeSpread).toBeGreaterThan(25); // ~the full front
  });

  test("with the SAME troops, the segment push drives DEEPER", async () => {
    // Same 20k troops, same 25 ticks: concentrated on 5 tiles vs the whole edge.
    const depth = async (segment: ((g: Game) => TileRef[]) | null) => {
      const g = await setup("plains", { instantBuild: true }, [info]);
      const p = g.player(info.id);
      for (let y = 0; y < 30; y++)
        for (let x = 0; x < 10; x++) p.conquer(g.ref(x, y));
      p.setTroops(50_000);
      g.addExecution(
        new AttackExecution(
          20_000,
          p,
          g.terraNullius().id(),
          null,
          true,
          segment ? segment(g) : null,
        ),
      );
      for (let i = 0; i < 25; i++) g.executeNextTick();
      let maxX = 9;
      for (const t of p.tiles()) maxX = Math.max(maxX, g.x(t));
      return maxX - 9; // tiles of penetration past the border
    };

    const segmentDepth = await depth((g) =>
      [13, 14, 15, 16, 17].map((y) => g.ref(9, y)),
    );
    const wholeDepth = await depth(null);
    expect(segmentDepth).toBeGreaterThan(wholeDepth);
  });
});
