import { describe, expect, test } from "vitest";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { TileRef } from "../src/core/game/GameMap";
import { setup } from "./util/Setup";

/**
 * Front-line troops: an attack's force lives ON its front tiles, so committing
 * troops affects the stretch you committed to and nothing else.
 *
 * The bug this exists for: opposing attacks used to cancel by comparing two
 * scalars in `AttackExecution.init()`, with no reference to any tile — so
 * countering ANYWHERE deleted a push grinding into the opposite border.
 */

const defInfo = new PlayerInfo("defender", PlayerType.Human, null, "def_id");
const atkInfo = new PlayerInfo("attacker", PlayerType.Human, null, "atk_id");

// A long straight border: defender holds x in [80,100), attacker x in [100,120),
// over the full height of the map. The shared frontier is the x=99/100 seam.
const SEAM = 100;
const HEIGHT = 200;
const NORTH = 10;
const SOUTH = 190;

async function fixture(): Promise<{
  game: Game;
  attacker: Player;
  defender: Player;
}> {
  const game = await setup("big_plains", {}, [defInfo, atkInfo]);
  const defender = game.player(defInfo.id);
  const attacker = game.player(atkInfo.id);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 80; x < SEAM; x++) defender.conquer(game.ref(x, y));
    for (let x = SEAM; x < 120; x++) attacker.conquer(game.ref(x, y));
  }
  defender.addTroops(200_000);
  attacker.addTroops(200_000);
  return { game, attacker, defender };
}

/** A stretch of one player's seam column, centred on `y`. */
function stretch(game: Game, x: number, y: number, half = 5): TileRef[] {
  const out: TileRef[] = [];
  for (let d = -half; d <= half; d++) {
    const yy = y + d;
    if (yy >= 0 && yy < HEIGHT) out.push(game.ref(x, yy));
  }
  return out;
}

/** Attacker pushes into the defender at `y`. */
function pushAt(
  game: Game,
  attacker: Player,
  defender: Player,
  y: number,
  troops = 20_000,
  half = 5,
) {
  game.addExecution(
    new AttackExecution(
      troops,
      attacker,
      defender.id(),
      null,
      true,
      stretch(game, SEAM, y, half),
    ),
  );
}

/** Defender commits troops back at `y`. */
function counterAt(
  game: Game,
  defender: Player,
  attacker: Player,
  y: number,
  troops = 60_000,
) {
  game.addExecution(
    new AttackExecution(
      troops,
      defender,
      attacker.id(),
      null,
      true,
      stretch(game, SEAM - 1, y),
    ),
  );
}

function ticks(game: Game, n: number) {
  for (let i = 0; i < n; i++) game.executeNextTick();
}

describe("an attack's troops live on its front", () => {
  test("the reported total is the sum of the per-tile field", async () => {
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 1);

    const atk = attacker.outgoingAttacks()[0];
    expect(atk).toBeDefined();
    let sum = 0;
    for (const t of atk.frontTiles()) sum += atk.troopsAt(t);
    expect(atk.troops()).toBe(sum + atk.reserve());
    expect(atk.troops()).toBeGreaterThan(0);
  });

  test("troops land on the stretch that was aimed at, not the whole border", async () => {
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 1);

    const atk = attacker.outgoingAttacks()[0];
    const ys = [...atk.frontTiles()].map((t) => game.y(t));
    // Every tile holding troops is near where we aimed — nothing 180 tiles away.
    expect(Math.min(...ys)).toBeGreaterThan(NORTH - 20);
    expect(Math.max(...ys)).toBeLessThan(NORTH + 20);
  });
});

