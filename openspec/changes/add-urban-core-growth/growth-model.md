# Growth model — farms and cities as seeds that mature

This is the design reference for the Tribal-age spatial economy: **farms and cities
are seeds you place, and they grow on their own, driven by the terrain layers.**
It grounds every rule in the crop-science / urban-growth literature (PDFs and OCR
in `papers/ocr/`) and ties each term to a concrete map layer, `Config.food()` knob,
and code symbol. The OpenSpec deltas (`specs/*/spec.md`) are the normative version;
this file is the "why", the math, and the citations.

## The player's loop

1. You place **Farmland** seeds and **Settlement** seeds — one tile each, mutually
   exclusive (a tile is farm **or** city, never both, and neither ever converts the
   other; `add-urban-core-growth/specs/tribal-buildings`).
2. **Farms mature in place**, slowly, driven by the climate under them (temperature,
   humidity, hydrology). A farm on good ground ripens into a productive field; a farm
   in the wrong biome crawls or withers. You don't micromanage it — _where_ you put it
   is the decision.
3. A mature farm radiates a **food-shed**: a soft potential field of "this land is fed".
4. A **Settlement** sitting in a rich food-shed **grows into a city** — its urban
   density thickens and spreads outward from that seed, locally and independently of
   your other settlements. Density is population and is the land you actually hold.
5. Cities need food; the food-shed multiplies their growth continuously. Starve them
   and they stall, then recede.

Every mechanic gates on `game.hasLayers()`; classic (unlayered) maps stay byte-identical
vanilla.

---

## Part 1 — Farms: seed, mature, yield

A `Farmland` unit is no longer a fixed producer. It carries a **maturity**
`M ∈ [0,1]` that advances each tick, driven by the climate on its tile. This is the
crop-growth core, assembled from four papers.

### 1a. Climate suitability per tile (Liebig's Law of the Minimum)

The three environmental staves, each normalised to `[0,1]` from a map layer:

| Factor    | Source layer                                | Curve                                                                                               | Paper                               |
| --------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `f_temp`  | `temperature` (0..255)                      | **GDD band**: 0 below a base temp, ramps to 1 across the optimal band, plateaus above an upper temp | McMaster & Wilhelm 1997             |
| `f_water` | `water` (hydrology) blended with `humidity` | **AquaCrop Ks**: 1 above an upper-moisture threshold, 0 at wilting, convex/linear between           | Raes et al. 2009                    |
| `f_soil`  | `crop` (fertility)                          | direct — the FAO land-suitability of the ground itself (S1…N)                                       | FAO _Framework for Land Evaluation_ |

Combined by the **law of the minimum** — growth runs at the rate of the _scarcest_
factor, not their sum or product, so one bad input can't be bought back by surplus in
another:

```
suitability = min(f_temp, f_water, f_soil)          # Liebig's shortest stave
```

- **GDD** (McMaster & Wilhelm 1997, `papers/ocr/PII_ S0168-1923(97)00027-0`): the
  canonical development-rate model `GDD = clamp((T_max+T_min)/2, T_base, T_upper) − T_base`.
  We have one temperature value per tile, so `f_temp` is that clamped-and-normalised
  ramp: cold ground develops nothing, an optimal band develops fastest, extreme heat
  plateaus (does not accelerate further).
- **Liebig** (`papers/ocr/Liebig's law of the minimum`): the barrel whose capacity is
  its shortest stave. The Wikipedia formulation uses `min` of Michaelis–Menten terms;
  we use the plain `min` of the three normalised factors.
- **AquaCrop Ks** (`papers/ocr/agronj2008_0140s…`, Raes et al. 2009): water stress is a
  coefficient `Ks ∈ [0,1]` — 1 when soil water is above an upper threshold, 0 below the
  wilting point, convex between. Our `f_water` is that curve over the `water`+`humidity`
  layers.

### 1b. Maturation curve (Gompertz sigmoid, gated by climate)

Maturity advances on a **Gompertz** sigmoid — slow at the start, accelerating, then a
long asymptotic approach to a ceiling. Same sigmoid family as the city curve, so farms
and cities share one growth primitive.

```
ΔM = farmGrowthRate · gompertzSlope(M) · suitability
```

