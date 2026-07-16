# Tasks: add-sim-tuning-panel

## 1. Core plumbing

- [x] 1.1 Export `FOOD_DEFAULTS` and a `FOOD_TUNABLE_KEYS` literal from `Config.ts`; add `_foodOverrides` + `setFoodOverride(key, value)` with cached merged `food()`
- [x] 1.2 `Schemas.ts`: `TuneFoodConfigIntentSchema` (`key: z.enum(FOOD_TUNABLE_KEYS)`, `value: z.number().finite().min(0)`); add to the intent union
- [x] 1.3 New `TuneFoodConfigExecution` applying the override to `mg.config()`; dispatch case in `ExecutionManager.ts`
- [x] 1.4 Sim tests: override changes production math next tick; other knobs stay default; zod rejects unknown key / negative / NaN; inert-food TestConfig still wins in legacy tests

## 2. Client transport

- [x] 2.1 `SendTuneFoodConfigIntentEvent` + handler in `Transport.ts` (mirror food_allocation); optimistic `setFoodOverride` on the client-side Config

## 3. Tuning panel UI

- [x] 3.1 New `hud/layers/TuningPanel.ts` Lit element: grouped knob rows (Consumption, Production, Farms, Population, Demographics, Urban, Storage, Costs, Supply & War, Scale), numeric inputs with 300 ms debounce, modified-dot + default-in-tooltip, per-row reset, header reset-all
- [x] 3.2 `GameLeftSidebar.ts`: third toggle (sliders icon), mutually exclusive with leaderboard/econ toggles
- [x] 3.3 Wire in `GameRenderer.ts` + `index.html`; en.json keys for the panel title/labels (`TranslationSystem` green)

## 4. Verify

- [x] 4.1 `npm test` green (minus known-failing baseline), lint clean
- [x] 4.2 In-game via run-openfront: open panel, crank `farmProductionMilli`, observe food production jump in the control panel; reset-all restores defaults
