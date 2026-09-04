# Design: add-sim-tuning-panel

## Context

The sim runs in a Web Worker; the only sanctioned way to change sim state is an Intent bundled into a Turn (`Schemas.ts` → `LocalServer` → worker → `ExecutionManager` → Execution). `Config.food()` currently returns the `FOOD_DEFAULTS` literal. The balance harness already proves the override shape works (`SweepConfig` spreads a `Partial<FoodConfig>` over defaults). The top-left HUD group is `GameLeftSidebar` (toggle buttons) showing `Leaderboard` / `TeamStats` / `EconPanel`.

## Goals / Non-Goals

**Goals:**

- Live-tune any numeric `FoodConfig` knob mid-game and see the sim respond next tick.
- Deterministic and replay-safe: the change is an intent in the turn log, not a side channel.
- The panel sits in the top-left toggle group, per the owner's request.

**Non-Goals:**

- Tuning `AI_DIFFICULTY`, render settings (Tweakpane already covers those), or unit costs outside `FoodConfig`.
- Persistence across games (copy-by-hand into `Config.ts` when a tuning session finds good values; the panel shows modified values to make that easy).
- Multiplayer authorization concerns (singleplayer fork; if multiplayer returns, gate the intent on host).

## Decisions

### D1: Intent, not a worker side-channel

A `tune_food_config` intent (`{ key, value }`, one knob per intent) mirrors `food_allocation`. Rationale: it is ordered with the turn stream, recorded for replays, and needs zero new transport plumbing. Alternative — postMessage straight to the worker — rejected: breaks replay determinism and bypasses validation. One-knob-per-intent keeps the schema trivial and the turn log readable; the panel debounces per-knob edits (300 ms) so sliders don't flood turns.

### D2: Key allowlist in zod, values clamped

The schema validates `key` against `z.enum(FOOD_TUNABLE_KEYS)` — the literal key list of `FoodConfig` (all values are numbers) — and `value: z.number().finite()`. The execution additionally clamps to `>= 0` (every current knob is non-negative) and ignores unknown keys defensively. No knob is interpreted as code; worst case is a weird economy.

### D3: Override layer on Config

`Config` gets `private _foodOverrides: Partial<FoodConfig>` + `setFoodOverride(key, value)` / `clearFoodOverrides()`; `food()` returns a cached merge invalidated on write. `TestConfig`'s inert-food override composes on top (it spreads over `super.food()`), so tests are unaffected. The sim-side Config is updated by `TuneFoodConfigExecution`; the client-side Config is updated optimistically by the panel when it emits the intent (cosmetic only — HUD numbers like capacity match the sim a tick early).

### D4: Panel placement and shape

Third toggle in `GameLeftSidebar` (sliders icon), mutually exclusive with leaderboard/econ like the existing toggles. The panel is a new Lit element `tuning-panel` rendered in the same top-left container: grouped rows (Consumption, Production, Farms, Population, Demographics, Urban, Storage, Costs, Supply & War, Scale) — group metadata lives in the panel, values come from `game.config().food()` so it always shows effective values. A modified knob shows an amber dot + its default in the tooltip and a per-row reset; a header Reset-All emits reset intents for every modified key.

### D5: Reset semantics

Reset = send the intent with the default value (from a `FOOD_DEFAULTS` export), not a special message — keeps the wire format single-shape and the turn log self-describing.

## Risks / Trade-offs

- [Mid-game knob edits can crash-feed or starve a running economy] → intended; it is a sandbox tool. The panel is not gated behind a dev flag per owner request.
- [Client/worker Config briefly diverge (intent lands next turn)] → cosmetic only; the optimistic client write makes HUD math consistent with what the sim is about to use.
- [Knob typed as integer used with fractional value (e.g. `decayDenom`)] → values pass through as given; the sim already floors where integer math requires it.

## Open Questions

- None blocking. Future: persistence profile + "export as `--override` flags" copy button for the balance harness.
