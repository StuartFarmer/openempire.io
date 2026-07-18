# Tasks — Codify a system as a self-contained game

## 1. The shared WESL library (`shared::`)

- [x] 1.1 Create `src/client/lab/shared/` with a WESL glob index; wire the compiler (`compileFieldSystem`) to link the shared tree as the `shared::` package for every layer/view/derivation pass. Verify the wesl-js `link` library API supports a named package; if not, fall back to `package::shared::*` aliasing (design §shared/linking). Add a compiler test: a system importing `shared::` links.
- [x] 1.2 Seed `shared::` with GENERIC primitives only: `shared::growth` (`logistic`/`decay`/`grow`), `shared::diffusion` (`blend`), `shared::palette` (`lerp3`/`ramp3`). System-specific combat/defense/conquest + the attack encoding stay in each system's own `lib/` (empire and territory keep their `combat.wesl`) — similarity between systems is NOT a reason to promote a mechanic to `shared::`.
- [x] 1.3 (folded into 1.2 — noise/`fbm`/`hash01` stay in `package::kernel`, already available to every system.)
- [x] 1.4 Shared TS fragments (`src/client/lab/shared/index.ts`): the `PLAYER_INTENT` player-field set, common param presets, and reusable AI helpers (`nearestEnemyAI`).

## 2. The System contract

- [x] 2.1 `FieldSystem` gains JSON-safe metadata: `description`, `kind`, `defaultMap`, `defaultView` (accessible via `compiled.system`). (No `renderer` hint — every page uses the shared pan/zoom camera.)
- [x] 2.2 `FieldSystem.input?: SystemInput` (`onTile`/`onKey`/`cursor`) + the `InputContext` (`stamp`/`setPlayer`/`localPlayer`/dims/running); typed, additive.
- [x] 2.3 `FieldSystem.ai?: SystemAI` (`cadenceTicks`, `decide(ctx)`) + the `AIContext` (`scalars`/`tick`/`rand`/`setPlayer`/`localPlayer`/dims); typed, additive.

## 3. Viewer drives the hooks

- [x] 3.1 `FieldViewerBase`: remove the hardcoded `writeBots`; add an AI scheduler that builds an `AIContext`, calls `system.ai.decide` on `cadenceTicks`, and flushes accumulated intents via `writePlayers`.
- [x] 3.2 `FieldViewerBase`: route pointer/key events to `system.input` when present (camera-transformed tile coords via an `InputContext`); default to camera pan/zoom/hover (a plain drag stamps the active brush) when absent. The hook signals whether it consumed the gesture (so unhandled drags still pan).
- [x] 3.3 Read `defaultMap`/`defaultView` on system switch. Camera pan/zoom + tile hover live in `FieldViewerBase` (every page), with a `hoverRows` override for rich readouts (terrain's lat/lon/temp/biome).

## 4. Adopt in the existing systems

- [x] 4.1 `shared::` holds only generic primitives (growth/diffusion/palette); empire + territory KEEP their own `lib/combat.wesl` (system-specific — see the shared-wesl-library spec). Confirmed both run on their own combat.
- [x] 4.2 empire + territory: add `kind: "game"` + metadata, `players: playerIntent(5)`, and an `ai` hook (`nearestEnemyAI`, per-system; reproduces the old bots for slots 1..4). Click-to-paint uses the default brush gesture (no bespoke input hook needed).
- [x] 4.3 terrain/world/settlement/grazing: set `kind`/`defaultMap`/`defaultView` metadata; confirm no behavior change.

## 5. Docs + verification

- [x] 5.1 `docs/FieldDynamics.md`: add the "System = self-contained game" section (metadata, `input`, `ai`, `shared::`, the common-concepts inventory).
- [x] 5.2 Full tsc + lint clean; FieldDynamics tests pass; `#lab` and `#shell` verified across all systems (a `game` system's click-to-command + AI actually move the front; `study` systems unchanged); `#webgpu` generator unaffected.