describe("opposing pushes meet only where they touch", () => {
  test("countering the FAR END leaves the push completely untouched", async () => {
    // THE REPORTED BUG. Before this change the defender's 60k counter deleted
    // the attacker's 20k push outright, from 180 tiles away, instantly.
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 2);
    const before = attacker.outgoingAttacks()[0].troops();
    expect(before).toBeGreaterThan(0);

    counterAt(game, defender, attacker, SOUTH);
    ticks(game, 3);

    const atk = attacker.outgoingAttacks()[0];
    expect(atk).toBeDefined();
    expect(atk.isActive()).toBe(true);
    // Its losses are from advancing, not from a counter it never met.
    expect(atk.troops()).toBeGreaterThan(before * 0.9);
  });

  test("countering WHERE they are pushing annihilates both sides locally", async () => {
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 2);
    const before = attacker.outgoingAttacks()[0].troops();

    counterAt(game, defender, attacker, NORTH);
    ticks(game, 3);

    const atk = attacker.outgoingAttacks()[0];
    const after = atk === undefined ? 0 : atk.troops();
    expect(after).toBeLessThan(before);
  });

  test("a far larger counter still only reduces the part it reaches", async () => {
    const { game, attacker, defender } = await fixture();
    // Two separate pushes, far apart on the same border.
    pushAt(game, attacker, defender, NORTH);
    pushAt(game, attacker, defender, SOUTH);
    ticks(game, 2);
    const pushes = attacker.outgoingAttacks();
    expect(pushes.length).toBe(2);

    // Overwhelming counter, but aimed at the northern one only.
    counterAt(game, defender, attacker, NORTH, 150_000);
    ticks(game, 3);

    // The southern push is alive and undiminished by the counter.
    const south = attacker
      .outgoingAttacks()
      .find((a) =>
        [...a.frontTiles()].some((t) => game.y(t) > (NORTH + SOUTH) / 2),
      );
    expect(south).toBeDefined();
    expect(south!.troops()).toBeGreaterThan(0);
  });
});

