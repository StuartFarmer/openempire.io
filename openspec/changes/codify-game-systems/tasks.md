# Tasks — Codify a system as a self-contained game

## 1. The shared WESL library (`shared::`)

- [x] 1.1 Create `src/client/lab/shared/` with a WESL glob index; wire the compiler (`compileFieldSystem`) to link the shared tree as the `shared::` package for every layer/view/derivation pass. Verify the wesl-js `link` library API supports a named package; if not, fall back to `package::shared::*` aliasing (design §shared/linking). Add a compiler test: a system importing `shared::` links.
- [x] 1.2 Seed `shared::combat` (`defenseOf`, `conquers` with hysteresis margin) and `shared::pack` (`packClaim`/`unpackAttacker`/`unpackPressure`) — the canonical, parameterized versions.
- [x] 1.3 Seed `shared::diffusion` (`blend`/relax step), `shared::growth` (`logistic`/`decay`/`grow`), `shared::palette` (ramp/biome helpers), `shared::noise` (`hash01`/`fbm` re-export).
- [ ] 1.4 Shared TS fragments (`src/client/lab/shared/index.ts`): the `PLAYER_INTENT` player-field set, common param presets, and reusable AI helpers (`nearestEnemyAI`).

## 2. The System contract

- [ ] 2.1 `FieldSystem` gains JSON-safe metadata: `description`, `kind`, `renderer`, `defaultMap`, `defaultView`. `CompiledFieldSystem` surfaces them.
- [ ] 2.2 `FieldSystem.input?: SystemInput` (`onTile`/`onKey`/`cursor`) + the `InputContext` (`stamp`/`setPlayer`/`localPlayer`/dims/running); typed, additive.
- [ ] 2.3 `FieldSystem.ai?: SystemAI` (`cadenceTicks`, `decide(ctx)`) + the `AIContext` (`scalars`/`tick`/`rand`/`setPlayer`/`localPlayer`/dims); typed, additive.

## 3. Viewer drives the hooks

- [ ] 3.1 `FieldViewerBase`: remove the hardcoded `writeBots`; add an AI scheduler that builds an `AIContext`, calls `system.ai.decide` on `cadenceTicks`, and flushes accumulated intents via `writePlayers`.
- [ ] 3.2 `FieldViewerBase`: route pointer/key events to `system.input` when present (camera-transformed tile coords via an `InputContext`); default to today's pan/zoom/hover (camera) / brush-paint (blit) when absent. The hook signals whether it consumed the gesture (so unhandled drags still pan).
- [ ] 3.3 Read `renderer`/`defaultMap`/`defaultView` on mount.

## 4. Adopt in the existing systems

- [ ] 4.1 empire + territory: import `shared::combat`/`shared::pack`; delete their private `combat.wesl`; confirm identical behavior (screenshot the fronts).
- [ ] 4.2 empire + territory: add `kind: "game"`, `players: PLAYER_INTENT`, an `ai` hook (the relocated toy bot, now per-system), and an `input` hook (click a tile → set the local player's target/attack).
- [ ] 4.3 terrain/world/settlement/grazing: set `kind`/`renderer`/`defaultMap`/`defaultView` metadata; confirm no behavior change.

## 5. Docs + verification

- [ ] 5.1 `docs/FieldDynamics.md`: add the "System = self-contained game" section (metadata, `input`, `ai`, `shared::`, the common-concepts inventory).
- [ ] 5.2 Full tsc + lint clean; FieldDynamics tests pass; `#lab` and `#shell` verified across all systems (a `game` system's click-to-command + AI actually move the front; `study` systems unchanged); `#webgpu` generator unaffected.
