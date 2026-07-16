# Spec: sim-tuning-panel

## ADDED Requirements

### Requirement: Tuning intent mutates the live sim deterministically

The game SHALL accept a `tune_food_config` intent carrying one known `FoodConfig` key and a finite, non-negative numeric value. The intent SHALL flow through the standard Intent → Turn → Execution pipeline and apply the value as a config override before the next economy tick, so identical turn logs (replays) reproduce identical tuned games. Unknown keys or non-finite values SHALL be rejected at schema validation.

#### Scenario: Override changes the sim

- **WHEN** a `tune_food_config` intent sets `farmProductionMilli` to a new value mid-game
- **THEN** from the next tick, farm production is computed with the new value and `game.config().food().farmProductionMilli` reports it

#### Scenario: Invalid key rejected

- **WHEN** an intent arrives with a key that is not a `FoodConfig` member or a value that is not a finite number ≥ 0
- **THEN** the intent fails validation and no config change occurs

#### Scenario: Replay reproduces a tuned game

- **WHEN** the same seeded game is replayed from a turn log containing tuning intents
- **THEN** the sim state matches the original run tick-for-tick

### Requirement: Config exposes an override layer over defaults

`Config` SHALL merge per-key food overrides over `FOOD_DEFAULTS` in `food()`, expose `setFoodOverride(key, value)`, and report defaults when no override is set. Test configs layering on top of `food()` (e.g. the inert-food test config) SHALL keep working unchanged.

#### Scenario: Unset knobs stay at defaults

- **WHEN** one knob is overridden
- **THEN** every other `food()` value equals its `FOOD_DEFAULTS` value

### Requirement: Tuning panel in the top-left panel group

The HUD SHALL offer a tuning panel toggled from `GameLeftSidebar` alongside the leaderboard and econ-chart toggles, rendered in the same top-left area. The panel SHALL list every `FoodConfig` knob grouped by concern, show the current effective value, mark overridden knobs visually, and offer per-knob reset and reset-all (both emitting intents that restore default values). Edits SHALL be debounced before emitting intents.

#### Scenario: Edit a knob from the panel

- **WHEN** the player opens the tuning panel and changes a knob's value
- **THEN** a `tune_food_config` intent is sent (after debounce), the row is marked as modified, and the sim uses the new value

#### Scenario: Reset all

- **WHEN** the player activates reset-all with three knobs modified
- **THEN** three intents restoring the default values are sent and no row remains marked as modified