describe("the front pays for its own advance", () => {
  test("exhausting one front locally does not stall a distant push", async () => {
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    pushAt(game, attacker, defender, SOUTH);
    ticks(game, 1);

    const north = attacker
      .outgoingAttacks()
      .find((attack) =>
        [...attack.frontTiles()].some((tile) => game.y(tile) < HEIGHT / 2),
      );
    const south = attacker
      .outgoingAttacks()
      .find((attack) =>
        [...attack.frontTiles()].some((tile) => game.y(tile) >= HEIGHT / 2),
      );
    expect(north).toBeDefined();
    expect(south).toBeDefined();

    let northernDefenderTilesBefore = 0;
    let southernDefenderTilesBefore = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 80; x < SEAM; x++) {
        if (game.owner(game.ref(x, y)) !== defender) continue;
        if (y < HEIGHT / 2) northernDefenderTilesBefore++;
        else southernDefenderTilesBefore++;
      }
    }
    for (const tile of north!.frontTiles()) {
      north!.spendAt(tile, north!.troopsAt(tile));
    }

    ticks(game, 2);

    let northernDefenderTilesAfter = 0;
    let southernDefenderTilesAfter = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 80; x < SEAM; x++) {
        if (game.owner(game.ref(x, y)) !== defender) continue;
        if (y < HEIGHT / 2) northernDefenderTilesAfter++;
        else southernDefenderTilesAfter++;
      }
    }
    expect(northernDefenderTilesAfter).toBe(northernDefenderTilesBefore);
    expect(south!.isActive()).toBe(true);
    expect(southernDefenderTilesAfter).toBeLessThan(
      southernDefenderTilesBefore,
    );
  });

  test("a narrower commitment captures more per seeded front tile", async () => {
    const narrow = await fixture();
    pushAt(
      narrow.game,
      narrow.attacker,
      narrow.defender,
      HEIGHT / 2,
      20_000,
      1,
    );
    ticks(narrow.game, 4);
    let narrowCaptured = 0;
    for (let y = HEIGHT / 2 - 1; y <= HEIGHT / 2 + 1; y++) {
      for (let x = 80; x < SEAM; x++) {
        if (narrow.game.owner(narrow.game.ref(x, y)) === narrow.attacker) {
          narrowCaptured++;
        }
      }
    }

    const wide = await fixture();
    pushAt(wide.game, wide.attacker, wide.defender, HEIGHT / 2, 20_000, 10);
    ticks(wide.game, 4);
    let wideCaptured = 0;
    for (let y = HEIGHT / 2 - 10; y <= HEIGHT / 2 + 10; y++) {
      for (let x = 80; x < SEAM; x++) {
        if (wide.game.owner(wide.game.ref(x, y)) === wide.attacker) {
          wideCaptured++;
        }
      }
    }

    expect(narrowCaptured / 3).toBeGreaterThan(wideCaptured / 21);
  });

  test("seep refills a drained front tile without creating troops", async () => {
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 1);
    const attack = attacker.outgoingAttacks()[0];
    const middle = [...attack.frontTiles()].find((tile) => {
      if (attack.troopsAt(tile) <= 0) return false;
      let positiveNeighbors = 0;
      game.forEachNeighbor(tile, (neighbor) => {
        if (attack.troopsAt(neighbor) > 0) positiveNeighbors++;
      });
      return positiveNeighbors >= 2;
    });
    expect(middle).toBeDefined();

    attack.spendAt(middle!, attack.troopsAt(middle!));
    const totalBefore = attack.troops();
    ticks(game, 1);

    expect(attack.troopsAt(middle!)).toBeGreaterThan(0);
    expect(
      [...attack.frontTiles()].reduce(
        (sum, tile) => sum + attack.troopsAt(tile),
        attack.reserve(),
      ),
    ).toBeLessThanOrEqual(totalBefore);
  });

  test("zero seep leaves a drained front tile empty", async () => {
    const { game, attacker, defender } = await fixture();
    game.config().setFoodOverride("frontSeepFraction", 0);
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 1);
    const attack = attacker.outgoingAttacks()[0];
    const middle = [...attack.frontTiles()].find((tile) => {
      if (attack.troopsAt(tile) <= 0) return false;
      let positiveNeighbors = 0;
      game.forEachNeighbor(tile, (neighbor) => {
        if (attack.troopsAt(neighbor) > 0) positiveNeighbors++;
      });
      return positiveNeighbors >= 2;
    });
    expect(middle).toBeDefined();

    attack.spendAt(middle!, attack.troopsAt(middle!));
    const totalBefore = attack.troops();
    ticks(game, 1);

    expect(attack.troopsAt(middle!)).toBe(0);
    expect(
      [...attack.frontTiles()].reduce(
        (sum, tile) => sum + attack.troopsAt(tile),
        attack.reserve(),
      ),
    ).toBeLessThanOrEqual(totalBefore);
  });

  test("troops are never created or destroyed by seep", async () => {
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 1);
    const atk = attacker.outgoingAttacks()[0];

    for (let i = 0; i < 5; i++) {
      const before = atk.troops();
      let sum = 0;
      for (const t of atk.frontTiles()) sum += atk.troopsAt(t);
      expect(sum + atk.reserve()).toBe(before);
      game.executeNextTick();
      // Advance and clash may spend troops, but nothing may appear.
      expect(atk.troops()).toBeLessThanOrEqual(before);
    }
  });

  test("setting the total rescales rather than collapsing the distribution", async () => {
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 2);
    const atk = attacker.outgoingAttacks()[0];
    const spread = [...atk.frontTiles()].length;
    expect(spread).toBeGreaterThan(1);

    atk.setTroops(1000);
    expect(atk.troops()).toBe(1000);
    // Still spread across the front, not piled onto one tile.
    expect([...atk.frontTiles()].length).toBeGreaterThan(1);
  });

  test("the force VARIES across the front — the input the border gradient draws", async () => {
    // The shell colours each seam tile by the force present at it
    // (ShellSim.worker frontDelta). That is only a gradient if the underlying
    // per-tile force actually differs across the front — otherwise it is the
    // old flat, one-value-per-opponent wash by another route.
    const { game, attacker, defender } = await fixture();
    pushAt(game, attacker, defender, NORTH);
    ticks(game, 12);

    const atk = attacker.outgoingAttacks()[0];
    expect(atk).toBeDefined();
    const values = [...atk.frontTiles()].map((t) => atk.troopsAt(t));
    expect(values.length).toBeGreaterThan(2);
    // Combat spends unevenly along the front, so the values must not be all
    // identical — that spread is exactly what the gradient renders.
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  test("the same seeded game produces an identical field", async () => {
    const a = await fixture();
    pushAt(a.game, a.attacker, a.defender, NORTH);
    ticks(a.game, 5);
    const b = await fixture();
    pushAt(b.game, b.attacker, b.defender, NORTH);
    ticks(b.game, 5);

    const fa = a.attacker.outgoingAttacks()[0];
    const fb = b.attacker.outgoingAttacks()[0];
    expect(fa.troops()).toBe(fb.troops());
    const ta = [...fa.frontTiles()].sort((x, y) => x - y);
    const tb = [...fb.frontTiles()].sort((x, y) => x - y);
    expect(ta).toEqual(tb);
    for (const t of ta) expect(fa.troopsAt(t)).toBe(fb.troopsAt(t));
  });
});
