# Codify a system as a self-contained game

## Why

A `FieldDynamics` system already bundles a game's **mechanics, layers, WebGPU, and views** — swap the folder, get a different game. But three things a "self-contained game" needs are still missing or stranded:

- **Inputs beyond painting.** The only declared input is a brush (god-mode paint into a layer). A game needs the player to _command a player_ — click a tile to target it, drag to select, press a key — which means binding pointer/keyboard gestures to the per-player intent channel (`players` struct). Today the shell hardcodes pan/zoom/hover and the lab hardcodes brush-paint; neither is owned by the system.
- **AI.** The bot driver is hardcoded in `FieldViewerBase.writeBots`, assuming one specific set of player fields (`alive/attacking/commit/targetX/targetY`). Every system is stuck with that toy; a new system can't ship its own AI.
- **Shared shaders.** The only cross-system WESL library is `package::kernel` (noise/grid). `package::lib` is _system-local_, so generic, game-agnostic helpers — diffusion, logistic growth, color ramps — get re-implemented per system, with no place to factor them. (System-_specific_ mechanics like each game's combat rules legitimately differ and stay per-system — those are not the target.)

To "create plenty of different systems to try out a bunch of different mechanics," a system must be able to own its inputs and AI, and pull common mechanics from a shared library instead of re-authoring them. This change codifies the full **System = self-contained game** contract and adds the shared library.

## What Changes

- **The `FieldSystem` contract gains self-description + game hooks.** New optional, well-marked fields:
  - **Metadata** (JSON-safe): `description`, `kind: "study" | "game"`, `defaultMap`, `defaultView` — so the viewer hosts a system correctly instead of guessing.
  - **`input`** — a TS hook mapping pointer/keyboard gestures (already camera-transformed to tile coords) to actions: stamp a declared brush, or write the local player's intent fields. Replaces the viewer's hardcoded pointer→paint / pointer→pan handling.
  - **`ai`** — a TS hook (`decide(ctx)`, on a `cadenceTicks` schedule) that reads scalars/tick/rng and writes each non-human player's intent fields. Replaces `FieldViewerBase.writeBots`.
  - The `input`/`ai` hooks are deliberately TS (not JSON-safe) for maximum flexibility; the rest of the manifest (layers, params, scalars, views, brushes, players, metadata) stays JSON-safe, so a hook is a clean "this system needs custom code" boundary.
- **A shared WESL library** — `src/client/lab/shared/**.wesl`, linked into every system's compile as its own **`shared::`** package (the same injection mechanism as `package::kernel`). Authored once, imported as `import shared::growth::logistic;`. It holds only **game-agnostic primitives**, never a specific system's mechanics:
  - `shared::growth` — logistic / decay / carrying-capacity growth
  - `shared::diffusion` — a relax/spread step
  - `shared::palette` — ramp/lerp color helpers
  - (noise/`fbm`/`hash01` stay in `package::kernel`, already everywhere)
  - **NOT** combat/defense/conquest or attack encodings — those are a system's own rules and stay in its `lib/`, even when two systems have similar versions (empire and territory keep their own `combat.wesl`).
- **Shared TS fragments** — a small `src/client/lab/shared/` TS surface: the standard `PLAYER_INTENT` field set, common param presets, and reusable AI helpers (e.g. `nearestEnemyAI`), so systems compose game defaults instead of re-declaring them.
- **The viewer drives the new hooks.** `FieldViewerBase` calls `system.input` on pointer/key events and `system.ai.decide` on cadence (writing through `writePlayers`); `writeBots` and the shell's bespoke pointer→intent code are removed in favor of the system-owned hooks.
- **Docs** — `docs/FieldDynamics.md` gains a "System = self-contained game" section (metadata, input, ai, `shared::`).

## Capabilities

### New Capabilities

- `game-system-contract`: the codified System contract — self-describing metadata (`kind`/`defaultMap`/`defaultView`/`description`), a system-owned `input` hook binding gestures to brushes/player-intents, and a system-owned `ai` hook driving non-human players; the viewer drives both and no longer hardcodes bots or input.
- `shared-wesl-library`: a cross-system WESL library linked as the `shared::` package (plus shared TS fragments), holding only game-agnostic primitives (growth, diffusion, palette); system-specific mechanics (a game's combat/conquest, its attack encoding) stay in that system's `lib/`.

### Modified Capabilities

<!-- unified-field-viewer (unify-field-viewer): the viewer now sources input + AI from the mounted system's hooks instead of hardcoding them; the mount/loop/renderer behavior is otherwise preserved. -->

## Impact

- `src/client/webgpu/FieldDynamics.ts` — `FieldSystem` gains `description`/`kind`/`defaultMap`/`defaultView`/`input`/`ai`; the compiler links the `shared::` package into every system.
- `src/client/viewer/FieldViewerBase.ts` — call `system.input` on pointer/key and `system.ai.decide` on cadence via `writePlayers`; remove the hardcoded `writeBots`.
- `src/client/GameShellPage.ts` / `src/client/FieldLabPage.ts` — pointer handling delegates to the mounted system's `input` hook (falling back to pan/zoom/hover for systems with none); read `defaultMap`/`defaultView`.
- New `src/client/lab/shared/**` — the shared WESL modules + the shared TS fragments; a `shared` index feeding the compiler.
- `src/client/lab/systems/empire/`, `territory/` — keep their own `lib/combat.wesl` (system-specific); gain `kind`/metadata, `players: playerIntent(...)`, and an `ai` hook (the bot driver, now per-system).
- `docs/FieldDynamics.md` — the "System = self-contained game" section.
- No `src/core` changes, no map/sidecar format changes, no game-rule changes to the shipped tribal economy — this is lab/viewer authoring substrate.
