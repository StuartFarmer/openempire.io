# Unbound organic farm growth + persistent cities

## Why

`restore-organic-growth` brought back spreading farm fields and demand-gated
city growth, but two of its choices read as artificial in play:

- **Farms are a bounded square.** A field can only grow within Chebyshev
  `farmRadius` of its nucleus (default 3 → a 7×7, 49-tile cap), so a mature farm
  is a hard-edged square that stops growing. The desired feel is a _natural_
  field that spreads organically over the owned land and, in principle, keeps
  growing — the shape following fertility, not a bounding box.
- **Cities recede on their own.** When population dips, the city shrinks itself
  (`recedeCity` past a 1.5× hysteresis band). A built city should be permanent:
  it only loses ground when the enemy takes it (or the nation dies), never by
  quietly un-building itself.

(The old "labor" mechanic the user disliked — farms reverting when
under-worked — was already deleted by `simplify-food-economy`; nothing labor-
shaped remains. This change only lifts the cap and removes self-recession.)

## What Changes

- **Farms spread without a footprint cap.** Remove the `maxTiles` / Chebyshev-
  radius bound from field growth: a farm's field claims the best-fertility
  4-adjacent frontier over owned, unclaimed, passable land with no distance
  limit, so it flows around rivers and coasts and keeps growing as territory
  grows. Growth is paced per tick and self-limited by the field's own perimeter
  (a single frontier scan claims the best tiles), so it stays deterministic and
  efficient. Production is unchanged in form — `farmOutputMilli × Σfertility /
(255 × (2·farmRadius+1)²) × fertilityBonus` — which is already _per worked
  tile_, so a field larger than the old footprint simply yields proportionally
  more; `farmRadius` stays only as the production reference and the placement-
  spacing rule, no longer a growth limit.
- **Cities are permanent.** Remove `recedeCity` and the `RECEDE_OVER`
  hysteresis: `cityGrowthTick` only grows toward demand and never shrinks the
  footprint on population loss. City tiles are lost only to conquest (already
  handled on ownership change) or when the nation dies (population 0). Housing
  therefore stays at the city's high-water mark unless the enemy takes it.

## Capabilities

### Modified Capabilities

- `farm-growth`: the worked field grows organically without a footprint cap
  (radius is a reference/spacing constant, not a bound).
- `city-growth`: a city is persistent — it never recedes on its own; ground is
  lost only to conquest or death.

## Impact

- `src/core/execution/utils/FarmField.ts` — drop the cap + radius guards; a
  single-scan, perimeter-paced frontier grow; `preGrowField` bounded by need
  not by area.
- `src/core/execution/utils/UrbanGrowth.ts` — remove `recedeCity` +
  `RECEDE_OVER`; `cityGrowthTick` grows only.
- Tests: `tests/FarmField.test.ts` (unbounded spread + production past the old
  footprint; conquest still evicts), `tests/UrbanGrowth.test.ts` (city persists
  through a population collapse; conquest still shrinks it), and any
  `FoodEconomy` assertions that assumed the cap.
- No config knobs added or removed (`farmRadius` is repurposed in meaning only).
