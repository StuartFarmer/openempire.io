# Tasks — Age of Food

## 1. System scaffold + potential/realized fields

- [x] 1.1 Create `src/client/lab/systems/empire/` and register it in `src/client/lab/systems/index.ts`
- [x] 1.2 `potential` layer: the settlement-ecology food carrying capacity (reuse the settlement crop/food/temperature chain — soil × warmth × moisture-gate × GDD), unowned and seasonal
- [x] 1.3 `owner` (u32) layer: 0 = neutral, else the owning player index; wired to the players struct-buffer for multi-player
- [x] 1.4 `pop` and `troops` realized layers, land-only, tagged by `owner`
- [x] 1.5 `food` store layer: harvest in, `pop+troops` consumption out, seasonal buffer

## 2. Supply + growth + organic expansion

- [x] 2.1 `supply` layer: diffusion from settled cores (`pop` above the settlement threshold), decaying with distance and a terrain cost (cheap river/coast, costly mountain/desert)
- [x] 2.2 `pop` growth gated by supply: `pop += grow · supply · (potential − pop)`; starvation when `pop+troops > potential` with empty `food`
- [x] 2.3 Ecological cap: a player's supportable `pop+troops` = sum of `potential` over owned+supplied tiles (per-player `groupBy` scalar); overshoot starves toward it
- [x] 2.4 Organic border expansion: owned tiles claim adjacent supplied, nonzero-potential neutral tiles, rate ∝ pusher surplus × target potential; stalls at desert/frost/supply limit
- [x] 2.5 Seasonal pressure: verify winter potential drop + food-store buffer + frost-zone starvation emerge from the existing seasonal temperature

## 3. Mobilization + directed movement + combat

- [x] 3.1 Mobilize/demobilize: `pop ↔ troops` conversion (scripted/brush), reducing food production while mobilized
- [x] 3.2 Directed troop flow toward a target along the supply gradient; attrition where supply is low
- [x] 3.3 Deterministic attrition combat at contested tiles: attack (massed adjacent troops × supply factor) vs defense (troops + militia·pop + terrain defense); proportional losses; capture above the margin (hysteresis)
- [x] 3.4 Staging-capacity cap on massed attack strength (no unsupported doomstacks)
- [x] 3.5 Terrain defense bonus table (mountains, river crossings) feeding the defense term
- [x] 3.6 Document the stochastic combat alternative as a commented, non-compiled `.wesl` variant (or a design note) so it can be swapped in for A/B testing — NOT wired into the active pipeline

## 4. Scripted players + tuning surface

- [x] 4.1 Scripted-player driver: seed 2+ players, each founding, expanding toward a direction, mobilizing, and attacking on a schedule/brush, so frontlines form
- [x] 4.2 Params for every rate (growth, supply decay + terrain costs, mobilize/demob, attrition, capture margin, militia fraction, terrain defense, dev threshold) as lab sliders
- [x] 4.3 Per-player scalars: total pop, total troops, supportable ceiling, owned potential; and the Age-II readiness flag

## 5. Views + verification

- [x] 5.1 Views: `empire` (owner-colored territory over the terrain), `potential`, `supply`, `population`, `troops`, `food`, `frontline` (contested pressure)
- [x] 5.2 `.claude/skills/run-openfront/` script: drive 2+ scripted players on a real-climate map; assert the loop occurs — settlements grow into supplied catchments, borders stall at deserts/frost, a mobilized push captures contested fertile tiles, an unsupplied push withers, frontlines are stable (no per-tick flicker)
- [x] 5.3 Screenshot verification of: organic growth filling a valley, two empires meeting at a stable frontline, a supplied conquest vs a withered unsupplied one
- [x] 5.4 tsc + lint clean; lab systems (world, settlement, grazing, territory) regression-checked
