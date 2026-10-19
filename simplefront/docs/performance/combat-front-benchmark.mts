import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { AttackExecution } from "../../src/core/execution/AttackExecution.ts";
import { AttackImpl } from "../../src/core/game/AttackImpl.ts";
import { GameMapImpl } from "../../src/core/game/GameMap.ts";

// Freeze the prechange src tree first. Run from the repository root with:
// COMBAT_BASELINE_SRC=/absolute/path/to/src node --import tsx simplefront/docs/performance/combat-front-benchmark.mts
const baseline = process.env.COMBAT_BASELINE_SRC;
if (!baseline)
  throw Error("COMBAT_BASELINE_SRC must point to the prechange src tree");
const { AttackExecution: BeforeExecution } = await import(
  pathToFileURL(`${baseline}/core/execution/AttackExecution.ts`).href
);
const { AttackImpl: BeforeAttack } = await import(
  pathToFileURL(`${baseline}/core/game/AttackImpl.ts`).href
);
const iterations = Number(process.env.COMBAT_ITERATIONS ?? 2000);
const map = new GameMapImpl(1024, 128, new Uint8Array(1024 * 128), 0);
const food = { frontSeepFraction: 0.25 };
const config = { food: () => food };
const mg = { config: () => config };
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[values.length >> 1];
const rows = [];

for (const shape of ["straight", "bent"] as const) {
  const tiles =
    shape === "straight"
      ? Array.from({ length: 512 }, (_, x) => map.ref(x + 100, 64))
      : Array.from({ length: 252 }, (_, i) =>
          map.ref(100 + (Math.floor((i >> 1) / 4) % 8) + (i % 2), (i >> 1) + 1),
        );
  function make(Execution: typeof AttackExecution, Attack: typeof AttackImpl) {
    // Only the real redistribution methods execute; player/game callbacks are unused.
    const attack = new Attack("probe", null!, null!, 0, null, new Set(), null!);
    for (const tile of [...tiles].reverse())
      attack.addTroopsAt(tile, 100 + (tile % 37));
    const execution = new Execution(0, null!, null);
    Object.assign(execution, { attack, map, mg });
    return { attack, seep: () => execution["seep"]() };
  }
  const field = (attack: AttackImpl) => ({
    troops: attack.troops(),
    reserve: attack.reserve(),
    tiles: [...attack.frontTiles()].map((tile) => [
      tile,
      attack.troopsAt(tile),
    ]),
  });
  // Compare every tick before timing, including front insertion order.
  const oldCheck = make(BeforeExecution, BeforeAttack);
  const newCheck = make(AttackExecution, AttackImpl);
  for (let tick = 0; tick < 100; tick++) {
    oldCheck.seep();
    newCheck.seep();
    assert.deepEqual(field(newCheck.attack), field(oldCheck.attack));
  }
  const beforeMs: number[] = [],
    afterMs: number[] = [];
  for (let sample = 0; sample < 7; sample++) {
    // Alternate execution order to reduce warmup and machine drift bias.
    for (const before of sample % 2 ? [false, true] : [true, false]) {
      const probe = before
        ? make(BeforeExecution, BeforeAttack)
        : make(AttackExecution, AttackImpl);
      for (let i = 0; i < 200; i++) probe.seep();
      const start = performance.now();
      for (let i = 0; i < iterations; i++) probe.seep();
      const elapsed = performance.now() - start;
      (before ? beforeMs : afterMs).push(elapsed);
    }
  }
  const row = {
    shape,
    tiles: tiles.length,
    iterations,
    beforeMs,
    afterMs,
    beforeMedianMs: median(beforeMs),
    afterMedianMs: median(afterMs),
    speedup: median(beforeMs) / median(afterMs),
  };
  rows.push(row);
  console.log(JSON.stringify(row));
}
writeFileSync(
  process.env.COMBAT_OUTPUT ?? "/tmp/combat-front-benchmark.json",
  JSON.stringify({ node: process.version, rows }, null, 2),
);
