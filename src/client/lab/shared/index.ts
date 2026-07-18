import type { AIContext, FieldPlayersSpec } from "../../webgpu/FieldDynamics";

// The shared library (codify-game-systems): a cross-system WESL package plus
// reusable TS manifest fragments. The WESL modules are linked into every
// system's compile as the `shared::` package (see compileFieldSystem), so any
// layer/view/pass can `import shared::combat::conquers;` without copying it.

/** The `shared::` WESL package — one WeslBundle linked into every system.
 * Keys are package-root-relative paths (`./combat.wesl` → `shared::combat`). */
export const SHARED_WESL = {
  name: "shared",
  edition: "unstable_2025_1",
  modules: import.meta.glob("./*.wesl", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
};

/** The standard per-player intent fields a game system's players read via
 * `players::val(p)`; written by the system's `input` (local player) and `ai`
 * (bots) hooks. `alive` slot 0 is neutral by convention. */
export const PLAYER_INTENT_FIELDS = {
  alive: "u32",
  attacking: "u32",
  commit: "f32",
  targetX: "f32",
  targetY: "f32",
} as const satisfies FieldPlayersSpec["fields"];

/** A players block with the standard intent fields for `count` slots. */
export function playerIntent(count: number): FieldPlayersSpec {
  return { count, fields: { ...PLAYER_INTENT_FIELDS } };
}

/**
 * A reusable bot driver for the standard `PLAYER_INTENT_FIELDS`: every alive
 * non-human player attacks toward a wandering target, at the given commit. A
 * placeholder for "sensible default aggression" that game systems can drop in
 * (`ai: { decide: (ctx) => nearestEnemyAI(ctx) }`) and refine later; it reads
 * no map state yet, jittering targets from the tick-seeded rng so the front
 * keeps moving. Slot 0 is neutral by convention and is left dormant.
 */
export function nearestEnemyAI(
  ctx: AIContext,
  opts: { commit?: number } = {},
): void {
  const commit = opts.commit ?? 0.6;
  for (let p = 1; p < ctx.playerCount; p += 1) {
    if (p === ctx.localPlayer) continue;
    ctx.setPlayer(p, {
      alive: 1,
      attacking: 1,
      commit,
      targetX: ctx.rand() * ctx.mapWidth,
      targetY: ctx.rand() * ctx.mapHeight,
    });
  }
}
