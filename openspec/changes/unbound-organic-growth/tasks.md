# Tasks — Unbound organic farm growth + persistent cities

## 1. Unbounded farm fields

- [x] 1.1 `FarmField.ts`: remove the `maxTiles` cap and the two Chebyshev-radius
  guards from growth; a single frontier scan per tick claims the best-fertility
  tiles (perimeter-limited), paced by `fieldGrowthRate × current` via the
  fractional `_fieldCredit`. `farmRadius` stays as the production reference +
  placement spacing only.
- [x] 1.2 `preGrowField`: grow until the starter field feeds the spawn
  population or the frontier is exhausted, bounded by a sanity guard — not by
  the footprint area.
- [x] 1.3 Production (`FoodEconomy.farmProductionMilli`) unchanged in form
  (already per worked tile); update the doc comment (no longer capped at the
  full-footprint amount).

## 2. Persistent cities

- [x] 2.1 `UrbanGrowth.ts`: remove `recedeCity` and `RECEDE_OVER`;
  `cityGrowthTick` only grows toward demand and never shrinks the footprint.
  City tiles are lost only via conquest / death (unchanged).

## 3. Tests

- [x] 3.1 `FarmField.test.ts`: field grows past `(2·farmRadius+1)²` on a large
  fertile expanse and production exceeds `farmOutputMilli`; organic shape holds;
  conquest still evicts worked tiles; a dead farm still clears its field.
- [x] 3.2 `UrbanGrowth.test.ts`: a city keeps its tiles through a population
  collapse (invert the old recede assertion); conquest still removes city tiles.
- [x] 3.3 `FoodEconomy.test.ts` (+ any others): reconcile assertions that
  assumed the footprint cap.

## 4. Verify

- [x] 4.1 tsc + lint; the food-economy test suite passes.
- [x] 4.2 Headless #shell: a farm's field spreads organically well past a 7×7
  square, and a city does not shrink when its population drops.
