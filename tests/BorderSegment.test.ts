import { describe, expect, test } from "vitest";
import { borderSegment } from "../src/core/execution/utils/BorderSegment";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { setup } from "./util/Setup";

const info = new PlayerInfo("aimer", PlayerType.Human, null, "aimer");

/**
 * Aiming a concentrated push (add-urban-core-growth): the nearest point of the
 * player's border follows the cursor, and cursor distance sets the breadth —
 * near the border is broad, far into enemy land is a pointed spearhead.
 */
describe("borderSegment (concentrated-push aiming)", () => {
  let game: Game;
  let player: Player;

  const seg = (cx: number, cy: number, opts = {}) =>
    borderSegment(
      Array.from(player.borderTiles()),
      cx,
      cy,
      (t) => game.x(t),
      (t) => game.y(t),
      opts,
    );

  test("near the border → wide; far into enemy land → narrow, both centred on the cursor", async () => {
    game = await setup("plains", { instantBuild: true }, [info]);
    player = game.player(info.id);
    // Own a 10-wide, 40-tall block; the x=9 edge is the border.
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 10; x++) player.conquer(game.ref(x, y));

    // Cursor just past the border (x=11), at y=20 → BROAD segment.
    const near = seg(11, 20)!;
    // Cursor deep into enemy land (x=45), same y → POINTED segment.
    const far = seg(45, 20)!;

    expect(near.width).toBeGreaterThan(far.width);
    expect(far.width).toBeLessThanOrEqual(4); // a spearhead
    expect(near.width).toBeGreaterThan(20); // a broad front

    // Both centred on the border point nearest the cursor (~y=20).
    expect(Math.abs(game.y(near.centerTile) - 20)).toBeLessThan(3);
    expect(Math.abs(game.y(far.centerTile) - 20)).toBeLessThan(3);

    // The wide segment's tiles span a taller stretch of the border than the
    // narrow one.
    const spread = (s: typeof near) => {
      let lo = 40;
      let hi = 0;
      for (const t of s.sourceTiles) {
        lo = Math.min(lo, game.y(t));
        hi = Math.max(hi, game.y(t));
      }
      return hi - lo;
    };
    expect(spread(near)).toBeGreaterThan(spread(far));
  });

  test("cursor at the border throws (nearly) the WHOLE front forward", async () => {
    game = await setup("plains", { instantBuild: true }, [info]);
    player = game.player(info.id);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 10; x++) player.conquer(game.ref(x, y));

    const borderLen = Array.from(player.borderTiles()).length;
    // Cursor right on the border (x=9, y=20): breadth should reach nearly the
    // entire border — parity with the bots' whole-border push, which the old
    // 40-tile cap made unreachable on a long front.
    const wide = seg(9, 20)!;
    expect(wide.width).toBeGreaterThan(borderLen * 0.8);
  });

  test("the segment recenters as the cursor moves along the border", async () => {
    game = await setup("plains", { instantBuild: true }, [info]);
    player = game.player(info.id);
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 10; x++) player.conquer(game.ref(x, y));

    const top = seg(11, 5)!;
    const bottom = seg(11, 34)!;
    expect(game.y(top.centerTile)).toBeLessThan(game.y(bottom.centerTile));
    expect(Math.abs(game.y(top.centerTile) - 5)).toBeLessThan(3);
    expect(Math.abs(game.y(bottom.centerTile) - 34)).toBeLessThan(3);
  });

  test("no border → null", () => {
    expect(
      borderSegment(
        [],
        0,
        0,
        () => 0,
        () => 0,
      ),
    ).toBeNull();
  });
});
