# Proposal: add-sim-tuning-panel

## Why

Every economy knob lives in `Config.food()` (~55 values), but tuning them requires editing `Config.ts` or running the headless balance harness — there is no way to feel a knob change in a live game. The owner wants to tune parameters while playing, from the same top-left panel area as the leaderboard and econ chart.

## What Changes

- New **tuning panel** in the top-left panel group: a third toggle button in `GameLeftSidebar` (next to leaderboard and econ chart) opens a panel listing every `FoodConfig` knob, grouped by concern, with editable values, modified-state highlighting, and per-knob / global reset.
- New **`tune_food_config` intent** (zod-validated key/value pairs restricted to known `FoodConfig` keys): edits travel through the normal Intent → Turn → Execution pipeline, so the sim change is deterministic and captured in the turn log (replays reproduce tuned games).
- `Config` gains a **food-override layer**: `setFoodOverrides(partial)` merges over `FOOD_DEFAULTS`; `food()` returns the merged view. The client mirrors the override onto its own `Config` when the intent is sent so HUD math (`maxTroops` display etc.) matches the sim.
- Overrides are session-scoped (a new game starts at defaults). No persistence in v1.

## Capabilities

### New Capabilities

- `sim-tuning-panel`: In-game, live editing of the food-economy config with deterministic propagation to the simulation.

### Modified Capabilities

_None — no existing requirement changes; the panel is additive and defaults are untouched when it is unused._

## Impact

- **Core**: `Schemas.ts` (intent), `ExecutionManager.ts` (dispatch), new `TuneFoodConfigExecution`, `Config.ts` (`setFoodOverrides` + merged `food()`).
- **Client**: new `hud/layers/TuningPanel.ts`, `GameLeftSidebar.ts` (third toggle), `Transport.ts` (send intent), `GameRenderer.ts` + `index.html` (wiring), en.json keys.
- **Tests**: intent round-trip through the sim (override visibly changes a tick outcome), zod rejection of unknown keys, reset behavior. `TestConfig`'s inert-food layering must still win in tests.