- **Gompertz** (`papers/ocr/Gompertz function`, and the Unified-Richards addition):
  `f(t) = a · e^(−b·e^(−ct))`, ODE form `M' = c · M · ln(1/M)` (with ceiling `a = 1`).
  Chosen over the symmetric logistic because real canopy growth approaches its ceiling
  _gradually_ (the paper's key distinction), which reads better for "a field slowly
  perfecting itself." `gompertzSlope(M) = M · ln(1/M)`, peaking near `M ≈ 1/e`.
- **Senescence**: if `suitability` collapses (drought, cold snap from a changed layer,
  or later: a lost water corridor), a farm in a hostile tile **loses** maturity —
  `ΔM < 0` — mirroring AquaCrop's canopy decline (CDC). A farm placed in the wrong
  biome dies back slowly instead of sitting fossilised.

### 1c. Yield (AquaCrop biomass → harvest, collapsed)

AquaCrop builds yield as `biomass = WP* × transpiration`, then `yield = HI × biomass`.
Collapsed to one per-tile expression:

```
farmYield = M · f_soil · farmYieldMilli          # maturity (canopy) × fertility ceiling
```

A half-grown farm on rich soil out-yields a mature farm on marginal soil, and both are
capped by the `f_soil` stave — exactly Liebig again, now on output. This replaces the
old flat `crop × level × district × supplyQuality` production term in
`FoodEconomy.foodTick`; the **maturity factor `M`** is what's new.

---

## Part 2 — The food-shed (a second, separate supply field)

Two independent fields coexist on layered maps:

| Field                                 | Sources                                | Governs                                 | Code                |
| ------------------------------------- | -------------------------------------- | --------------------------------------- | ------------------- |
| **Military supply** (kept, unchanged) | Settlements                            | troop reach, war attrition, expansion   | `SupplyField.ts`    |
| **Food-shed** (new)                   | **Farmland**, weighted by maturity `M` | how fast a settlement grows into a city | `FoodShed.ts` (new) |

The food-shed is a **soft** potential — the decay you chose — summed over the player's
farms:

```
foodShed(tile) = Σ_farms  M_farm · 1 / (1 + (d/foodShedRadius)^foodShedPower)
```

clamped to `[0,1]`. `d` is distance from the farm; a settlement next to mature farms
sits in high potential, one out past the decay tail sits in ~0. Maturity weights it, so
a freshly-placed farm barely feeds anything until it ripens — the positive-feedback delay
that makes farm-tending matter.

This reuses the exact decay form already proven for military supply
(`supplyQualityFromDistance`: `1/(1+(d/r)^p)`), so the two fields are mathematically
the same shape with different sources and radii. Roads/connectors (later) will let
food-shed potential travel along arteries instead of pure distance.

---

## Part 3 — Cities: many seeds, each growing locally

A `Settlement` is a **density seed**. You place as many as you want; each is an
independent local growth centre — density thickens and spreads outward from _that_ seed,
**not** from one global field. (This is the change from the current single-`core`
hybrid.)

### 3a. Population is a living demographic; the city tracks it

The population is modelled as **agents with an average lifespan** — an aggregate
birth/death process (in `FoodEconomy.foodTick`), not a fixed cap. Each tick:

```
capacity   = productionMilli / idleConsumptionMilli     # food-supported people
fedRatio   = fraction of the population's need met       # 1 = fed, →0 = starving
surplusRatio = productionMilli / needMilli               # >1 = food surplus

deaths  = pop · (1/avgLifespanTicks) / max(minFedForLife, fedRatio)   # old age, ×2 at half food
births  = pop · baseBirthRate · min(birthSurplusCap, surplusRatio)    # up to 2× at ≥200% food
births  = min(births, capacity − pop)                                 # never breed past the food
```

- **Deaths** are two streams. **Old age** (`1/avgLifespanTicks`) thins the **civilian
  population** (the idle troop pool) — with a 10-second life this is ~1% per tick, high
  churn, but it must NOT evaporate an army in the field. **Starvation** kills **everyone**
  (idle + deployed, no famine shelter) on top of old age: as food falls the effective
  lifespan shortens — half the food halves the life (doubles death), floored at
  `minFedForLife`. (Your "50% less food ⇒ 50% impact, capping at 100%.")
- **Births** rise with food surplus — 1× at break-even, up to `birthSurplusCap` (2×) at
  ≥200% food, 0 with no food — and are **clamped to the food headroom** so the population
  approaches its food-supported size and holds, rather than overshooting into famine.
- Births/deaths carry a fractional accumulator so small populations still change smoothly.

The **city footprint follows the living population**: `targetTiles = floor(population /
popPerDensity)`. Cities grow near nuclei as people are born and **raze tile-by-tile as
people die** — houses follow heads. When the whole population is gone the last tile goes
with it, and **the nation is eliminated even if it still holds land** (its territory
reverts to neutral). `popPerDensity` is the urban density (people per city tile); at
`tileKm = 1` a tile is 1 km², so a full tile is ~1000 people/km² (a real town) and a city
is a cluster of many tiles — granular enough for the localized-push model.

**Centers are uncapped:** a Settlement is a growth nucleus you may place freely. Spamming
them is pointless — the city footprint is bounded by _population_, so extra empty nuclei
just spread the same people thinner. Bots found a new nucleus only when their population
has outgrown the existing ones.

> **Known tension:** troops are _both_ the population and the army, and vanilla expansion
> still spends troops to claim land — so a fast `baseBirthRate` (needed to refill the pool
> against that drain) can fuel snowball. The real fix is the deferred pivot (territory by
> influence diffusion, troops for war only); until then `baseBirthRate` trades
> population-liveness against snowball and is a sweep knob.

<details><summary>superseded: earlier food-capacity bound</summary>

Before demographics, `targetTiles = max(seedTiles, floor(capacity/popPerDensity))` bounded
the city directly by food capacity, and settlements were force-seeded as city tiles. The
demographic model replaces that: population (not capacity) drives the footprint, so cities
genuinely shrink and vanish as people die.

</details>

The city grows toward `targetTiles` a **paced** few tiles per tick
(`urbanGrowthRate · gap`, min one), and **razes tiles from the outer edge** as the
population falls below what fills them — nothing is protected, so a dead nation's city
vanishes completely.

### 3b. Placement — a **binary, contiguous** cellular automaton over **per-tile people**

**Each tile stores its population** — the actual number of people living on it, `0 …
popPerDensity` (a full tile holds `popPerDensity` people). This is the `density` field: no
longer a binary "city/not" marker but a real per-tile head-count, so a future
movement/combat layer can draw people from, and fight over, _specific_ tiles. `urbanArea =
Σ people / popPerDensity`. Growth fills tiles to full and is contiguous (a new tile only
4-adjacent to an existing city tile — no satellites); the field _supports_ partial values
(for when people are later moved out of a tile), growth just produces full tiles for now.

> **This is step one of localized combat.** The map now knows _where_ your people are, not
> just how many. Next (chosen: **drag-vector** UX): drag from your land toward a target to
> mobilize the nearby tiles' people and march them — reinforcing a friendly tile or
> invading an enemy one, where they fight that tile's people. Territory becomes "where your
> people are." Not built yet — this change just makes the per-tile population real.

Each tick `addCityTiles` places the paced number of whole tiles, choosing each from the
contiguous frontier by **suitability × food-shed gate**
`(w_food·crop + w_water·… − w_cong·congestion) · min(1, wFoodShed·foodShed)`:

- **Food-shed gate:** a settlement with no nearby mature farms has ~0 food-shed → its
  frontier is un-buildable → it stays a hamlet, while a farm-ringed settlement grows.
  This is the per-seed locality — each settlement grows from its own surroundings.
- **Suitability** steers the front toward fertile, freshwater, coastal land.

Following Marquis & Barthelemy (suitability drives _where_ the front advances); the
binary/contiguous, food-bounded rule is the classic urban-CA form. The population growing
under food limits gives the emergent S-curve (Wang et al.) that the area then tracks.

### 3c. Mutual exclusivity, no conversion

`Settlement` cannot be placed on a tile with density from farming, `Farmland` cannot be
placed on a tile carrying urban density, and neither ever rewrites the other. The
scarcity of tiles _is_ the strategy: you choose which ground becomes food and which
becomes city. (Farm↔city _spatial_ collision as both spread is deferred — see below.)

---

## Config knobs (all in `Config.food()`)

New:

| Knob                                                                    | Meaning                                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `farmGrowthRate`                                                        | Gompertz base rate — how fast a well-sited farm ripens                 |
| `tempBaseN`, `tempOptLoN`, `tempOptHiN`, `tempMaxN`                     | GDD band edges on the normalised `temperature` layer                   |
| `waterWiltN`, `waterFullN`                                              | AquaCrop Ks thresholds on the blended `water`+`humidity` signal        |
| `humidityWeight`                                                        | blend of `humidity` into the moisture signal vs `water`                |
| `farmYieldMilli`                                                        | yield scale (replaces the flat production term's constant)             |
| `foodShedRadius`, `foodShedPower`                                       | soft-decay food-shed shape (mirrors `supplyRadius`/`supplyDecayPower`) |
| `wFoodShed`                                                             | weight of the food-shed term in urban suitability / K                  |
| `avgLifespanTicks`, `baseBirthRate`, `birthSurplusCap`, `minFedForLife` | demographics: births/deaths, food-modulated                            |

Re-tuned for the demographic, binary CA:

| Knob               | Value | Meaning                                                              |
| ------------------ | ----- | -------------------------------------------------------------------- |
| `popPerDensity`    | 1000  | people on a full city tile → 1000/km² at tileKm=1 (a town density)   |
| `farmYieldMilli`   | 45000 | food per mature farm — sets the food-supported population            |
| `tileKm`           | 1     | 1 km² per tile — a neighbourhood; a city is a cluster of many tiles  |
| `avgLifespanTicks` | 100   | one life ≈ 10 s; baseline death `1/100` per tick (high churn)        |
| `baseBirthRate`    | 0.02  | how fast the population refills toward food capacity (snowball knob) |
| `birthSurplusCap`  | 2     | births up to 2× at ≥200% food                                        |
| `minFedForLife`    | 0.05  | fed-ratio floor so full starvation is finite                         |
| `startPopulation`  | 2000  | a young nation, fed by its (mature) starter farms                    |

Kept: `wFood/wWater/wShore/wLogi/wCong`, `basePopulation`,
`urbanGrowthRate`, the storage/decay knobs, and the whole military
`supplyRadius`/`supplyDecayPower` family.

Removed: `dispersalRate` (no satellites), `densityStepMilli` (tiles fill fully),
`urbanYieldMilli` (farms feed people, not the city), `startingCenters`/`peoplePerCenter`/
`maxCenters` (centers uncapped), and `surplusForFullGrowth`/`starvationDeathFraction`
(the old growth/starvation, replaced by demographics).

---

## Deferred (explicitly out of scope now)

- **Tech / metal / oil raising density ceilings** — the ceiling term `K` leaves a hook so
  a later age just lifts it; no plumbing now.
- **Farm footprint spread** — for now one farm seed = one maturing tile; you place more
  seeds to cover more ground. Letting a farm's cultivated area _spread_ spatially
  (Skellam 1952 random-dispersal / Fisher–KPP travelling wave, `papers/ocr/Skellam-1952`)
  is the natural next step, but it collides with spreading cities for tiles — we take that
  up once the two-field model is proven.
- **Roads / connectors (logistics arteries)** — will let both the military-supply and
  food-shed fields travel along built corridors instead of pure distance.

## Sources (`papers/ocr/`)

- **McMaster, G.S. & Wilhelm, W.W. (1997)** — _Growing degree-days: one equation, two
  interpretations._ Agric. For. Meteorol. → temperature→development-rate (`f_temp`).
- **Raes, D. et al. (2009)** — _AquaCrop… II. Main algorithms and software description._
  Agron. J. → water-stress `Ks`, biomass = WP\*×transpiration, yield = HI×biomass, canopy
  senescence.
- **Sprengel / von Liebig — Law of the Minimum** → `suitability = min(factors)`.
- **Gompertz function** (+ _Unified-Richards Gompertz_ addition) → maturation sigmoid.
- **FAO — _A Framework for Land Evaluation_** → land-suitability classes behind `f_soil`.
- **FAO-56 dual crop coefficient** (`FAO_56_Dual_Crop_Coefficient_Method_for`),
  **Monteith 1977** (`rstb.1977.0140`) → background/validation for `Ks` and light-use
  efficiency; not load-bearing.
- **Skellam, J.G. (1952)** — _Random dispersal in theoretical populations_ → deferred
  farm-footprint spread.
- Urban side (already in `UrbanGrowth.ts`): **Wang et al.** logistic S-curve, **Marquis &
  Barthelemy** suitability-CA density-gradient.
